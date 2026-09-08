# ArmaLauncher website

Source for the ArmaLauncher download website published at
`https://armalauncher.net` on Cloudflare Pages.

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
`dist`. Set production `SITE_URL` to `https://armalauncher.net`.
The project is `algz-arma-launcher`, with `algz-arma-launcher.pages.dev`
as its infrastructure hostname. Canonical URLs always use the primary domain;
`CF_PAGES_URL` cannot override them. An incorrect `SITE_URL` fails the build.
Preview branches receive `X-Robots-Tag: noindex`; `main` remains indexable.

The build copies only public website assets, generates release metadata and
Pages redirects, and links installers directly to their versioned GitHub
release. No local Node process, Playit tunnel, or running PC is required.
The existing local deployment remains supported by `npm start`.

When publishing a new launcher release, update `release.json` and push it to
this repository. Cloudflare rebuilds the site from that metadata.

## Website download counter

The counter records the first download per browser through `/get/setup` or
`/get/portable`. Both formats and future releases share the same browser ID.
Automatic launcher updates and the existing `/updates/*` links go directly to
GitHub and do not increment it. HEAD requests and browser prefetches are also
excluded. It counts browser download attempts, not completed installations or
verified people. Registration is not required.

A random first-party cookie identifies the browser. On HTTPS it is named
`__Host-arma_download`, with Secure, HttpOnly, SameSite=Lax and Path=/; local HTTP
uses `arma_download`. Its requested lifetime is 400 days and is renewed on visits.
Browsers can expire it sooner. The database stores only the random ID and first
download format; no IP addresses, fingerprints or account information are used.
Clearing cookies, another browser or another device can create another count.

The statistics request prepares this cookie without recording a download.
A direct download link without a cookie makes one same-site redirect to check
that the browser accepts it. If cookies are blocked, the file still downloads
and the request is not counted. Responses containing browser cookies are never
cached. A unique database key and an insert trigger make the first increment
atomic, including concurrent requests. A failed write can be retried later.

Before deploying the counter for the first time, create a Cloudflare D1 database
named `algz-launcher-downloads`, execute the numbered SQL files in `migrations/`
in order,
and bind that database to the production Pages project as `DOWNLOAD_COUNTER_DB`.
Use a separate database for preview deployments so tests cannot change the
public number. Do not deploy a production preview against the live counter.
Before deploying browser deduplication to an existing database, apply
`migrations/0002_unique_downloads.sql`. It adds the visitor table and trigger
without changing existing totals. Historical requests cannot be deduplicated
because their browser IDs were never stored. A new empty database starts at zero;
GitHub download totals cannot be used as its initial value because they include
automatic updates.

`GET /api/download-stats` retains the total and Setup/Portable response fields.
New downloads are attributed only to the first format requested by a browser,
so Setup plus Portable still equals the overall total.
The page refreshes it once a minute while visible. A counter failure does not
block downloads, and unavailable statistics are never presented as zero.
The database persists across launcher releases and website deployments.

For local development, Node.js 22.13+ uses SQLite in `logs/download-counts.sqlite`.
Set `WEBSITE_COUNTER_PATH` to a separate file for tests. Older Node versions
still serve downloads but cannot show local download statistics.
Run `npm test` for counter concurrency, persistence, exclusion and failure checks.
Pages Functions are restricted to `/get/*`, `/api/download-stats` and `/store/*`
by the generated `_routes.json`; static pages and the launcher updater stay separate.

## Direct installer links for Microsoft Store

`/store/0.3.42/Arma-Reforger-Launcher-0.3.42-x64-Setup.exe` returns the existing
public Setup directly, with HTTP 200 for GET/HEAD and 206 for valid GET ranges.
The Pages Function resolves the GitHub redirect on the server and streams the
binary without buffering it. It does not set visitor cookies or increment the
website download counter, so Store checks and downloads are not counted as
website button downloads. `/get/*` and the launcher update channel keep their
existing behavior.

The independent allowlist in `lib/store-download.mjs` pins the versioned source
URL, GitHub blob path, upstream ETag, exact size and verified SHA-256. A replaced
or missing release asset fails closed instead of silently serving another build.
Only the known GitHub download host is allowed; client cookies and authorization
headers are never forwarded. Unknown versions return 404. Do not add `latest`
aliases or change existing entries when publishing a new launcher version: add
a new immutable URL and keep each previously submitted asset available.

The route fixes download URL handling only. It does not sign, rebuild or certify
the installer. Version 0.3.42 is the already published ALGZ-protected build; its
Windows Authenticode status is NotSigned. Store package/signing requirements
still need to be satisfied separately before completing certification.

## Local start

Use Node.js 22.13 or newer. The release files are expected in the
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

## Production and domain migration

Cloudflare Pages serves the static site at `https://armalauncher.net/`.
Pages Functions and D1 handle website download counts; binaries and automatic
updates remain in the existing GitHub Releases repository. There is no login
or authentication service in this website repository.

The only indexable page is `/`. Downloads are part of that page at `/#download`,
so the sitemap deliberately contains only the homepage. The HTML includes one
ArmaLauncher H1, canonical URL, description, Open Graph, Twitter card and
WebSite/SoftwareApplication JSON-LD. All are available without JavaScript.
The EN/RU switch keeps the brand and primary URL consistent.

Configure domain redirects at Cloudflare, preserving the path and query:

- Old zone `armalaucher.com`: Single Redirect, expression
  `(http.host eq "armalaucher.com")`, dynamic target
  `concat("https://armalauncher.net", http.request.uri.path)`, status `301`,
  preserve query string enabled.
- New zone: match `www.armalauncher.net` and redirect to the same target with
  status `301`, preserving the query string. Enable HTTPS for the apex.
- Pages infrastructure hostname: use a Bulk Redirect from
  `algz-arma-launcher.pages.dev/` to `https://armalauncher.net/`, status `301`,
  subpath matching, preserve path suffix and preserve query string enabled.
  Leave include-subdomains off so temporary preview deployments stay available
  for testing and carry their noindex header.

Add `www.armalauncher.net` in Pages Custom domains before redirecting it, so
Cloudflare provisions its DNS record and certificate. Retain the old domain,
its DNS record, certificate and redirect for at least a year after migration.

The legacy `armaveblaucher.playit.plus` hostname is controlled by the old PC's
Caddy gateway. The included `Caddyfile` redirects website requests to the new
site, while preserving its existing `/updates/*` GitHub route for older
launchers. Apply it and reload Caddy on that gateway; changing this repository
does not remotely reload the old PC. The Windows startup helpers and local
loopback server remain available for development.

Useful health checks:

```text
GET /health
GET /api/release
GET /updates/latest.yml
```

The local Node server still supports range requests for locally hosted files.
Run `npm run check`, `npm test`, and `npm run build` before publishing. Tests
cover counter behavior, persistent counts, SEO in the built output, preview
indexing, CSP hashes, download routing, metadata and real HTTP 404 responses.

## Google Search Console

1. Add a Domain property named `armalauncher.net` (without a scheme or path).
2. Copy the TXT verification value that Google actually provides. In Cloudflare,
   open this domain's DNS records, add type TXT, name `@`, that exact content,
   and TTL Auto. Return to Google and verify. Keep the TXT record in DNS.
3. In Sitemaps, submit `https://armalauncher.net/sitemap.xml`.
4. Inspect `https://armalauncher.net/`, test the live URL, and request indexing.
   `/#download` is a section of the same page, not a separate indexable URL.
5. Check URL Inspection for indexing and Google's selected canonical. The Pages
   indexing report and Search results report show coverage and search traffic.
   A `site:armalauncher.net` search is only a quick secondary check.
6. If the old domain was indexed, verify it in the same account and use its
   Settings > Change of address tool after the redirects are working.

Ownership tokens are provided by Google and stored in DNS, not invented or
committed here. Indexing time, ranking and rich-result display are Google's
decision; the SoftwareApplication markup intentionally omits unsupported
ratings, reviews, price and organization claims.

## Security

- Never commit Playit secrets, Caddy certificate storage or environment files.
- Never commit launcher executables or update payloads to this source repository.
- Keep the Node listener bound to loopback and expose it only through Caddy.
- Preserve the security headers configured by `server.mjs` and `Caddyfile`.
