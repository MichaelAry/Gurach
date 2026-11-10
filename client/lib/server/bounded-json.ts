import 'server-only'
export async function readBoundedJson(request: Request, limit = 64 * 1024): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader) throw new SyntaxError('Missing body')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new RangeError('Payload too large')
      chunks.push(value)
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))
  } finally { await reader.cancel().catch(() => undefined) }
}
