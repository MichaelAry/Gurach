import { LocaleMetadata } from '@/i18n/LocaleMetadata'
import { AccountOverview } from '@/features/account/AccountOverview'

export default function AccountPage() {
  return <><LocaleMetadata title={{ key: 'myAccount' }} /><AccountOverview /></>
}
