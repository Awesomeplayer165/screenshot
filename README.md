# Screenshot

A tiny self-hosted screenshot paste/upload service.

## Features

- Paste a macOS screenshot directly into the page.
- Drag/drop or choose a PNG, JPEG, or WebP image.
- 25 MB upload limit.
- Random public asset URL copied before upload finishes.
- Upload progress.
- Public inline image serving from the asset domain.
- Local disk storage with SQLite metadata.
- Bun, Hono, TypeScript, React, and minimal shadcn/ui-style components.

GIF uploads are intentionally unsupported.

## Domains

- App and API: `https://screenshot.jacobtrentini.com`
- Public assets: `https://assets.cdn.jacobtrentini.com`

Both domains can point at the same Bun process. The server switches behavior based on the `Host` header.

## Local Development

```sh
bun install
bun run dev
```

In another terminal:

```sh
bun run dev:web
```

The Vite dev server runs on `http://localhost:5173` and proxies `/api` to the Bun server on `http://localhost:3000`.
The server dev environment is checked in at `config/dev.env`.

## Production Build

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

The app listens on port `3000` inside the container and stores files plus SQLite metadata in the `screenshot-data` volume.

## Environment

```txt
PORT=3000
DATA_DIR=/data
PUBLIC_APP_ORIGIN=https://screenshot.jacobtrentini.com
PUBLIC_ASSET_ORIGIN=https://assets.cdn.jacobtrentini.com
MAX_UPLOAD_BYTES=26214400
ID_LENGTH=12
```

## Caddy Example

```caddyfile
screenshot.jacobtrentini.com {
  reverse_proxy 127.0.0.1:3000
}

assets.cdn.jacobtrentini.com {
  reverse_proxy 127.0.0.1:3000
}
```

## Storage Layout

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
