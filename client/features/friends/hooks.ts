'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useViewer } from '@/features/auth/ViewerProvider'
import { acceptFriendRequest, blockUser, cancelOrRejectRequest, getBlockedUsers, getFriendRequests, getFriends, getFriendsSummary, removeFriend, searchUsers, sendFriendRequest, SocialApiError, unblockUser, type FriendListItem, type FriendStatus, type ListKind, type UserProfile } from './api'

type Page<T> = { items: T[]; nextCursor: string | null }
type PageState<T> = { key: string; requestKey: string; page: Page<T> | null; error: string | null; expired: boolean }
const message = (error: unknown) => error instanceof Error ? error.message : 'Сетевая ошибка.'

function useSocialPage<T>(identity: string, loader: (cursor: string | null, signal: AbortSignal) => Promise<Page<T>>, enabled = true) {
  const { user } = useViewer()
  const actorId = user?.id ?? ''
  const [version, setVersion] = useState(0)
  const key = `${actorId}:${identity}:${version}`
  const [position, setPosition] = useState<{ key: string; cursor: string | null; attempt: number }>({ key: '', cursor: null, attempt: 0 })
  const cursor = position.key === key ? position.cursor : null
  const requestKey = `${key}:${cursor ?? ''}:${position.key === key ? position.attempt : 0}`
  const [state, setState] = useState<PageState<T>>({ key: '', requestKey: '', page: null, error: null, expired: false })
  const lock = useRef(false)
  useEffect(() => {
    if (!enabled || !actorId) return
    const controller = new AbortController()
    lock.current = true
    void loader(cursor, controller.signal).then((page) => {
      if (!controller.signal.aborted) setState((old) => ({ key, requestKey,
        page: cursor && old.key === key ? { items: [...(old.page?.items ?? []), ...page.items], nextCursor: page.nextCursor } : page,
        error: null, expired: false,
      }))
    }).catch((error: unknown) => {
      const expired = error instanceof SocialApiError && error.status === 401
      if (!controller.signal.aborted) setState((old) => ({ key, requestKey, page: !expired && old.key === key ? old.page : null, error: message(error), expired }))
    }).finally(() => { if (!controller.signal.aborted) lock.current = false })
    return () => { controller.abort(); lock.current = false }
  }, [key, requestKey, cursor, actorId, enabled, loader])
  const current = state.key === key && enabled && !!actorId
  const pending = enabled && !!actorId && state.requestKey !== requestKey
  return {
    items: current && !state.expired ? state.page?.items ?? [] : [],
    nextCursor: current ? state.page?.nextCursor ?? null : null,
    pending, error: current ? state.error : null, expired: current && state.expired,
    refresh: useCallback(() => setVersion((old) => old + 1), []),
    loadMore: () => {
      if (!current || pending || lock.current || !state.page?.nextCursor) return
      lock.current = true
      setPosition((old) => ({ key, cursor: state.page!.nextCursor, attempt: old.attempt + 1 }))
    },
  }
}
export function useFriends(kind: 'friends' | 'blocks' = 'friends') {
  const loader = useCallback((cursor: string | null, signal: AbortSignal) => kind === 'blocks' ? getBlockedUsers(cursor, signal) : getFriends(cursor, signal), [kind])
  return useSocialPage<FriendListItem>(kind, loader)
}
export function useFriendRequests(direction: 'incoming' | 'outgoing') {
  const loader = useCallback((cursor: string | null, signal: AbortSignal) => getFriendRequests(direction, cursor, signal), [direction])
  return useSocialPage<FriendListItem>(direction, loader)
}
export function useUserSearch(query: string, revision: number) {
  const [debounced, setDebounced] = useState('')
  const normalized = query.trim().toLowerCase()
  useEffect(() => { const timer = setTimeout(() => setDebounced(normalized), 300); return () => clearTimeout(timer) }, [normalized])
  const valid = /^[a-z0-9_]{2,32}$/.test(normalized)
  const loader = useCallback((cursor: string | null, signal: AbortSignal) => searchUsers(debounced, cursor, signal), [debounced])
  const page = useSocialPage<UserProfile>(`search:${debounced}:${revision}`, loader, valid && debounced === normalized)
  return { ...page, pending: page.pending || (valid && debounced !== normalized) }
}
export function useFriendsSummary(revision: number) {
  const { user } = useViewer()
  const actorId = user?.id
  const key = `${actorId}:${revision}`
  const [state, setState] = useState<{ key: string; data: Awaited<ReturnType<typeof getFriendsSummary>> | null; error: string | null }>({ key: '', data: null, error: null })
  useEffect(() => {
    if (!actorId) return
    const controller = new AbortController()
    void getFriendsSummary(controller.signal).then((data) => { if (!controller.signal.aborted) setState({ key, data, error: null }) })
      .catch((error: unknown) => { if (!controller.signal.aborted) setState({ key, data: null, error: message(error) }) })
    return () => controller.abort()
  }, [actorId, key])
  return state.key === key ? state : { data: null, error: null }
}
export type FriendAction = 'send' | 'accept' | 'cancel' | 'remove' | 'block' | 'unblock'
export function affectedLists(status: FriendStatus, action: FriendAction): ListKind[] {
  const before: ListKind[] = status === 'friends' ? ['friends'] : status === 'incoming' ? ['incoming'] : status === 'outgoing' ? ['outgoing'] : status === 'blocked_by_me' ? ['blocks'] : []
  return [...new Set([...before, ...(action === 'send' ? ['outgoing' as const] : action === 'accept' ? ['friends' as const] : action === 'block' ? ['blocks' as const] : [])])]
}
export function useFriendAction(onChanged: (profile: UserProfile, action: FriendAction, conflict: boolean) => void) {
  const { user } = useViewer()
  const actorId = user?.id
  const active = useRef(new Map<string, AbortController>())
  const [pending, setPending] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    const requests = active.current
    return () => { for (const controller of requests.values()) controller.abort(); requests.clear() }
  }, [actorId])
  async function run(profile: UserProfile, action: FriendAction) {
    if (!actorId || active.current.has(profile.id)) return
    const controller = new AbortController()
    active.current.set(profile.id, controller)
    setPending([...active.current.keys()]); setError(null)
    const state = profile.relationship
    try {
      if (action === 'send') await sendFriendRequest(profile.id, controller.signal)
      else if (action === 'accept' && state.requestId) await acceptFriendRequest(state.requestId, controller.signal)
      else if (action === 'cancel' && state.requestId) await cancelOrRejectRequest(state.requestId, controller.signal)
      else if (action === 'remove' && state.revision !== null) await removeFriend(profile.id, state.revision, controller.signal)
      else if (action === 'block') await blockUser(profile.id, state.revision ?? 0, controller.signal)
      else if (action === 'unblock' && state.revision !== null) await unblockUser(profile.id, state.revision, controller.signal)
      else throw new Error('Состояние изменилось. Обновите страницу.')
      if (!controller.signal.aborted) onChanged(profile, action, false)
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        setExpired(error instanceof SocialApiError && error.status === 401)
        setError(message(error))
        if (error instanceof SocialApiError && error.status === 409) onChanged(profile, action, true)
      }
    } finally {
      if (active.current.get(profile.id) === controller) active.current.delete(profile.id)
      if (!controller.signal.aborted) setPending([...active.current.keys()])
    }
  }
  return { run, pending, error, expired }
}
