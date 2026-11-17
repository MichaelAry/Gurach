'use client'
import { useId, useRef, useState, type ChangeEventHandler } from 'react'
import { Button, FormControl, FormHelperText, FormLabel, Stack, Typography } from '@mui/material'
import { useText } from '@/i18n/LocaleProvider'

/** Native picker chrome follows the browser language. Render its labels ourselves. */
export function UploadFileField({ label, name, accept, error, helperText, disabled, onChange }: {
  label: string; name: string; accept: string; error: boolean; helperText: string
  disabled: boolean; onChange: ChangeEventHandler<HTMLInputElement>
}) {
  const id = useId()
  const lt = useText()
  const input = useRef<HTMLInputElement>(null)
  const [filename, setFilename] = useState('')
  return <FormControl required error={error} disabled={disabled} sx={{ p: 2, border: '1px solid', borderColor: error ? 'error.main' : 'divider', borderRadius: 'var(--wae-radius-control)' }}>
    <FormLabel htmlFor={id}>{label}</FormLabel>
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mt: 1, minWidth: 0 }}>
      <Button type="button" variant="outlined" disabled={disabled} onClick={() => input.current?.click()} sx={{ flexShrink: 0 }}>{lt('chooseFile')}</Button>
      <Typography variant="body2" sx={{ overflowWrap: 'anywhere', minWidth: 0 }}>{filename || lt('noFileChosen')}</Typography>
    </Stack>
    <input ref={input} id={id} name={name} type="file" required accept={accept} disabled={disabled} tabIndex={-1}
      aria-describedby={`${id}-help`} aria-invalid={error || undefined}
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0, top: 40, left: 0 }}
      onChange={event => { setFilename(event.currentTarget.files?.[0]?.name ?? ''); onChange(event) }} />
    <FormHelperText id={`${id}-help`}>{helperText}</FormHelperText>
  </FormControl>
}
