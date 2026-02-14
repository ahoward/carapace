/**
 * Gatekeeper client — functional core.
 *
 * Pure async functions with no React/DOM dependencies.
 * Each function returns a ResultEnvelope — never throws.
 * Testable headlessly against a running gatekeeper.
 */

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

export interface HealthResult {
  mode: Mode;
  uptime_ms: number;
}

export interface SetModeResult {
  previous_mode: Mode;
  current_mode: Mode;
}

export interface FileEntry {
  name: string;
  kind: "file" | "directory";
  size: number;
}

export interface ListResult {
  mode: Mode;
  files: FileEntry[];
}

export interface ReadResult {
  path: string;
  content: string;
  size: number;
}

function network_error(path: string, err: unknown): ResultEnvelope<null> {
  const message = err instanceof Error ? err.message : String(err);
  return {
    status: "error",
    result: null,
    errors: { network: [message] },
    meta: {
      path,
      timestamp: new Date().toISOString(),
      duration_ms: 0,
    },
  };
}

export async function check_health(base_url: string): Promise<ResultEnvelope<HealthResult>> {
  try {
    const response = await fetch(`${base_url}/health`);
    return await response.json();
  } catch (err) {
    return network_error("/health", err);
  }
}

export async function fetch_file_list(base_url: string): Promise<ResultEnvelope<ListResult>> {
  try {
    const response = await fetch(`${base_url}/tools/fs/list`);
    return await response.json();
  } catch (err) {
    return network_error("/tools/fs/list", err);
  }
}

export async function read_file(
  base_url: string,
  path: string,
): Promise<ResultEnvelope<ReadResult>> {
  try {
    const response = await fetch(`${base_url}/tools/fs/read?path=${encodeURIComponent(path)}`);
    return await response.json();
  } catch (err) {
    return network_error("/tools/fs/read", err);
  }
}

export async function set_mode(
  base_url: string,
  mode: Mode,
): Promise<ResultEnvelope<SetModeResult>> {
  try {
    const response = await fetch(`${base_url}/control/set-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    return await response.json();
  } catch (err) {
    return network_error("/control/set-mode", err);
  }
}
