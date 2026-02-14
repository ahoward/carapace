# API Contract: Cluster Management

**Feature**: 002-skypilot-provisioning
**Date**: 2026-02-14

All endpoints use the existing Gatekeeper `ResultEnvelope<T>` pattern:
```typescript
{
  status: "success" | "error",
  result: T | null,
  errors: Record<string, string[]> | null,
  meta: { path: string, timestamp: string, duration_ms: number }
}
```

## Endpoints

### POST /cluster/launch

Triggers SkyPilot provisioning. Returns immediately (202 Accepted). Provisioning runs async.

**Request body:**
```typescript
{
  cloud?: string;       // e.g., "aws", "gcp" (null = auto)
  region?: string;      // e.g., "us-east-1" (null = auto)
  instance_type?: string; // e.g., "m5.xlarge" (null = auto)
}
```

**Response (202):**
```typescript
ResultEnvelope<{ message: string; cluster_name: string }>
```

**Error cases:**
- `409`: Cluster already active (provisioning/running/stopped) — FR-010
- `424`: SkyPilot not installed — FR-011
- `424`: No cloud credentials configured — FR-008

### POST /cluster/stop

Stops the running cluster (preserves disk).

**Request body:** none

**Response (202):**
```typescript
ResultEnvelope<{ message: string; cluster_name: string }>
```

**Error cases:**
- `409`: Cluster not in `running` state
- `404`: No cluster exists

### POST /cluster/destroy

Destroys the cluster completely (removes all cloud resources).

**Request body:** none

**Response (202):**
```typescript
ResultEnvelope<{ message: string; cluster_name: string }>
```

**Error cases:**
- `404`: No cluster exists
- `409`: Cluster already being destroyed

### GET /cluster/status

Returns current cluster state.

**Response (200):**
```typescript
ResultEnvelope<{
  status: ClusterStatus;     // "no_server" | "provisioning" | "running" | ...
  name: string | null;       // Cluster name (null if no_server)
  cloud: string | null;      // Cloud provider
  region: string | null;     // Region
  ip: string | null;         // Head node IP (null until running)
  launched_at: number | null; // Unix timestamp
  error: string | null;      // Error message if status is "error"
}>
```

### GET /cluster/events

SSE stream of provisioning/lifecycle events. Client connects via `EventSource`.

**Response:** `text/event-stream`

```
event: progress
data: {"timestamp":"2026-02-14T12:34:00Z","type":"progress","message":"Launching on AWS (us-east-1)..."}

event: progress
data: {"timestamp":"2026-02-14T12:34:05Z","type":"progress","message":"Setting up cluster..."}

event: complete
data: {"timestamp":"2026-02-14T12:40:00Z","type":"complete","message":"Cluster is UP"}

event: error
data: {"timestamp":"2026-02-14T12:35:00Z","type":"error","message":"Failed to provision: quota exceeded"}
```

### GET /cluster/check

Checks SkyPilot installation and cloud credential status.

**Response (200):**
```typescript
ResultEnvelope<{
  sky_installed: boolean;
  sky_version: string | null;
  enabled_clouds: string[];    // e.g., ["aws", "gcp"]
  disabled_clouds: Record<string, string>; // cloud → reason
}>
```

## Internal Service Contracts

### sky_runner.ts

```typescript
// Pure async functions — no HTTP, just process spawning

interface SkyRunnerResult {
  exit_code: number;
  stdout: string;
  stderr: string;
}

// Launch a cluster. Streams progress via callback.
function sky_launch(
  yaml_path: string,
  cluster_name: string,
  on_progress: (line: string) => void
): Promise<SkyRunnerResult>;

// Stop a cluster.
function sky_stop(cluster_name: string): Promise<SkyRunnerResult>;

// Destroy a cluster.
function sky_down(cluster_name: string): Promise<SkyRunnerResult>;

// Get cluster status (with refresh).
function sky_status(cluster_name: string): Promise<SkyRunnerResult>;

// Check SkyPilot installation and credentials.
function sky_check(): Promise<SkyRunnerResult>;

// Get cluster IP.
function sky_ip(cluster_name: string): Promise<string | null>;
```

### skypilot.ts (pure functions, no IO)

```typescript
// Generate SkyPilot YAML string from config
function generate_yaml(config: SkyPilotConfig): string;

// Parse sky status output to extract cluster state
function parse_status(stdout: string, cluster_name: string): ClusterStatus;

// Parse sky check output to extract enabled clouds
function parse_check(stdout: string): {
  enabled: string[];
  disabled: Record<string, string>;
};

// Extract human-readable error from stderr
function extract_error(stderr: string): string;
```
