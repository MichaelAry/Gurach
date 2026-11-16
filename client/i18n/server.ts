import 'server-only'
import { cache } from 'react'
import { connection } from 'next/server'
import { cookies } from 'next/headers'
import { getViewerSession, sessionToken } from '@/lib/server/session'
import { isLocale, normalizeLocale, uiTextFor } from './messages'
export const getLocale = cache(async () => {
  const saved = (await cookies()).get('NEXT_LOCALE')?.value
  if (isLocale(saved)) return saved
  if (await sessionToken()) {
    await connection()
    try { return normalizeLocale((await getViewerSession())?.user?.preferredLocale) } catch { /* Default locale remains available during outages. */ }
  }
  return 'en'
})
export async function getText() { return uiTextFor(await getLocale()) }
