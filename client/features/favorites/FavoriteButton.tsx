'use client'

import Favorite from '@mui/icons-material/Favorite'
import FavoriteBorder from '@mui/icons-material/FavoriteBorder'
import { IconButton, Tooltip } from '@mui/material'
import { useRouter } from 'next/navigation'
import { useViewer } from '@/features/auth/ViewerProvider'
import { useFavorites } from './FavoritesProvider'

export function FavoriteButton({ trackId, name }: { trackId: string; name: string }) {
  const { user, error } = useViewer()
  const { ids, pending, loading, toggle } = useFavorites()
  const router = useRouter()
  const favorite = ids.has(trackId)
  const label = !user ? 'Войти, чтобы добавить в избранное' : favorite ? 'Убрать из избранного' : 'Добавить в избранное'
  return <Tooltip title={label}>
    <span><IconButton size="small" color={favorite ? 'primary' : 'default'}
      disabled={loading || error || pending.has(trackId)} aria-label={`${label}: ${name}`} aria-pressed={favorite}
      onClick={() => {
        if (!user) router.push(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`)
        else void toggle(trackId)
      }}>
      {favorite ? <Favorite fontSize="small" /> : <FavoriteBorder fontSize="small" />}
    </IconButton></span>
  </Tooltip>
}
