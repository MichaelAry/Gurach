// app/(main)/tracks/[id]/page.tsx
import type { ITrack } from '@/types/track'

// Sample data - in a real app this would come from an API
const tracks: ITrack[] = [
  {
    _id: '1',
    name: 'Midnight Drive',
    artist: 'Neon Waves',
    lyrics: '',
    listens: 1240,
    picture: '/covers/midnight.jpg',
    audio: '/audio/midnight.mp3',
    comments: [],
  },
  {
    _id: '2',
    name: 'Ocean Eyes',
    artist: 'Luna Ray',
    lyrics: '',
    listens: 890,
    picture: '/covers/ocean.jpg',
    audio: '/audio/ocean.mp3',
    comments: [],
  },
  {
    _id: '3',
    name: 'Ghost Town',
    artist: 'The Midnight',
    lyrics: '',
    listens: 3120,
    picture: '/covers/ghost.jpg',
    audio: '/audio/ghost.mp3',
    comments: [],
  },
  {
    _id: '4',
    name: 'Paper Planes',
    artist: 'M.I.A.',
    lyrics: '',
    listens: 5400,
    picture: '/covers/paper.jpg',
    audio: '/audio/paper.mp3',
    comments: [],
  },
  {
    _id: '5',
    name: 'Silent Rain',
    artist: 'Kaito',
    lyrics: '',
    listens: 210,
    picture: '/covers/rain.jpg',
    audio: '/audio/rain.mp3',
    comments: [],
  },
]

export default async function TrackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const track = tracks.find((t) => t._id === id)

  if (!track) {
    return <h1>Track not found</h1>
  }

  return (
    <div>
      <h1>{track.name}</h1>
      <p>{track.artist}</p>
      <p>Listens: {track.listens}</p>
      {/* In a real app, you'd render an audio player, lyrics, etc. */}
    </div>
  )
}