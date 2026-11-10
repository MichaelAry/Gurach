import { socialProxy } from '@/lib/server/social-bff'
export function GET(request: Request) { return socialProxy(request, '/users/search', { list: true, search: true }) }
