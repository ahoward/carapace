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
