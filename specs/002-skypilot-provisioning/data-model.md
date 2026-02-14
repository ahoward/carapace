# Data Model: SkyPilot Provisioning

**Feature**: 002-skypilot-provisioning
**Date**: 2026-02-14

## Entities

### Cluster

Represents a provisioned cloud VPS. Single-cluster MVP (one active at a time).

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Cluster name (e.g., `"carapace-node"`) |
| `status` | `ClusterStatus` | Current lifecycle state |
| `cloud` | `string \| null` | Cloud provider (e.g., `"aws"`, `"gcp"`) |
| `region` | `string \| null` | Cloud region (e.g., `"us-east-1"`) |
| `ip` | `string \| null` | Head node IP address (null until UP) |
| `launched_at` | `number \| null` | Unix timestamp of last launch |
| `error` | `string \| null` | Human-readable error message (null when healthy) |

### ClusterStatus

Lifecycle state machine for a cluster.

```
no_server → provisioning → running → stopping → stopped → destroying → no_server
                  ↓            ↓         ↓           ↓
                error        error     error       error
```

| Value | Description |
|-------|-------------|
| `no_server` | No cluster exists. Initial state and post-destroy state. |
| `provisioning` | `sky launch` in progress. SkyPilot is allocating resources. |
| `running` | Cluster is UP and reachable. |
| `stopping` | `sky stop` in progress. |
| `stopped` | Cluster stopped, disk preserved. Can be restarted. |
| `destroying` | `sky down` in progress. |
| `error` | Operation failed. `error` field contains details. |

**Transition rules:**
- `no_server` → `provisioning`: user triggers Launch
- `provisioning` → `running`: SkyPilot reports UP
- `provisioning` → `error`: SkyPilot launch fails
- `running` → `stopping`: user triggers Stop
- `stopping` → `stopped`: SkyPilot reports STOPPED
- `running` → `destroying`: user triggers Destroy
- `stopped` → `destroying`: user triggers Destroy
- `destroying` → `no_server`: SkyPilot confirms teardown
- `error` → `no_server`: user triggers Destroy (cleanup)
- `error` → `provisioning`: user retries Launch

### ProviderConfig

User's cloud provider selection and preferences. Stored in-memory for MVP.

| Field | Type | Description |
|-------|------|-------------|
| `cloud` | `string \| null` | Preferred cloud provider (null = let SkyPilot choose) |
| `region` | `string \| null` | Preferred region (null = let SkyPilot choose) |
| `instance_type` | `string \| null` | Preferred instance type (null = auto-select) |
| `cpus` | `string` | CPU requirement (default: `"4+"`) |
| `memory` | `string` | Memory requirement in GB (default: `"16+"`) |
| `disk_size` | `number` | Disk size in GB (default: `100`) |
| `use_spot` | `boolean` | Use spot instances (default: `false`) |

### SkyPilotConfig

The generated SkyPilot YAML configuration (internal, not user-facing).

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Cluster name |
| `resources` | `ResourceSpec` | CPU, memory, disk, cloud preferences |
| `envs` | `Record<string, string>` | Environment variables for the VPS |
| `file_mounts` | `Record<string, string>` | Local→remote path mappings |
| `setup` | `string` | Shell commands run once on provisioning |
| `run` | `string` | Shell commands run on each launch |

### ProvisioningEvent

A single line of progress output from a SkyPilot operation.

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | `string` | ISO 8601 timestamp |
| `type` | `"progress" \| "error" \| "complete"` | Event category |
| `message` | `string` | Human-readable progress line |

## Relationships

```
ProviderConfig --[generates]--> SkyPilotConfig --[drives]--> sky launch
     |                                                            |
     v                                                            v
   Cluster <--------------------[status polling]----------------- sky status
     |
     v
   ProvisioningEvent[] (streamed via SSE during operations)
```

## Validation Rules

1. **Cluster name**: lowercase alphanumeric + hyphens, 3-63 characters
2. **Only one active cluster**: If cluster status is not `no_server`, Launch is blocked (FR-010)
3. **Stop requires running**: Stop only valid when status is `running`
4. **Destroy requires non-no_server**: Destroy valid from `running`, `stopped`, or `error`
5. **ProviderConfig.cpus/memory**: Must match pattern `\d+\+?` (e.g., "4", "4+")
