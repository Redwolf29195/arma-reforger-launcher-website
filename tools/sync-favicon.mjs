import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function syncFavicon(publicDirectory = path.join(root, 'public')) {
  // Reuse the approved transparent logo unchanged, including its alpha channel.
  const png = await readFile(path.join(publicDirectory, 'assets/app-icon-192.png'));
  if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      || png.readUInt32BE(16) !== 192 || png.readUInt32BE(20) !== 192) {
    throw new Error('The website favicon source must be the approved 192x192 PNG.');
  }
  // ICO supports a PNG frame. Wrapping the existing bytes requires no redraw.
  const directory = Buffer.alloc(22);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(1, 4);
  directory[6] = directory[7] = 192;
  directory.writeUInt16LE(1, 10);
  directory.writeUInt16LE(32, 12);
  directory.writeUInt32LE(png.length, 14);
  directory.writeUInt32LE(directory.length, 18);
  await writeFile(path.join(publicDirectory, 'favicon.png'), png);
  await writeFile(path.join(publicDirectory, 'favicon.ico'), Buffer.concat([directory, png]));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await syncFavicon();
}
