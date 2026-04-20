# Screenshot

Self-hosted screenshot upload service built with Bun, Hono, TypeScript, React, and local disk storage.

The upload page accepts pasted, dropped, or selected images and immediately copies a public asset URL while the upload continues. Public asset URLs are intended to render inline in clients such as Discord, Slack, iMessage, and browsers.

## Features

- Paste, drag/drop, or select PNG, JPEG, and WebP images.
- Configurable upload size limit in MB.
- Randomized public filenames.
- Public inline asset serving from a separate asset origin.
- Upload progress in the browser.
- SQLite metadata and settings persistence.
- Admin dashboard for upload management and runtime settings.
- Generic OIDC login for admin access.
- Optional OIDC protection for the upload UI.
- Optional authentication for asset URLs.
- Lossless image optimization for PNG and WebP. JPEG files are stored unchanged to avoid quality loss.
- Docker and Docker Compose support.

GIF uploads are not supported.

## Architecture

One Bun process serves both origins. The server switches behavior based on the `Host` header.

- App/API origin: `https://screenshot.jacobtrentini.com`
- Asset origin: `https://assets.cdn.jacobtrentini.com`

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

```txt
PORT=3005
DATA_DIR=/data
PUBLIC_APP_ORIGIN=https://screenshot.jacobtrentini.com
PUBLIC_ASSET_ORIGIN=https://assets.cdn.jacobtrentini.com
MAX_UPLOAD_MB=25
ID_LENGTH=12

ADMIN_DASHBOARD_ENABLED=true
UPLOAD_AUTH_REQUIRED=false
ASSETS_AUTH_REQUIRED=false
IMAGE_COMPRESSION_ENABLED=true

OIDC_ISSUER_URL=https://id.example.com
OIDC_CLIENT_ID=screenshot
OIDC_CLIENT_SECRET=change-me
OIDC_REDIRECT_URI=https://screenshot.jacobtrentini.com/auth/callback
ADMIN_EMAIL=you@example.com
SESSION_SECRET=change-me
COOKIE_DOMAIN=.jacobtrentini.com
```

Most runtime settings can also be changed from the admin dashboard. Those changes are stored in SQLite and override the environment defaults.

## OIDC

Create an OIDC client with this redirect URI:

```txt
https://screenshot.jacobtrentini.com/auth/callback
```

The admin dashboard only permits the configured `ADMIN_EMAIL`. Upload UI authentication is disabled by default and can be enabled from admin settings. Asset authentication is also disabled by default because enabling it prevents unauthenticated clients from rendering shared images.

## Reverse Proxy

Example Caddy configuration:

```caddyfile
screenshot.jacobtrentini.com {
  reverse_proxy 127.0.0.1:3005
}

assets.cdn.jacobtrentini.com {
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
