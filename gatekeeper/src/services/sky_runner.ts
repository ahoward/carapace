/**
 * SkyPilot process spawning service.
 *
 * Async functions that spawn `sky` CLI commands via Bun.spawn().
 * No HTTP concerns — just process management.
 */

import { existsSync } from "node:fs";
import { sky_binary_path } from "./uv_installer";

export interface SkyRunnerResult {
  exit_code: number;
  stdout: string;
  stderr: string;
}

/**
 * Check if the `sky` binary is available.
 *
 * Resolution order:
 *   1. Carapace-managed path (~/.carapace/tools/bin/sky)
 *   2. System PATH fallback (Bun.which("sky"))
 *
 * Returns the absolute path or null.
 */
export function sky_binary(): string | null {
  const managed = sky_binary_path();
  if (existsSync(managed)) {
    return managed;
  }
  return Bun.which("sky");
}

/**
 * Launch a cluster. Streams progress line-by-line via callback.
 */
export async function sky_launch(
  yaml_path: string,
  cluster_name: string,
  on_progress: (line: string) => void,
): Promise<SkyRunnerResult> {
  const bin = sky_binary();
  if (!bin) {
    return { exit_code: 1, stdout: "", stderr: "sky binary not found in PATH" };
  }

  const proc = Bun.spawn([bin, "launch", "-c", cluster_name, "-y", yaml_path], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });

  // Stream stdout line-by-line, drain stderr in background
  const stderr_promise = new Response(proc.stderr).text();

  let buffer = "";
  const decoder = new TextDecoder();
  for await (const chunk of proc.stdout) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) on_progress(line);
    }
  }
  if (buffer.trim()) on_progress(buffer);

  const exit_code = await proc.exited;
  const stderr = await stderr_promise;

  return { exit_code, stdout: "", stderr };
}

/**
 * Stop a cluster (preserves disk).
 */
export async function sky_stop(cluster_name: string): Promise<SkyRunnerResult> {
  return run_sky(["stop", cluster_name, "-y"]);
}

/**
 * Destroy a cluster completely.
 */
export async function sky_down(cluster_name: string): Promise<SkyRunnerResult> {
  return run_sky(["down", cluster_name, "-y"]);
}

/**
 * Get cluster status (with refresh).
 */
export async function sky_status(cluster_name: string): Promise<SkyRunnerResult> {
  return run_sky(["status", cluster_name, "--refresh"]);
}

/**
 * Check SkyPilot installation and credentials.
 */
export async function sky_check(): Promise<SkyRunnerResult> {
  return run_sky(["check"]);
}

/**
 * Get cluster head node IP.
 * Returns the IP string or null if not available.
 */
export async function sky_ip(cluster_name: string): Promise<string | null> {
  const result = await run_sky(["status", cluster_name, "--ip"]);
  if (result.exit_code === 0) {
    const ip = result.stdout.trim();
    return ip || null;
  }
  return null;
}

/**
 * Internal: run a sky command and collect all output.
 */
async function run_sky(args: string[]): Promise<SkyRunnerResult> {
  const bin = sky_binary();
  if (!bin) {
    return { exit_code: 1, stdout: "", stderr: "sky binary not found in PATH" };
  }

  const proc = Bun.spawn([bin, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });

  const [stdout, stderr, exit_code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exit_code, stdout, stderr };
}
