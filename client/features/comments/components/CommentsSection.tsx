'use client'
import { useLocale, useText, useMessage } from '@/i18n/LocaleProvider'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useViewer } from '@/features/auth/ViewerProvider'
import { Alert, Box, Button, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material'
import type { CommentResponse } from '../types'
import { useCommentPages } from '../hooks/useCommentPages'

function CommentCard({ comment, canDelete, deleting, onDelete }: {
  comment: CommentResponse; canDelete: boolean; deleting: boolean; onDelete: () => void
}) {
  const { locale } = useLocale()

  const lt = useText()

  return (
    <Box id={`comment-${comment._id}`} tabIndex={-1} sx={{ p: 1.5, bgcolor: 'background.default', borderRadius: 1, '&:target': { outline: '2px solid', outlineColor: 'primary.main' } }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Typography color="text.secondary" sx={{ fontSize: '0.75rem' }}>
          {comment.username}
          {comment.rating != null ? ` · ${comment.rating}/10` : ''}
        </Typography>
        <Typography color="text.secondary" sx={{ fontSize: '0.75rem', textAlign: 'right' }}>
          {comment.createdAt ? new Date(comment.createdAt).toLocaleString(locale) : lt('dateUnknown')}
        </Typography>
      </Stack>
      <Typography sx={{ fontSize: '0.875rem', py: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {comment.text}
      </Typography>
      {canDelete && <Button size="small" disabled={deleting} onClick={onDelete}>{lt('deleteComment')}</Button>}
    </Box>
  )
}

export function CommentsSection({ trackId }: { trackId: string }) {
  const resolve = useMessage()

  const lt = useText()

  const { user, loading: viewerLoading, error: viewerError, confirmed, isConfirmed } = useViewer()
  const { items, nextCursor, loading, loadingMore, error, loadMore, retry,
    addComment, deleteComment, mutating, mutationError, targetError, retryTarget } = useCommentPages(trackId)
  const [text, setText] = useState('')
  const [rating, setRating] = useState('')
  const [returnTo, setReturnTo] = useState(`/tracks/${trackId}`)
  useEffect(() => {
    const update = () => setReturnTo(window.location.pathname + window.location.search + window.location.hash)
    update()
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [trackId])
  const loginHref = `/login?returnTo=${encodeURIComponent(returnTo)}`

  return (
    <Box component="section" aria-labelledby="comments-heading" sx={{ my: 2 }}>
      <Typography id="comments-heading" component="h2" sx={{ fontSize: { xs: 24, sm: 28, md: 32 }, fontWeight: 500, mb: 3 }}>
        {lt('comments')}</Typography>

      {viewerError ? <Alert severity="error">{lt('couldNotCheckYourSessionRefreshThePage')}</Alert> : viewerLoading ? (
        <Typography role="status">{lt('checkingSession')}</Typography>
      ) : user ? (
        <Box component="form" sx={{ mb: 2 }} onSubmit={(event) => {
          event.preventDefault()
          if (!isConfirmed(user?.id ?? null) || !text.trim() || mutating) return
          void addComment({ text, ...(rating ? { rating: Number(rating) } : {}) }).then((success) => {
            if (success) { setText(''); setRating('') }
          })
        }}>
          <Stack spacing={1}>
            <TextField label={lt('comment')} multiline minRows={2} required value={text}
              disabled={!confirmed || mutating} slotProps={{ htmlInput: { maxLength: 5000 } }} onChange={(event) => setText(event.target.value)} />
            <TextField select label={lt('ratingOptional')} value={rating} disabled={!confirmed || mutating} onChange={(event) => setRating(event.target.value)}>
              <MenuItem value="">{lt('noRating')}</MenuItem>
              {Array.from({ length: 10 }, (_, index) => <MenuItem key={index + 1} value={String(index + 1)}>{index + 1}/10</MenuItem>)}
            </TextField>
            <Button type="submit" variant="outlined" disabled={!confirmed || mutating || loading || !text.trim()}>
              {mutating ? lt('saving') : lt('postComment')}
            </Button>
          </Stack>
        </Box>
      ) : (
        <Button component={Link} href={loginHref}>
          {lt('signInToComment')}</Button>
      )}
      {mutationError && <Alert severity="error" sx={{ mb: 2 }}>{resolve(mutationError)} <Link href={loginHref}>{lt('signInAgain')}</Link></Alert>}
      {targetError && <Alert severity="warning" action={<Button onClick={retryTarget}>{lt('tryAgain')}</Button>}>{resolve(targetError)}</Alert>}

      {loading && (
        <Stack direction="row" spacing={1} role="status" sx={{ alignItems: 'center', color: 'text.secondary' }}>
          <CircularProgress size={18} aria-label={lt('loadingComments')} />
          <Typography variant="body2">{lt('loadingComments142')}</Typography>
        </Stack>
      )}

      {!loading && error && items.length === 0 && (
        <Stack spacing={1}>
          <Alert severity="error">{resolve(error)}</Alert>
          <Button variant="outlined" onClick={retry} sx={{ alignSelf: 'flex-start' }}>{lt('tryAgain')}</Button>
        </Stack>
      )}

      {!loading && !error && items.length === 0 && (
        <Typography color="text.secondary" sx={{ fontSize: '0.875rem' }}>
          {lt('noCommentsYet')}</Typography>
      )}

      {items.length > 0 && (
        <Stack spacing={1.5}>
          {items.map((comment) => <CommentCard key={comment._id} comment={comment}
            canDelete={Boolean(confirmed && user && (user.role === 'admin' || user.id === comment.authorId))}
            deleting={mutating} onDelete={() => { if (isConfirmed(user?.id ?? null)) void deleteComment(comment._id) }} />)}
        </Stack>
      )}

      {!loading && error && items.length > 0 && <Alert severity="error" sx={{ mt: 2 }}>{resolve(error)}</Alert>}

      {!loading && !error && nextCursor && (
        <Button variant="outlined" onClick={() => void loadMore()} disabled={loadingMore} sx={{ mt: 2 }}>
          {loadingMore ? lt('loading') : lt('loadMoreComments')}
        </Button>
      )}
      {error && items.length > 0 && nextCursor && (
        <Button variant="outlined" onClick={() => void loadMore()} disabled={loadingMore} sx={{ mt: 2 }}>
          {loadingMore ? lt('loading') : lt('retryLoading')}
        </Button>
      )}
    </Box>
  )
}
