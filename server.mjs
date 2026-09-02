import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.join(rootDirectory, 'public');
const releaseDirectory = path.resolve(
  process.env.LAUNCHER_RELEASE_DIR || path.join(rootDirectory, '..', 'release')
);
const host = process.env.HOST || '127.0.0.1';
const port = Number.parseInt(process.env.PORT || '4173', 10);
const releaseMetadata = JSON.parse(await readFile(path.join(rootDirectory, 'release.json'), 'utf8'));

const downloadFiles = new Set(
  Object.values(releaseMetadata.downloads).map((download) => download.filename)
);
const setupFilename = releaseMetadata.downloads.setup.filename;
const updateFiles = new Set([
  'latest.yml',
  setupFilename,
  `${setupFilename}.blockmap`
]);

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.yml', 'text/yaml; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8']
]);

function setSecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  );
}

function sendJson(response, statusCode, value) {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  response.end(body);
}

async function sendFile(request, response, filePath, options = {}) {
  const fileStats = await stat(filePath);
  const rangeHeader = request.headers.range;
  const headers = {
    'Content-Type': options.contentType || mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Last-Modified': fileStats.mtime.toUTCString(),
    'Cache-Control': options.cacheControl || 'public, max-age=3600'
  };

  if (options.attachmentName) {
    headers['Content-Disposition'] = `attachment; filename="${options.attachmentName}"`;
  }

  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (!match) {
      response.writeHead(416, { 'Content-Range': `bytes */${fileStats.size}` });
      response.end();
      return;
    }

    const start = match[1] ? Number.parseInt(match[1], 10) : 0;
    const end = match[2] ? Number.parseInt(match[2], 10) : fileStats.size - 1;
    if (start < 0 || end < start || end >= fileStats.size) {
      response.writeHead(416, { 'Content-Range': `bytes */${fileStats.size}` });
      response.end();
      return;
    }

    headers['Content-Range'] = `bytes ${start}-${end}/${fileStats.size}`;
    headers['Content-Length'] = end - start + 1;
    response.writeHead(206, headers);
    if (request.method === 'HEAD') response.end();
    else createReadStream(filePath, { start, end }).pipe(response);
    return;
  }

  headers['Content-Length'] = fileStats.size;
  response.writeHead(options.statusCode || 200, headers);
  if (request.method === 'HEAD') response.end();
  else createReadStream(filePath).pipe(response);
}

function publicPathFor(pathname) {
  const requestedPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const resolvedPath = path.resolve(publicDirectory, requestedPath);
  if (resolvedPath !== publicDirectory && !resolvedPath.startsWith(`${publicDirectory}${path.sep}`)) return null;
  return resolvedPath;
}

const server = createServer(async (request, response) => {
  setSecurityHeaders(response);

  try {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    let pathname;
    try {
      pathname = decodeURIComponent(requestUrl.pathname);
    } catch {
      sendJson(response, 400, { error: 'Invalid URL encoding' });
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      sendJson(response, 405, { error: 'Method not allowed' });
      return;
    }

    if (pathname === '/health') {
      sendJson(response, 200, { status: 'ok', version: releaseMetadata.version });
      return;
    }

    if (pathname === '/api/release') {
      const downloads = {};
      for (const [key, value] of Object.entries(releaseMetadata.downloads)) {
        const releasePath = path.join(releaseDirectory, value.filename);
        const configuredUrl = typeof value.url === 'string' ? value.url : null;
        let available = value.available === true;
        let bytes = value.bytes;
        if (!configuredUrl) {
          try {
            const releaseStats = await stat(releasePath);
            available = releaseStats.isFile();
            bytes = releaseStats.size;
          } catch {
            available = false;
          }
        }
        downloads[key] = {
          ...value,
          bytes,
          available,
          url: configuredUrl || `/downloads/${encodeURIComponent(value.filename)}`
        };
      }
      sendJson(response, 200, { ...releaseMetadata, downloads });
      return;
    }

    if (pathname.startsWith('/downloads/')) {
      const filename = path.basename(pathname);
      if (!downloadFiles.has(filename)) {
        sendJson(response, 404, { error: 'Release not found' });
        return;
      }
      await sendFile(request, response, path.join(releaseDirectory, filename), {
        attachmentName: filename,
        cacheControl: 'public, max-age=86400, immutable'
      });
      return;
    }

    if (pathname.startsWith('/updates/')) {
      const filename = path.basename(pathname);
      if (!updateFiles.has(filename)) {
        sendJson(response, 404, { error: 'Update file not found' });
        return;
      }
      await sendFile(request, response, path.join(releaseDirectory, filename), {
        cacheControl: filename === 'latest.yml'
          ? 'no-cache, no-store, must-revalidate'
          : 'public, max-age=86400, immutable'
      });
      return;
    }

    const filePath = publicPathFor(pathname);
    if (!filePath) {
      sendJson(response, 400, { error: 'Invalid path' });
      return;
    }

    await sendFile(request, response, filePath, {
      cacheControl: pathname === '/' || pathname.endsWith('.html')
        ? 'no-cache'
        : 'public, max-age=604800'
    });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      try {
        await sendFile(request, response, path.join(publicDirectory, '404.html'), {
          cacheControl: 'no-cache',
          statusCode: 404
        });
      } catch {
        sendJson(response, 404, { error: 'Not found' });
      }
      return;
    }
    console.error(error);
    sendJson(response, 500, { error: 'Internal server error' });
  }
});

server.listen(port, host, () => {
  console.log(`ArmaLauncher website: http://${host}:${port}`);
  console.log(`Release directory: ${releaseDirectory}`);
});
