import { Suspense } from 'react'
import { LocaleMetadata } from '@/i18n/LocaleMetadata'
import { LoginForm } from '@/features/auth/LoginForm'

export default function LoginPage() {
  return <><LocaleMetadata /><Suspense fallback={null}><LoginForm /></Suspense></>
}
