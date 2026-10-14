export type TrackItem = {
  id: number
  isAnchor: boolean
  label?: string
  href?: string
}

export type Section = {
  label: string
  href: string
  trackCount: number
}
