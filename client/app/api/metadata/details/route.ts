import { proxyMetadataLookup } from '@/lib/server/metadata-request'

export function POST(request: Request) {
  return proxyMetadataLookup(request, 'details')
}
