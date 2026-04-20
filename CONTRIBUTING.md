# Contributing

Thanks for taking a look at Screenshot.

## Development

```sh
bun install
bun run build
bun run dev
```

The default app URL is `http://localhost:3005`.

## Checks

Run these before opening a pull request:

```sh
bun run typecheck
bun run build
```

## Scope

This project is intentionally small. Prefer changes that keep deployment simple, avoid external services by default, and preserve the paste-to-link workflow.
