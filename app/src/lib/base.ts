/** Where the app is served from: '/' in development, '/zeen/' on zirui.ca (ZEEN_BASE at build time). */
export const BASE = import.meta.env.BASE_URL

/**
 * A file in public/, by its path from the site root as the code writes it ('/assets/…'), made to work
 * wherever the app is served from. Already-prefixed paths, data: URLs and the like pass through.
 */
export const asset = (p: string) => (!p.startsWith('/') || p.startsWith(BASE) ? p : BASE + p.slice(1))
