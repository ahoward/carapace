# API Contracts: SkyPilot Installer

**Feature**: 003-skypilot-installer
**Date**: 2026-02-14

## HTTP Endpoints

### GET /cluster/install-status

Query the current installation state without triggering installation.

**Request**: No body.

**Response** (200):
```json
{
  "status": "success",
  "result": {
    "uv_installed": true,
    "uv_version": "0.10.2",
    "sky_installed": true,
    "sky_version": "0.7.1",
    "carapace_home": "/home/user/.carapace"
  },
  "errors": null,
  "meta": {
    "path": "/cluster/install-status",
    "timestamp": "2026-02-14T12:00:00.000Z",
    "duration_ms": 42
  }
}
```

When nothing is installed:
```json
{
  "status": "success",
  "result": {
    "uv_installed": false,
    "uv_version": null,
    "sky_installed": false,
    "sky_version": null,
    "carapace_home": "/home/user/.carapace"
  },
  "errors": null,
  "meta": { ... }
}
```

---

### POST /cluster/ensure-skypilot

Explicitly trigger SkyPilot installation. Idempotent — if already installed, returns immediately. Progress is streamed via `GET /cluster/events` (existing SSE endpoint).

**Request**: No body.

**Response** (202 — installation started):
```json
{
  "status": "success",
  "result": {
    "message": "SkyPilot installation started",
    "carapace_home": "/home/user/.carapace"
  },
  "errors": null,
  "meta": { ... }
}
```

**Response** (200 — already installed):
```json
{
  "status": "success",
  "result": {
    "message": "SkyPilot already installed",
    "sky_path": "/home/user/.carapace/tools/bin/sky"
  },
  "errors": null,
  "meta": { ... }
}
```

**Response** (500 — installation failed):
```json
{
  "status": "error",
  "result": null,
  "errors": {
    "install": ["Failed to download uv: HTTP 404"]
  },
  "meta": { ... }
}
```

**SSE events during installation** (via existing `/cluster/events`):
```
event: progress
data: {"timestamp":"...","type":"progress","message":"Checking existing installation..."}

event: progress
data: {"timestamp":"...","type":"progress","message":"Downloading uv package manager..."}

event: progress
data: {"timestamp":"...","type":"progress","message":"Installing SkyPilot (this may take 1-2 minutes)..."}

event: progress
data: {"timestamp":"...","type":"progress","message":"Verifying installation..."}

event: complete
data: {"timestamp":"...","type":"complete","message":"SkyPilot installed successfully"}
```

---

## Modified Endpoints

### POST /cluster/launch (existing, modified behavior)

**Before**: Returns 424 with "SkyPilot not installed" error when `sky` binary not found.

**After**: When `sky` binary not found, auto-installs via `ensure_skypilot()`. Progress events stream via SSE. After successful install, proceeds with credential check and launch. Only returns 424 if auto-install fails.

**New 424 error shape** (installation failed):
```json
{
  "status": "error",
  "result": null,
  "errors": {
    "install": ["SkyPilot installation failed: <specific error>"]
  },
  "meta": { ... }
}
```

### GET /cluster/check (existing, modified behavior)

**Before**: Returns `sky_installed: false` when `sky` binary not found.

**After**: When `sky` binary not found, auto-installs via `ensure_skypilot()`. After successful install, runs `sky check` and returns cloud provider status. If install fails, returns `sky_installed: false` (same as before — graceful fallback).

---

## Internal Service Contracts

### uv_installer.ts — Path Functions (sync, pure)

```typescript
carapace_home(): string
// Returns: path.join(os.homedir(), ".carapace")

uv_binary_path(): string
// Returns: path.join(carapace_home(), "uv", "bin", "uv")

sky_binary_path(): string
// Returns: path.join(carapace_home(), "tools", "bin", "sky")

uv_env(): Record<string, string>
// Returns: { UV_TOOL_BIN_DIR, UV_TOOL_DIR, UV_PYTHON_INSTALL_DIR }

detect_platform(): { arch: string; os: string }
// Returns: { arch: "aarch64"|"x86_64", os: "apple-darwin"|"unknown-linux-gnu" }
```

### uv_installer.ts — Detection Functions (async, IO)

```typescript
detect_uv(): Promise<string | null>
// Runs: uv_binary_path() --version
// Returns: version string or null

detect_sky(): Promise<string | null>
// Checks: existsSync(sky_binary_path())
// Returns: "installed" or null

check_install_status(): Promise<InstallStatus>
// Combines detect_uv() + detect_sky() into InstallStatus object
```

### uv_installer.ts — Installation Function (THE steel thread)

```typescript
ensure_skypilot(
  on_progress: (progress: InstallProgress) => void
): Promise<string>
// Returns: absolute path to sky binary
// Throws: Error if installation fails
// Idempotent: no-op if already installed
// Concurrency-safe: promise-based mutex
```

### sky_runner.ts — Modified sky_binary()

```typescript
sky_binary(): string | null
// Resolution order:
// 1. Check sky_binary_path() from uv_installer (managed path)
// 2. Fall back to Bun.which("sky") (system PATH)
// Returns: absolute path or null
```
