'use client'
import { useEffect } from 'react'
import { useText, useMessage } from './LocaleProvider'

export function FormValidation() {
  const lt = useText()
  const resolve = useMessage()
  useEffect(() => {
    document.querySelectorAll<HTMLInputElement>('[data-gurach-validation-message]').forEach(field => {
      field.setCustomValidity(resolve(field.dataset.gurachValidationMessage))
    })
    const fields = new Set<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>()
    const invalid = (event: Event) => {
      const field = event.target
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) return
      if (field.validity.customError) return
      const key = field.validity.valueMissing ? 'validationRequired' : field.validity.typeMismatch ? 'validationType'
        : field.validity.tooShort ? 'validationShort' : field.validity.tooLong ? 'validationLong'
          : field.validity.rangeUnderflow || field.validity.rangeOverflow || field.validity.stepMismatch ? 'validationRange' : 'validationPattern'
      field.setCustomValidity(lt(key))
      fields.add(field)
    }
    const input = (event: Event) => {
      const field = event.target as HTMLInputElement
      if (fields.has(field)) { field.setCustomValidity(''); fields.delete(field) }
    }
    document.addEventListener('invalid', invalid, true)
    document.addEventListener('input', input, true)
    document.addEventListener('change', input, true)
    return () => {
      document.removeEventListener('invalid', invalid, true)
      document.removeEventListener('input', input, true)
      document.removeEventListener('change', input, true)
      fields.forEach(field => field.setCustomValidity(''))
    }
  }, [lt, resolve])
  return null
}
