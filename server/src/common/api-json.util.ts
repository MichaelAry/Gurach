import { env } from './env.js';

type StaticDir = 'audio' | 'picture';

/** Resolve a stored media filename into its public API URL. */
export function staticUrl(dir: StaticDir, name?: string | null): string | null {
  return name ? `${env.publicUrl}/static/${dir}/${name}` : null;
}
