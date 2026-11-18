/** Only the API's cover path supports thumbnails; preserve other image URLs. */
export function artworkSource(picture: string, size: 48 | 96 | 144): string {
  try {
    const relative = picture.startsWith('/') && !picture.startsWith('//');
    const url = new URL(picture, relative ? 'https://artwork.invalid' : undefined);
    if (!/^\/static\/picture\/[a-zA-Z0-9._-]+$/.test(url.pathname)) return picture;
    url.searchParams.set('size', String(size));
    return relative ? `${url.pathname}${url.search}${url.hash}` : url.href;
  } catch { return picture; }
}
