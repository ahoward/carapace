# Quickstart: Gatekeeper Middleware

## Prerequisites

- Bun 1.3+ (`bin/setup` installs it)
- Docker (optional, for container testing)

## Run locally

```bash
# Start the gatekeeper (creates default vault dirs if missing)
bun run gatekeeper/src/index.ts

# Or use the dev script (starts gatekeeper + vite frontend)
bin/dev --browser
```

## Test the API

```bash
# Health check
curl http://localhost:3001/health

# List files (LOCAL mode — shows public + private)
curl http://localhost:3001/tools/fs/list

# Read a public file
curl "http://localhost:3001/tools/fs/read?path=public/readme.txt"

# Switch to CLOUD mode
curl -X POST -H "Content-Type: application/json" \
  -d '{"mode":"CLOUD"}' http://localhost:3001/control/set-mode

# List files (CLOUD mode — public only)
curl http://localhost:3001/tools/fs/list

# Try to read a private file in CLOUD mode (should get 403)
curl "http://localhost:3001/tools/fs/read?path=private/secrets.txt"
```

## Run tests

```bash
bun test --cwd gatekeeper
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEKEEPER_PORT` | `3001` | HTTP server port |
| `PUBLIC_VAULT` | `./data/public` | Public vault directory |
| `PRIVATE_VAULT` | `./data/private` | Private vault directory |

## Docker

```bash
# Build
docker build -t carapace/gatekeeper gatekeeper/

# Run with local vault dirs mounted
docker run -p 3001:3001 \
  -v $(pwd)/data/public:/app/data/public \
  -v $(pwd)/data/private:/app/data/private \
  carapace/gatekeeper
```
