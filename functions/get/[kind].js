import { downloadFromWebsite } from '../../lib/download-counter.mjs';

export function onRequest({ request, params, env }) {
  return downloadFromWebsite(request, params.kind, {
    database: env.DOWNLOAD_COUNTER_DB,
    loadRelease: async () => {
      const response = await env.ASSETS.fetch(new URL('/release.json', request.url).href);
      if (!response.ok) throw new Error('Release metadata unavailable');
      return response.json();
    }
  });
}
