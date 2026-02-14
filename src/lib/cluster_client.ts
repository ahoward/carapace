/**
 * Cluster client — typed HTTP functions for cluster management.
 *
 * Pure async functions with no React/DOM dependencies.
 * Each function returns a ResultEnvelope — never throws.
 */

import type { ClusterStatus, ProvisioningEvent } from "../../gatekeeper/src/types";

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

export interface ClusterStatusResult {
  status: ClusterStatus;
  name: string | null;
  cloud: string | null;
  region: string | null;
  ip: string | null;
  launched_at: number | null;
  error: string | null;
}

export interface ClusterCheckResult {
  sky_installed: boolean;
  sky_version: string | null;
  enabled_clouds: string[];
  disabled_clouds: Record<string, string>;
}

export interface ClusterLaunchResult {
  message: string;
  cluster_name: string;
}

export interface ClusterActionResult {
  message: string;
  cluster_name: string;
}

function network_error(path: string, err: unknown): ResultEnvelope<null> {
  const message = err instanceof Error ? err.message : String(err);
  return {
    status: "error",
    result: null,
    errors: { network: [message] },
    meta: { path, timestamp: new Date().toISOString(), duration_ms: 0 },
  };
}

export async function cluster_status(
  base_url: string,
): Promise<ResultEnvelope<ClusterStatusResult>> {
  try {
    const response = await fetch(`${base_url}/cluster/status`);
    return await response.json();
  } catch (err) {
    return network_error("/cluster/status", err);
  }
}

export async function cluster_check(base_url: string): Promise<ResultEnvelope<ClusterCheckResult>> {
  try {
    const response = await fetch(`${base_url}/cluster/check`);
    return await response.json();
  } catch (err) {
    return network_error("/cluster/check", err);
  }
}

export async function cluster_launch(
  base_url: string,
  config?: { cloud?: string; region?: string; instance_type?: string },
): Promise<ResultEnvelope<ClusterLaunchResult>> {
  try {
    const response = await fetch(`${base_url}/cluster/launch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: config ? JSON.stringify(config) : "{}",
    });
    return await response.json();
  } catch (err) {
    return network_error("/cluster/launch", err);
  }
}

export async function cluster_stop(base_url: string): Promise<ResultEnvelope<ClusterActionResult>> {
  try {
    const response = await fetch(`${base_url}/cluster/stop`, { method: "POST" });
    return await response.json();
  } catch (err) {
    return network_error("/cluster/stop", err);
  }
}

export async function cluster_destroy(
  base_url: string,
): Promise<ResultEnvelope<ClusterActionResult>> {
  try {
    const response = await fetch(`${base_url}/cluster/destroy`, { method: "POST" });
    return await response.json();
  } catch (err) {
    return network_error("/cluster/destroy", err);
  }
}

/**
 * Connect to the SSE event stream.
 * Returns an EventSource that emits progress/complete/error events.
 */
export function cluster_events(base_url: string): EventSource {
  return new EventSource(`${base_url}/cluster/events`);
}
