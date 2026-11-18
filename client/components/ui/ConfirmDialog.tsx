'use client'
import { useId, useRef, type ReactNode } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import { useText } from '@/i18n/LocaleProvider'

export function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onClose, busy = false, disabled = false, destructive = false }: {
  open: boolean; title: string; children: ReactNode; confirmLabel: string
  onConfirm: () => void; onClose: () => void; busy?: boolean; disabled?: boolean; destructive?: boolean
}) {
  const id = useId()
  const cancel = useRef<HTMLButtonElement>(null)
  const lt = useText()
  return <Dialog open={open} onClose={() => { if (!busy) onClose() }} fullWidth maxWidth="sm" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    slotProps={{ transition: { onEntered: () => cancel.current?.focus() } }}>
    <DialogTitle id={`${id}-title`}>{title}</DialogTitle>
    <DialogContent id={`${id}-description`} aria-busy={busy}>{children}</DialogContent>
    <DialogActions>
      <Button ref={cancel} autoFocus disabled={busy} onClick={onClose}>{lt('cancel')}</Button>
      <Button disabled={busy || disabled} color={destructive ? 'error' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
    </DialogActions>
  </Dialog>
}
