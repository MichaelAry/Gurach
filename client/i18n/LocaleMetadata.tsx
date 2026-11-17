'use client'

import { useLocale } from './LocaleProvider'
import { localizedMetadata, type MetadataMessages } from './metadata'

export function LocaleMetadata({ image, ...messages }: MetadataMessages & { image?: string }) {
  const { locale } = useLocale()
  const metadata = localizedMetadata(locale, messages)
  // React owns these tags during server rendering and local language changes.
  return <>
    <title>{metadata.title}</title>
    <meta name="description" content={metadata.description} />
    <meta property="og:type" content="website" />
    <meta property="og:title" content={metadata.title} />
    <meta property="og:description" content={metadata.openGraphDescription} />
    <meta name="twitter:title" content={metadata.title} />
    <meta name="twitter:description" content={metadata.openGraphDescription} />
    <meta name="twitter:card" content={image ? 'summary_large_image' : 'summary'} />
    {image && <>
      <meta property="og:image" content={image} />
      <meta name="twitter:image" content={image} />
    </>}
  </>
}
