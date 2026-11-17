import { uiTextFor, type Locale, type UiKey, type Values } from './messages'

type MetadataText = string | { key: UiKey; values?: Values }
export type MetadataMessages = {
  title?: MetadataText
  description?: MetadataText
  openGraphDescription?: MetadataText
}

function resolveMetadataText(locale: Locale, text: MetadataText) {
  return typeof text === 'string' ? text : uiTextFor(locale)(text.key, text.values)
}

// Both the initial server render and local language changes use these messages.
export function localizedMetadata(locale: Locale, messages: MetadataMessages = {}) {
  return {
    title: resolveMetadataText(locale, messages.title ?? 'Gurach'),
    description: resolveMetadataText(locale, messages.description ?? { key: 'musicPlayer' }),
    openGraphDescription: resolveMetadataText(locale, messages.openGraphDescription ?? { key: 'musicPlayer' }),
  }
}
