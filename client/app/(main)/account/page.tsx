import { getText } from '@/i18n/server'
import { AccountOverview } from '@/features/account/AccountOverview'

export async function generateMetadata() { return { title: (await getText())('myAccount') } }

export default function AccountPage() {
  return <AccountOverview />
}
