import { downloadStats } from '../../lib/download-counter.mjs';

export function onRequest({ request, env }) {
  return downloadStats(request, env.DOWNLOAD_COUNTER_DB);
}
