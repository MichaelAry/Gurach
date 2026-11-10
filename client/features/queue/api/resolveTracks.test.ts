import { afterEach, expect, it, vi } from 'vitest'
import { resolveTracks } from './resolveTracks'
afterEach(() => vi.unstubAllGlobals())
it('skips empty queues and sends one distinct bounded batch for duplicate occurrences', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ items: [] }))
  vi.stubGlobal('fetch', fetcher)
  expect(await resolveTracks([])).toEqual({ items: [] })
  expect(fetcher).not.toHaveBeenCalled()
  await resolveTracks(['a'.repeat(24), 'A'.repeat(24)])
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ ids: ['a'.repeat(24)] })
})
