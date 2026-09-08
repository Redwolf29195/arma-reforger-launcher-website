import { createHash } from 'node:crypto';

export const PRODUCTION_ORIGIN = 'https://armalauncher.net';

// A preview hostname or stale environment value must never become canonical.
export function validateSiteUrl(value) {
  if (value && value !== PRODUCTION_ORIGIN && value !== `${PRODUCTION_ORIGIN}/`) {
    throw new Error(`SITE_URL must be ${PRODUCTION_ORIGIN}`);
  }
}

export function contentSecurityPolicy(html) {
  const hashes = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(([, json]) => {
      JSON.parse(json);
      return `'sha256-${createHash('sha256').update(json.replace(/\r\n/g, '\n')).digest('base64')}'`;
    });
  return `default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self' ${hashes.join(' ')}; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`;
}
