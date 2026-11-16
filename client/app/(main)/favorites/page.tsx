import { getText } from '@/i18n/server'
import { FavoritesPage } from '@/features/favorites/FavoritesPage'

export async function generateMetadata() { return { title: (await getText())('favoriteTracks') } }
export default function Page() { return <FavoritesPage /> }
