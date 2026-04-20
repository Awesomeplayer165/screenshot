# Screenshot

Self-hosted screenshot upload service built with Bun, Hono, TypeScript, React, and local disk storage.

The upload page accepts pasted, dropped, or selected images and immediately copies a public asset URL while the upload continues. The intended flow is: open the page, paste a screenshot, switch back to the app where you want to share it, and paste the copied link. In normal use the image should be uploaded by the time the receiving app expands the URL.

## Features

- Paste, drag/drop, or select PNG, JPEG, WebP, HEIC, and HEIF images.
- Configurable upload size limit in MB.
- Randomized public filenames.
- Public inline asset serving from a separate asset origin.
- Upload progress in the browser.
- SQLite metadata and settings persistence.
- Admin dashboard for upload management, search, filtering, sorting, bulk delete, and runtime settings.
- Generic OIDC login for admin access.
- Optional OIDC protection for the upload UI.
- Optional authentication for asset URLs.
- Configurable image optimization levels. PNG and WebP are optimized losslessly. JPEG files are stored unchanged to avoid quality loss. HEIC and HEIF are converted to JPEG when the image processor is available.
- Optional pruning by approximate file age and total stored size.
- Automatic SQLite migrations on startup.
- Docker and Docker Compose support.

GIF uploads are not supported.

## Architecture

One Bun process serves both origins. The server switches behavior based on the `Host` header.

- App/API origin: `https://screenshot.example.com`
- Asset origin: `https://assets.example.com`

Public asset routes are unauthenticated by default. The admin dashboard is enabled by default, but requires OIDC to be configured before sign-in can succeed.

## Local Development

```sh
bun install
bun run build
bun run dev
```

The default server port is `3005`. Development environment values are stored in `config/dev.env`.

For Vite development:

```sh
bun run dev:web
```

Vite runs on `http://localhost:5173` and proxies `/api` and `/auth` to `http://localhost:3005`.

## Production

```sh
bun install
bun run build
bun run start
```

The server serves the built frontend from `apps/web/dist`.

## Docker

```sh
docker compose up -d --build
```

The container listens on port `3005` and stores images plus SQLite metadata in the `screenshot-data` volume.

## Configuration

Environment variables are for deployment identity, paths, and secrets. Runtime behavior is configured in the admin dashboard and persisted in SQLite.

```txt
PORT=3005
DATA_DIR=/data
PUBLIC_APP_ORIGIN=https://screenshot.example.com
PUBLIC_ASSET_ORIGIN=https://assets.example.com
ID_LENGTH=12

OIDC_ISSUER_URL=https://id.example.com
OIDC_CLIENT_ID=screenshot
OIDC_CLIENT_SECRET=change-me
OIDC_REDIRECT_URI=https://screenshot.example.com/auth/callback
ADMIN_EMAIL=you@example.com
SESSION_SECRET=change-me
COOKIE_DOMAIN=.example.com
```

Runtime settings are stored in SQLite:

- Upload limit in MB
- Admin dashboard enabled
- Upload UI authentication
- Asset authentication
- Image compression enabled
- Compression level
- Prune keep-days
- Prune max folder GB

Prune settings are intentionally approximate. Cleanup uses upload metadata in SQLite and runs on startup and opportunistically after uploads, avoiding expensive recursive folder scans.

Database migrations are applied automatically on startup and tracked in `schema_migrations`.

## OIDC

Create an OIDC client with this redirect URI:

```txt
https://screenshot.example.com/auth/callback
```

The admin dashboard only permits the configured `ADMIN_EMAIL`. Upload UI authentication is disabled by default and can be enabled from admin settings. Asset authentication is also disabled by default because enabling it prevents unauthenticated clients from rendering shared images.

## Reverse Proxy

Example Caddy configuration:

```caddyfile
screenshot.example.com {
  reverse_proxy 127.0.0.1:3005
}

assets.example.com {
  reverse_proxy 127.0.0.1:3005
}
```

## Storage

```txt
/data
  metadata.sqlite
  assets/
    a8/
      K3/
        a8K39sLpQz2.png
  tmp/
```

Uploads are written to `tmp` first, then atomically moved into `assets`.

## License

MIT
