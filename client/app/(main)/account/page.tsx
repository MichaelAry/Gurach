import type { Metadata } from 'next'
import { AccountOverview } from '@/features/account/AccountOverview'

export const metadata: Metadata = {
  title: 'Мой аккаунт',
}

export default function AccountPage() {
  return <AccountOverview />
}
