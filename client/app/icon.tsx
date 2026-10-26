// app/icon.tsx
// Фавикон приложения, генерируется Next.js (edge runtime, без файлов в /public).
// Монохром: графит из mono-палитры темы + белый глиф.
import { ImageResponse } from 'next/og'

export const size = { width: 64, height: 64 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#2a2c36', // mono[800] — primary.main темы
          color: '#fafbfc', // mono[25] — primary.contrastText
          fontSize: 40,
          fontWeight: 700,
          borderRadius: 14,
        }}
      >
        G
      </div>
    ),
    { ...size },
  )
}
