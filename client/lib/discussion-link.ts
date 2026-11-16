/** Track discussion deep links resolve comments beyond the initial page. */
export function discussionLink(trackId: string, commentId: string) {
  return `/tracks/${trackId}#comment-${commentId}`
}
