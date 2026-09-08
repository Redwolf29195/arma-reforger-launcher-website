import { downloadStoreInstaller } from '../../lib/store-download.mjs';

export function onRequest({ request }) {
  return downloadStoreInstaller(request);
}
