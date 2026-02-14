export type Mode = "LOCAL" | "CLOUD";

export interface ResultEnvelope<T> {
  status: "success" | "error";
  result: T | null;
  errors: Record<string, string[]> | null;
  meta: {
    path: string;
    timestamp: string;
    duration_ms: number;
  };
}

export interface FileEntry {
  name: string;
  kind: "file" | "directory";
  size: number;
}

export interface HealthResult {
  mode: Mode;
  uptime_ms: number;
}

export interface SetModeResult {
  previous_mode: Mode;
  current_mode: Mode;
}

export interface ReadResult {
  path: string;
  content: string;
  size: number;
}

export interface ListResult {
  mode: Mode;
  files: FileEntry[];
}

// ── Cluster provisioning types (Phase 1B) ──

export type ClusterStatus =
  | "no_server"
  | "provisioning"
  | "running"
  | "stopping"
  | "stopped"
  | "destroying"
  | "error";

export interface Cluster {
  name: string;
  status: ClusterStatus;
  cloud: string | null;
  region: string | null;
  ip: string | null;
  launched_at: number | null;
  error: string | null;
}

export interface ProviderConfig {
  cloud: string | null;
  region: string | null;
  instance_type: string | null;
  cpus: string;
  memory: string;
  disk_size: number;
  use_spot: boolean;
}

export interface SkyPilotConfig {
  name: string;
  resources: {
    cloud: string | null;
    region: string | null;
    instance_type: string | null;
    cpus: string;
    memory: string;
    disk_size: number;
    use_spot: boolean;
    ports: number[];
  };
  envs: Record<string, string>;
  file_mounts: Record<string, string>;
  setup: string;
  run: string;
}

export interface ProvisioningEvent {
  timestamp: string;
  type: "progress" | "error" | "complete";
  message: string;
}

// ── SkyPilot installer types (Phase 1C) ──

export type InstallPhase =
  | "checking"
  | "downloading_uv"
  | "installing_skypilot"
  | "verifying"
  | "complete"
  | "error";

export interface InstallProgress {
  phase: InstallPhase;
  message: string;
  percent: number | null;
}

export interface InstallStatus {
  uv_installed: boolean;
  uv_version: string | null;
  sky_installed: boolean;
  sky_version: string | null;
  carapace_home: string;
}
