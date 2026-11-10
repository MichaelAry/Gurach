'use client'

import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material'
import type { CommentResponse } from '../types'
import { useCommentPages } from '../hooks/useCommentPages'

function CommentCard({ comment }: { comment: CommentResponse }) {
  return (
    <Box sx={{ p: 1.5, bgcolor: 'background.default', borderRadius: 1 }}>
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
    </Box>
  )
}

export function CommentsSection({ trackId }: { trackId: string }) {
  const { items, nextCursor, loading, loadingMore, error, loadMore, retry } = useCommentPages(trackId)

  return (
    <Box component="section" aria-labelledby="comments-heading" sx={{ my: 2 }}>
      <Typography id="comments-heading" variant="h6" sx={{ fontSize: '0.875rem', mb: 2 }}>
        Комментарии
      </Typography>

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
          {items.map((comment) => <CommentCard key={comment._id} comment={comment} />)}
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
