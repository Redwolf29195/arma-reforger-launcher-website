# Arma Reforger Launcher website

Source for the ALGZ Arma Reforger Launcher download website published at
`armaveblaucher.playit.plus`.

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
`dist`. Set `SITE_URL` to the production HTTPS address after choosing the
project name. The build also supports `CF_PAGES_URL` as a fallback.

The build copies only public website assets, generates release metadata and
Pages redirects, and links installers directly to their versioned GitHub
release. No local Node process, Playit tunnel, or running PC is required.
The existing local deployment remains supported by `npm start`.

When publishing a new launcher release, update `release.json` and push it to
this repository. Cloudflare rebuilds the site from that metadata.

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
