# Research: SkyPilot Provisioning

**Feature**: 002-skypilot-provisioning
**Date**: 2026-02-14

## 1. SkyPilot CLI Interaction Model

### Decision: CLI over Python SDK
- **Rationale**: Constitution mandates Bun/TypeScript stack. SkyPilot Python SDK requires Python runtime. CLI is consumed via `Bun.spawn()` subprocess.
- **Alternatives considered**: Python SDK (rejected — adds Python runtime dependency), REST API (SkyPilot has a local API server but it's undocumented for external consumption).

### Decision: SkyPilot local API server awareness
- **Finding**: Since v0.8.1, SkyPilot runs a local API server. All CLI commands are async requests to this server.
- **Implication**: Killing a `sky launch` process does NOT cancel provisioning — work continues in background. To cancel: `sky api cancel <request-id>`.
- **For Carapace**: This is actually desirable — if the user closes the desktop app mid-provisioning, the provisioning completes and is detectable on next app open via `sky status`.

## 2. SkyPilot YAML Generation

### Decision: Dynamic YAML generation in Bun/TypeScript
- **Rationale**: YAML is straightforward key-value structure. Generate from a TypeScript config object, serialize with a simple YAML writer (no library needed for our flat structure — template string is sufficient).
- **Alternatives considered**: Static YAML with env var substitution (rejected — less flexible), Jinja templates (rejected — Python dependency).

### Key YAML Fields for Carapace
```yaml
name: carapace-node
resources:
  cpus: 4+
  memory: 16+
  disk_size: 100
  use_spot: false
  ports: [3001]
envs:
  TAILSCALE_AUTH_KEY: ${user-provided}
file_mounts:
  /opt/carapace/data/public: ./data/public
  /opt/carapace/data/private: ./data/private
setup: |
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
run: |
  cd /opt/carapace && docker compose up -d
  while true; do sleep 3600; done
```

## 3. Cluster Status Polling

### Decision: Parse `sky status` CLI output + `--ip` for targeted queries
- **Finding**: `sky status` has no `--json` flag. Returns tabular output.
- **Approach**: Use `sky status CLUSTER_NAME --refresh` for live status, parse the STATUS column. Use `sky status CLUSTER_NAME --ip` for IP address (returns just the IP string).
- **Alternatives considered**: Python one-liner for JSON (rejected — adds Python dependency for status checks), parse full table (fragile — column widths vary).
- **Practical approach**: Run `sky status --refresh` and grep for cluster name + status keyword (INIT/UP/STOPPED). If cluster not in output, it's been destroyed (no_server).

### Cluster State Mapping (SkyPilot → Carapace)
| SkyPilot State | Carapace State | Notes |
|----------------|----------------|-------|
| (not in output) | `no_server` | Cluster never created or fully destroyed |
| `INIT` | `provisioning` | Launch in progress OR abnormal state |
| `UP` | `running` | Fully provisioned and healthy |
| `STOPPED` | `stopped` | Hibernate state, disk preserved |
| (during `sky stop`) | `stopping` | Carapace tracks this locally |
| (during `sky down`) | `destroying` | Carapace tracks this locally |
| `INIT` + error in logs | `error` | Parse stderr for error details |

### Decision: Polling interval 15 seconds during transitions, 30 seconds steady-state
- **Rationale**: `sky status --refresh` queries the cloud provider, takes 2-5 seconds. Too frequent = hammers the API. 15s during provisioning gives good UX; 30s when running is sufficient per spec (FR-004).

## 4. Process Spawning from Bun

### Decision: `Bun.spawn()` with stdout pipe for progress streaming
- **Pattern**: Spawn `sky launch` with `stdout: "pipe"`, read chunks via `getReader()`, parse for progress lines, relay to React frontend.
- **IPC to frontend**: Gatekeeper exposes an SSE endpoint (`GET /cluster/events`) that streams provisioning progress. React frontend connects via `EventSource`.

### Decision: SSE over WebSocket for progress
- **Rationale**: SSE is simpler (one-direction server→client), auto-reconnects, works with standard `fetch` + `EventSource`. No WebSocket upgrade complexity. Bun supports SSE via `ReadableStream` with `type: "direct"`.
- **Alternatives considered**: WebSocket (rejected — bidirectional not needed), polling (rejected — higher latency, more requests).

### Process Lifecycle
```
sky launch -c carapace-node -y task.yaml
  → Bun.spawn() with stdout pipe
  → Stream lines to SSE endpoint
  → On exit code 0: status → running
  → On exit code != 0: parse stderr → status → error
```

## 5. Error Handling

### Decision: Pattern-match stderr for human-readable error extraction
- **Key patterns to detect**:
  - `Credentials not found` → "Cloud credentials not configured"
  - `No cloud access` → "No cloud provider enabled. Run `sky check`"
  - `Failed to provision` → "Cloud provider could not allocate resources"
  - `ResourcesUnavailableError` → "Requested resources unavailable"
  - `Catalog does not contain` → "No matching instance type found"
- **SkyPilot not installed**: Check `which sky` before any operation. If missing, return clear installation instructions.

### Exit Codes
| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General failure |
| 100 | Job/run code failed |

## 6. file_mounts Behavior

### Decision: rsync-based local→remote for vault directories
- **Mechanism**: SkyPilot uses rsync over SSH. Incremental (only changed files transferred on re-launch).
- **Timing**: Sync happens at `sky launch` time, not continuously.
- **Exclusions**: Respects `.gitignore` by default. Can override with `.skyignore`.
- **Symlinks**: Copied as symlinks (not dereferenced). Targets must be separately mounted.
- **Large files**: For >10GB, use bucket mounting instead. For Carapace MVP, vault sizes are small (<100MB).

### Vault Mount Paths
| Local | Remote |
|-------|--------|
| `./data/public` | `/opt/carapace/data/public` |
| `./data/private` | `/opt/carapace/data/private` |

## 7. SkyPilot Dependency Detection

### Decision: `which sky` check + `sky check` for credential validation
- **Binary detection**: `which sky` (exit 0 = installed, exit 1 = not installed)
- **Credential check**: `sky check` output parsed for enabled clouds
- **Presentation**: If `sky` not found, show installation instructions. If no clouds enabled, show `sky check` output with instructions.

## 8. Architecture Fit

### Where SkyPilot Logic Lives
Per Constitution Principle IV (Thin Desktop Shell):

| Component | Responsibility |
|-----------|---------------|
| `src/lib/skypilot.ts` | Pure functions: YAML generation, status parsing, error extraction. No IO. |
| `gatekeeper/src/handlers/cluster.ts` | HTTP handlers: launch, stop, destroy, status, events (SSE) |
| `gatekeeper/src/services/sky_runner.ts` | Process spawning: `Bun.spawn()` for sky commands, stdout streaming |
| `src/lib/cluster_client.ts` | React-side client: fetch cluster status, connect to SSE events |
| `src/App.tsx` | UI: Launch/Stop/Destroy buttons, status display, progress streaming |

### Why Gatekeeper (not Tauri backend)
- Gatekeeper already runs as a Bun process with HTTP API
- Process spawning (`Bun.spawn`) is Bun-native and well-supported
- Keeps Tauri backend thin (just IPC bridge)
- Testable without building Rust binary (`bun test`)
- Browser-mode dev works without Tauri

## 9. Timing Expectations

| Operation | Typical Duration |
|-----------|-----------------|
| First launch (new cluster) | 5-10 minutes |
| Re-launch (existing UP cluster) | 30-60 seconds |
| Start stopped cluster | 2-5 minutes |
| Stop cluster | 30-60 seconds |
| Destroy cluster | 30-60 seconds |
| Status check (with --refresh) | 2-5 seconds |
