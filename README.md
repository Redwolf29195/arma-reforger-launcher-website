# Arma Reforger Launcher website

Source for the ALGZ Arma Reforger Launcher download website published at
`https://armalaucher.com` on Cloudflare Pages.

The repository contains the website source and deployment helpers. Launcher
installers, portable builds, logs, TLS keys and Playit credentials are not
stored in Git.

The launcher update channel remains separate:
`https://github.com/Redwolf29195/arma-reforger-launcher-updates`.
`update-channel/latest.yml` is a checked snapshot of the metadata consumed by
the launcher updater; update binaries stay in GitHub Releases of that project.

## Cloudflare Pages

Connect this repository with the Pages Git integration. Use branch `main`,
framework preset `None`, build command `npm run build`, and output directory
`dist`. Set production `SITE_URL` to `https://armalaucher.com`.
The project is `algz-arma-launcher`, with `algz-arma-launcher.pages.dev`
as its fallback hostname. The build also supports `CF_PAGES_URL` as a fallback.

The build copies only public website assets, generates release metadata and
Pages redirects, and links installers directly to their versioned GitHub
release. No local Node process, Playit tunnel, or running PC is required.
The existing local deployment remains supported by `npm start`.

When publishing a new launcher release, update `release.json` and push it to
this repository. Cloudflare rebuilds the site from that metadata.

## Website download counter

The counter records new requests through `/get/setup` and `/get/portable`.
Automatic launcher updates and the existing `/updates/*` links go directly to
GitHub and do not increment it. HEAD requests and browser prefetches are also
excluded. It counts download requests, not completed installations or unique
users. No device IDs, installation confirmations, cookies, IP addresses or
visitor profiles are stored by the counter.

Before deploying the counter for the first time, create a Cloudflare D1 database
named `algz-launcher-downloads`, execute `migrations/0001_download_counts.sql`,
and bind that database to the production Pages project as `DOWNLOAD_COUNTER_DB`.
Use a separate database for preview deployments so tests cannot change the
public number. Do not deploy a production preview against the live counter.
The existing GitHub download totals cannot be used as an initial value because
they include automatic updates. This separate counter starts at zero.

`GET /api/download-stats` returns the total and Setup/Portable breakdown.
The page refreshes it once a minute while visible. A counter failure does not
block downloads, and unavailable statistics are never presented as zero.
The database persists across launcher releases and website deployments.

For local development, Node.js 22.13+ uses SQLite in `logs/download-counts.sqlite`.
Set `WEBSITE_COUNTER_PATH` to a separate file for tests. Older Node versions
still serve downloads but cannot show local download statistics.
Run `npm test` for counter concurrency, persistence, exclusion and failure checks.
Pages Functions are restricted to `/get/*` and `/api/download-stats` by the
generated `_routes.json`; static pages and the launcher updater stay separate.

## Local start

Node.js 20 or newer is recommended. The release files are expected in the
parent `release` directory when this folder is placed beside the launcher
release folder.

```powershell
$env:LAUNCHER_RELEASE_DIR='B:\lunchre for arma reforger\release'
npm start
```

Open `http://127.0.0.1:4173`.

Validate the JavaScript files without starting the server:

```powershell
npm run check
```

## Production

The validated production topology is:

```text
Internet -> Playit HTTPS tunnel -> Caddy :443 -> Node 127.0.0.1:4173
                                      |
                                      +-> /updates/* -> GitHub Releases
```

1. Keep the Node server on `127.0.0.1:4173`.
2. Register `Register-ArmaLauncherWebsiteTask.ps1` once for automatic startup.
3. Import the included `Caddyfile` from the ALGZ Caddy gateway.
4. Keep update executables outside this repository.
5. Update `release.json` after every launcher build.
6. Keep the Playit agent online; update files are served by the separate
   `arma-reforger-launcher-updates` GitHub repository.

Useful health checks:

```text
GET /health
GET /api/release
GET /updates/latest.yml
```

The Node server supports range requests for locally hosted files. The
production Caddy route may proxy `/updates/*` to a separate update host, which
must also support range requests for resumable downloads.

## Security

- Never commit Playit secrets, Caddy certificate storage or environment files.
- Never commit launcher executables or update payloads to this source repository.
- Keep the Node listener bound to loopback and expose it only through Caddy.
- Preserve the security headers configured by `server.mjs` and `Caddyfile`.
