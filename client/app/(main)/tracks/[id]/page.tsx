// app/(main)/tracks/[id]/page.tsx
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { getTrack } from '@/features/tracks/api/getTrack'
import { PlayTrackButton } from '@/features/tracks/components/PlayTrackButton'

interface TrackPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: TrackPageProps) {
  const { id } = await params
  try {
    const track = await getTrack(id)
    if (!track) return { title: 'Track not found' }

    return {
      title: `${track.name} — ${track.artist ?? ''}`.trim(),
      openGraph: {
        ...(track.picture ? { images: [track.picture] } : {}),
        description: `${track.name} by ${track.artist ?? ''}`.trim(),
      },
    }
  } catch {
    // Метадата не должна ронять рендер страницы
    return { title: 'Track' }
  }
}

export default async function TrackPage({ params }: TrackPageProps) {
  const { id } = await params
  const track = await getTrack(id)
  if (!track) notFound()

  const comments = track.comments ?? []
  const listensFormatted = new Intl.NumberFormat('ru-RU').format(track.listens)

  return (
    <Box sx={{ px: 3, pb: 2 }}>
      <Card sx={{ p: 2, maxWidth: 680 }}>
        <Stack direction="column" spacing={3}>
          {/* У старых треков в БД picture может не быть — рендерим только при наличии */}
          {track.picture ? (
            <Box
              component="img"
              src={track.picture}
              alt={track.name}
              sx={{
                width: '100%',
                height: 200,
                borderRadius: 2,
                objectFit: 'cover',
                my: 2,
              }}
            />
          ) : (
            <Box
              sx={{
                height: 200,
                borderRadius: 2,
                bgcolor: 'background.default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                my: 2,
                fontSize: '2rem',
              }}
            >
              ♪
            </Box>
          )}

          <Stack
            direction="row"
            sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}
            spacing={2}
          >
            <Typography variant="h2" component="h1" sx={{ fontSize: '2rem' }}>
              {track.name}
            </Typography>
            <Typography variant="h6" color="text.secondary">
              {track.artist}
            </Typography>
          </Stack>

          <Typography color="text.secondary">{listensFormatted} прослушиваний</Typography>

          {/* Кнопка проигрывания — клиентский компонент из контекста плеера */}
          <Box>
            <PlayTrackButton track={track} />
          </Box>

          <Box sx={{ my: 2 }}>
            <Typography color="text.secondary" sx={{ fontSize: '0.875rem', mb: 1 }}>
              Сейчас играет
            </Typography>
            <Box
              sx={{
                height: 40,
                bgcolor: 'background.paper',
                borderRadius: 2,
              }}
            />
          </Box>

          <Accordion sx={{ mt: 2, '&:before': { display: 'none' } }}>
            <AccordionSummary sx={{ px: 0, fontWeight: 500 }}>
              <Typography>Лирика</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0 }}>
              <Typography color="text.primary" sx={{ whiteSpace: 'pre-wrap' }}>
                {track.lyrics || 'Лирика недоступна'}
              </Typography>
            </AccordionDetails>
          </Accordion>

          {comments.length > 0 ? (
            <Stack direction="column" spacing={2} sx={{ my: 2 }}>
              <Typography variant="h6" sx={{ fontSize: '0.875rem' }}>
                Комментарии ({comments.length})
              </Typography>

              {comments.map((comment) => (
                <Box
                  key={comment._id}
                  sx={{ p: 1, bgcolor: 'background.default', borderRadius: 1 }}
                >
                  <Stack
                    direction="row"
                    sx={{ justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <Typography color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                      {comment.username}
                    </Typography>
                    <Typography color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                      {comment.createdAt
                        ? new Date(comment.createdAt).toLocaleString('ru-RU')
                        : ''}
                    </Typography>
                  </Stack>
                  <Typography sx={{ fontSize: '0.875rem', py: 1 }}>{comment.text}</Typography>
                </Box>
              ))}
            </Stack>
          ) : (
            <Typography color="text.secondary" sx={{ fontSize: '0.875rem' }}>
              Пока нет комментариев. Будь первым!
            </Typography>
          )}

          <Box sx={{ my: 2 }}>
            <Button variant="outlined" fullWidth href="#">
              Добавить комментарий
            </Button>
          </Box>
        </Stack>
      </Card>
    </Box>
  )
}

/**
 * Скелетон на время, пока `getTrack` ходит в Nest.
 * Благодаря Suspense-обёртке Next.js стримит страницу:
 * статическая оболочка приходит сразу, данные — как придут.
 *
 * Чтобы это заработало, оберни <TrackPage /> в Suspense на уровне layout
 * или используй loading.tsx рядом с page.tsx (см. п.6).
 */
export function TrackSkeleton() {
  return (
    <Box sx={{ px: 3, pb: 2 }}>
      <Card sx={{ p: 2, maxWidth: 680 }}>
        <Stack direction="column" spacing={3}>
          <Skeleton variant="rounded" height={200} />
          <Skeleton variant="text" width="60%" height={48} />
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" width="30%" />
        </Stack>
      </Card>
    </Box>
  )
}

// Экспорт Suspense-обёртки не нужен — используем файл loading.tsx (п.6).
// Suspense оставлен в импортах, если решишь оборачивать вручную.
void Suspense
