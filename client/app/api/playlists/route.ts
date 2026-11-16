import { playlistProxy } from '@/lib/server/playlists-bff'
export function GET(request: Request) { return playlistProxy(request, '/playlists') }
export function POST(request: Request) { return playlistProxy(request, '/playlists') }
