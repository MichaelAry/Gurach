import type { components } from '@/lib/api/schema'
import { formatApiError, readApiError } from '@/lib/api/error'
export type FriendRelationship = components['schemas']['FriendRelationship']
export type FriendStatus = FriendRelationship['status']
export type UserProfile = components['schemas']['SocialUserProfile']
export type FriendListItem = components['schemas']['FriendListItem']
export type FriendListPage = components['schemas']['FriendListPage']
export type UserSearchPage = components['schemas']['UserSearchPage']
export type FriendsSummary = components['schemas']['FriendsSummary']
export type ListKind = 'friends' | 'incoming' | 'outgoing' | 'blocks'
export class SocialApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly retryAfter: string | null) { super(message) }
}
async function request<T>(path: string, signal?: AbortSignal, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method, signal, credentials: 'same-origin', cache: 'no-store',
    headers: method === 'GET' ? {} : { 'X-Gurach-Request': '1', ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) {
    const error = await readApiError(response)
    const fallback = response.status === 401 ? 'Сессия истекла. Войдите снова.' : response.status === 404 ? 'Пользователь или заявка недоступны.' : 'Не удалось выполнить запрос.'
    const message = response.status === 401 ? fallback : formatApiError(error?.error ?? null, fallback)
    const retryAfter = response.headers.get('retry-after')
    throw new SocialApiError(response.status, response.status === 429 && retryAfter ? `${message} Повторите через ${retryAfter} сек.` : message, retryAfter)
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}
function pageQuery(cursor?: string | null, count = 20) { return new URLSearchParams({ count: String(count), ...(cursor ? { cursor } : {}) }) }
export function searchUsers(query: string, cursor?: string | null, signal?: AbortSignal) { return request<UserSearchPage>(`/users/search?${pageQuery(cursor)}&query=${encodeURIComponent(query)}`, signal) }
export function getUserProfile(username: string, signal?: AbortSignal) { return request<UserProfile>(`/users/by-name/${encodeURIComponent(username)}`, signal) }
export function getFriends(cursor?: string | null, signal?: AbortSignal, count = 20) { return request<FriendListPage>(`/friends?${pageQuery(cursor, count)}`, signal) }
export function getFriendRequests(direction: 'incoming' | 'outgoing', cursor?: string | null, signal?: AbortSignal) { return request<FriendListPage>(`/friends/requests?${pageQuery(cursor)}&direction=${direction}`, signal) }
export function getFriendsSummary(signal?: AbortSignal) { return request<FriendsSummary>('/friends/summary', signal) }
export function getBlockedUsers(cursor?: string | null, signal?: AbortSignal) { return request<FriendListPage>(`/friends/blocks?${pageQuery(cursor)}`, signal) }
export function sendFriendRequest(targetUserId: string, signal?: AbortSignal) { return request<FriendRelationship>('/friends/requests', signal, 'POST', { targetUserId }) }
export function acceptFriendRequest(requestId: string, signal?: AbortSignal) { return request<FriendRelationship>(`/friends/requests/${encodeURIComponent(requestId)}/accept`, signal, 'POST') }
export function cancelOrRejectRequest(requestId: string, signal?: AbortSignal) { return request<void>(`/friends/requests/${encodeURIComponent(requestId)}`, signal, 'DELETE') }
export function removeFriend(userId: string, expectedRevision: number, signal?: AbortSignal) { return request<void>(`/friends/${userId}?expectedRevision=${expectedRevision}`, signal, 'DELETE') }
export function blockUser(userId: string, expectedRevision: number, signal?: AbortSignal) { return request<void>(`/friends/blocks/${userId}?expectedRevision=${expectedRevision}`, signal, 'PUT') }
export function unblockUser(userId: string, expectedRevision: number, signal?: AbortSignal) { return request<void>(`/friends/blocks/${userId}?expectedRevision=${expectedRevision}`, signal, 'DELETE') }
