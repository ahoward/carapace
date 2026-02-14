# carapace Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-14

## Active Technologies
- TypeScript 5.6+ (Bun runtime) + SkyPilot CLI (external, user-installed), Bun.spawn (subprocess), Bun.serve (HTTP/SSE) (002-skypilot-provisioning)
- In-memory cluster state (no database for MVP) (002-skypilot-provisioning)

- Bun 1.3+ / TypeScript (ES2021 target) + Bun built-ins (Bun.serve, Bun.file, node:fs, node:path). No external packages. (001-gatekeeper-middleware)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

Bun 1.3+ / TypeScript (ES2021 target): Follow standard conventions

## Recent Changes
- 002-skypilot-provisioning: Added TypeScript 5.6+ (Bun runtime) + SkyPilot CLI (external, user-installed), Bun.spawn (subprocess), Bun.serve (HTTP/SSE)

- 001-gatekeeper-middleware: Added Bun 1.3+ / TypeScript (ES2021 target) + Bun built-ins (Bun.serve, Bun.file, node:fs, node:path). No external packages.

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
