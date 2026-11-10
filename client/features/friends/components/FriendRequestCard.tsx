'use client'
import type { FriendListItem } from '../api'
import { FriendCard } from './FriendCard'
import type { FriendActionsProps } from './FriendActions'
export function FriendRequestCard(props: FriendActionsProps & { profile: FriendListItem }) {
  return <FriendCard {...props} requestedAt={props.profile.requestedAt} />
}
