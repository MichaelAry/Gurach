import { socialProxy } from '@/lib/server/social-bff'
export function GET(request: Request) { return socialProxy(request, '/friends/requests', { list: true, requests: true }) }
export function POST(request: Request) { return socialProxy(request, '/friends/requests', { body: true }) }
