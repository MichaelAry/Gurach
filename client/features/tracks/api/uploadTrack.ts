import { message as localMessage } from '@/i18n/messages'
import { readApiError } from '@/lib/api/error'

export class UploadJobFailedError extends Error {}

export class DuplicateTrackError extends Error {
  constructor(readonly existingTrackId?: string, readonly duplicateReason: string = 'identity') {
    const explanations: Record<string, string> = {
      identity: localMessage('anActiveTrackWithThisTitleAndArtistAlready'),
      file_sha256: localMessage('thisAudioFileIsIdenticalByteForByteTo'),
      decoded_audio_sha256: localMessage('theAudioSamplesAndChannelsMatchAnExistingTrack'),
      chromaprint: localMessage('theDurationAndAudioFingerprintsMatchAlmostTheEntire'),
    }
    super(explanations[duplicateReason] ?? localMessage('theServerDetectedADuplicateOfAnExistingTrack'))
  }
}

const UPLOAD_ERRORS: Record<number, string> = {
  400: localMessage('checkTheTitleAudioFileAndCoverTheServer'),
  401: localMessage('yourSessionExpiredSignInAndUploadAgain'),
  403: localMessage('uploadingIsNotAllowedRefreshThePageAndSign'),
  409: localMessage('couldNotFinishUploadingBecauseOfAConflictCheck'),
  413: localMessage('theFilesAreTooLargeAudioMustBeNo'),
  415: localMessage('theFileFormatIsUnsupportedOrTheFileIs'),
  429: localMessage('theServerIsBusyOrUploadsAreTooFrequent'),
  502: localMessage('theUploadServerIsUnavailableTryAgainLaterCheck'),
  503: localMessage('uploadingIsTemporarilyUnavailableTryAgainLater'),
  504: localMessage('theRequestTimedOutCheckTheCatalogueTheTrack'),
}

export async function uploadTrack(body: FormData, signal: AbortSignal, background = false, onProgress?: (message: string) => void, onAccepted?: (operationId: string) => void): Promise<string> {
  let response: Response
  try {
    response = await fetch('/api/tracks', {
      method: 'POST', body, signal, credentials: 'same-origin',
      headers: { 'X-Gurach-Request': '1', ...(background ? { 'X-Gurach-Upload-Mode': 'background' } : {}) },
    })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error(localMessage('theConnectionWasInterruptedCheckYourConnectionAndThe'))
  }
  if (!response.ok) {
    if (response.status === 409) {
      const payload = await readApiError(response)
      if (payload?.error.code === 'TRACK_DUPLICATE') {
        const id = payload.error.existingTrackId
        throw new DuplicateTrackError(typeof id === 'string' && /^[a-f\d]{24}$/i.test(id) ? id.toLowerCase() : undefined, payload.error.duplicateReason)
      }
    }
    throw new Error(UPLOAD_ERRORS[response.status] ?? localMessage('couldNotUploadTheTrackTryAgainLater'))
  }
  if (response.status === 202) {
    const job = await response.json()
    if (!/^[a-f0-9-]{36}$/i.test(job?.operationId)) throw new Error(localMessage('theServerDidNotReturnAJobId'))
    onAccepted?.(job.operationId)
    return waitForUpload(job.operationId, signal, onProgress)
  }
  const track: unknown = await response.json().catch(() => null)
  if (!track || typeof track !== 'object' || !('_id' in track) || typeof track._id !== 'string' || !/^[a-f\d]{24}$/i.test(track._id)) {
    throw new Error(localMessage('theServerAcceptedTheUploadButDidNotReturn'))
  }
  return track._id.toLowerCase()
}

/** Polls the durable job only. Never resubmits the multipart upload. */
export async function waitForUpload(operationId: string, signal: AbortSignal, onProgress?: (message: string) => void): Promise<string> {
  onProgress?.(localMessage('filesAcceptedProcessingInTheBackground', { p0: operationId }))
  const deadline = Date.now() + 15 * 60_000
  while (!signal.aborted && Date.now() < deadline) {
    const response = await fetch(`/api/tracks/uploads/${encodeURIComponent(operationId)}`, { signal, credentials: 'same-origin', cache: 'no-store' })
    if (response.status === 404) throw new UploadJobFailedError(localMessage('jobIsUnavailable', { p0: operationId }))
    if (!response.ok) throw new Error(localMessage('couldNotGetTheStatusOfJobBackgroundProcessing', { p0: operationId }))
    const job = await response.json()
    if (job.status === 'published' && /^[a-f\d]{24}$/i.test(job.trackId)) return job.trackId.toLowerCase()
    if (job.status === 'failed' && job.errorCode === 'TRACK_DUPLICATE') {
      throw new DuplicateTrackError(typeof job.existingTrackId === 'string' && /^[a-f\d]{24}$/i.test(job.existingTrackId) ? job.existingTrackId : undefined, job.duplicateReason)
    }
    if (job.status === 'failed') throw new UploadJobFailedError(localMessage('processingFailedCheckTheCatalogueBeforeUploadingAgain', { p0: job.errorCode ?? 'media_failed' }))
    await new Promise<void>((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); reject(signal.reason) }
      const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve() }, 2000)
      signal.addEventListener('abort', cancel, { once: true })
      if (signal.aborted) cancel()
    })
  }
  signal.throwIfAborted()
  throw new Error(localMessage('jobIsStillRunningCheckTheCatalogueLater', { p0: operationId }))
}
