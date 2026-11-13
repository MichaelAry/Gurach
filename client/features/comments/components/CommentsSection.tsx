'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useViewer } from '@/features/auth/ViewerProvider'
import { Alert, Box, Button, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material'
import type { CommentResponse } from '../types'
import { useCommentPages } from '../hooks/useCommentPages'

function CommentCard({ comment, canDelete, deleting, onDelete }: {
  comment: CommentResponse; canDelete: boolean; deleting: boolean; onDelete: () => void
}) {
  return (
    <Box id={`comment-${comment._id}`} tabIndex={-1} sx={{ p: 1.5, bgcolor: 'background.default', borderRadius: 1, '&:target': { outline: '2px solid', outlineColor: 'primary.main' } }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Typography color="text.secondary" sx={{ fontSize: '0.75rem' }}>
          {comment.username}
          {comment.rating != null ? ` · ${comment.rating}/10` : ''}
        </Typography>
        <Typography color="text.secondary" sx={{ fontSize: '0.75rem', textAlign: 'right' }}>
          {comment.createdAt ? new Date(comment.createdAt).toLocaleString('ru-RU') : 'Дата неизвестна'}
        </Typography>
      </Stack>
      <Typography sx={{ fontSize: '0.875rem', py: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {comment.text}
      </Typography>
      {canDelete && <Button size="small" disabled={deleting} onClick={onDelete}>Удалить комментарий</Button>}
    </Box>
  )
}

export function CommentsSection({ trackId }: { trackId: string }) {
  const { user, loading: viewerLoading, error: viewerError } = useViewer()
  const { items, nextCursor, loading, loadingMore, error, loadMore, retry,
    addComment, deleteComment, mutating, mutationError, targetError, retryTarget } = useCommentPages(trackId)
  const [text, setText] = useState('')
  const [rating, setRating] = useState('')
  const [returnTo, setReturnTo] = useState(`/tracks/${trackId}`)
  useEffect(() => {
    const update = () => setReturnTo(window.location.pathname + window.location.search + window.location.hash)
    update()
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [trackId])
  const loginHref = `/login?returnTo=${encodeURIComponent(returnTo)}`

  return (
    <Box component="section" aria-labelledby="comments-heading" sx={{ my: 2 }}>
      <Typography id="comments-heading" variant="h6" sx={{ fontSize: '0.875rem', mb: 2 }}>
        Комментарии
      </Typography>

      {viewerError ? <Alert severity="error">Не удалось проверить сессию. Обновите страницу.</Alert> : viewerLoading ? (
        <Typography role="status">Проверяем сессию…</Typography>
      ) : user ? (
        <Box component="form" sx={{ mb: 2 }} onSubmit={(event) => {
          event.preventDefault()
          if (!text.trim() || mutating) return
          void addComment({ text, ...(rating ? { rating: Number(rating) } : {}) }).then((success) => {
            if (success) { setText(''); setRating('') }
          })
        }}>
          <Stack spacing={1}>
            <TextField label="Комментарий" multiline minRows={2} required value={text}
              disabled={mutating} slotProps={{ htmlInput: { maxLength: 5000 } }} onChange={(event) => setText(event.target.value)} />
            <TextField select label="Оценка (необязательно)" value={rating} disabled={mutating} onChange={(event) => setRating(event.target.value)}>
              <MenuItem value="">Без оценки</MenuItem>
              {Array.from({ length: 10 }, (_, index) => <MenuItem key={index + 1} value={String(index + 1)}>{index + 1}/10</MenuItem>)}
            </TextField>
            <Button type="submit" variant="outlined" disabled={mutating || loading || !text.trim()}>
              {mutating ? 'Сохраняем…' : 'Отправить комментарий'}
            </Button>
          </Stack>
        </Box>
      ) : (
        <Button component={Link} href={loginHref}>
          Войти, чтобы оставить комментарий
        </Button>
      )}
      {mutationError && <Alert severity="error" sx={{ mb: 2 }}>{mutationError} <Link href={loginHref}>Войти снова</Link></Alert>}
      {targetError && <Alert severity="warning" action={<Button onClick={retryTarget}>Повторить</Button>}>{targetError}</Alert>}

      {loading && (
        <Stack direction="row" spacing={1} role="status" sx={{ alignItems: 'center', color: 'text.secondary' }}>
          <CircularProgress size={18} aria-label="Загрузка комментариев" />
          <Typography variant="body2">Загружаем комментарии…</Typography>
        </Stack>
      )}

      {!loading && error && items.length === 0 && (
        <Stack spacing={1}>
          <Alert severity="error">{error}</Alert>
          <Button variant="outlined" onClick={retry} sx={{ alignSelf: 'flex-start' }}>Повторить</Button>
        </Stack>
      )}

      {!loading && !error && items.length === 0 && (
        <Typography color="text.secondary" sx={{ fontSize: '0.875rem' }}>
          Пока нет комментариев.
        </Typography>
      )}

      {items.length > 0 && (
        <Stack spacing={1.5}>
          {items.map((comment) => <CommentCard key={comment._id} comment={comment}
            canDelete={Boolean(user && (user.role === 'admin' || user.id === comment.authorId))}
            deleting={mutating} onDelete={() => { void deleteComment(comment._id) }} />)}
        </Stack>
      )}

      {!loading && error && items.length > 0 && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      {!loading && !error && nextCursor && (
        <Button variant="outlined" onClick={() => void loadMore()} disabled={loadingMore} sx={{ mt: 2 }}>
          {loadingMore ? 'Загружаем…' : 'Показать ещё комментарии'}
        </Button>
      )}
      {error && items.length > 0 && nextCursor && (
        <Button variant="outlined" onClick={() => void loadMore()} disabled={loadingMore} sx={{ mt: 2 }}>
          {loadingMore ? 'Загружаем…' : 'Повторить загрузку'}
        </Button>
      )}
    </Box>
  )
}
