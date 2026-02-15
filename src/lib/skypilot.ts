/**
 * SkyPilot pure functions — no IO, no React, no Bun.
 *
 * YAML generation, status parsing, error extraction.
 * Testable headlessly.
 */

import type { ClusterStatus, SkyPilotConfig } from "../../gatekeeper/src/types";

/** Strip ANSI escape codes from a string. */
function strip_ansi(s: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequence stripping requires matching \x1b
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Generate a SkyPilot YAML string from a config object.
 * Uses template strings — no YAML library needed for our flat structure.
 */
export function generate_yaml(config: SkyPilotConfig): string {
  const lines: string[] = [];

  lines.push(`name: ${config.name}`);
  lines.push("");

  // resources
  lines.push("resources:");
  if (config.resources.cloud) {
    lines.push(`  cloud: ${config.resources.cloud}`);
  }
  if (config.resources.region) {
    lines.push(`  region: ${config.resources.region}`);
  }
  if (config.resources.instance_type) {
    lines.push(`  instance_type: ${config.resources.instance_type}`);
  }
  lines.push(`  cpus: ${config.resources.cpus}`);
  lines.push(`  memory: ${config.resources.memory}`);
  lines.push(`  disk_size: ${config.resources.disk_size}`);
  lines.push(`  use_spot: ${config.resources.use_spot}`);
  if (config.resources.ports.length > 0) {
    lines.push("  ports:");
    for (const port of config.resources.ports) {
      lines.push(`    - ${port}`);
    }
  }
  lines.push("");

  // envs
  if (Object.keys(config.envs).length > 0) {
    lines.push("envs:");
    for (const [key, value] of Object.entries(config.envs)) {
      lines.push(`  ${key}: ${value}`);
    }
    lines.push("");
  }

  // file_mounts
  if (Object.keys(config.file_mounts).length > 0) {
    lines.push("file_mounts:");
    for (const [remote, local] of Object.entries(config.file_mounts)) {
      lines.push(`  ${remote}: ${local}`);
    }
    lines.push("");
  }

  // setup
  if (config.setup) {
    lines.push("setup: |");
    for (const line of config.setup.split("\n")) {
      lines.push(`  ${line}`);
    }
    lines.push("");
  }

  // run
  if (config.run) {
    lines.push("run: |");
    for (const line of config.run.split("\n")) {
      lines.push(`  ${line}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Parse `sky status` tabular output to extract cluster state.
 * SkyPilot states: INIT, UP, STOPPED (or absent = no_server).
 */
export function parse_status(stdout: string, cluster_name: string): ClusterStatus {
  const lines = stdout.split("\n");

  for (const line of lines) {
    // Look for a line that contains the cluster name
    if (!line.includes(cluster_name)) continue;

    // Match known SkyPilot states in the line
    if (/\bUP\b/.test(line)) return "running";
    if (/\bSTOPPED\b/.test(line)) return "stopped";
    if (/\bINIT\b/.test(line)) return "provisioning";
  }

  // Cluster not in output = destroyed or never created
  return "no_server";
}

/**
 * Parse `sky check` output to extract enabled/disabled clouds.
 */
export function parse_check(stdout: string): {
  enabled: string[];
  disabled: Record<string, string>;
} {
  const enabled: string[] = [];
  const disabled: Record<string, string> = {};
  const lines = strip_ansi(stdout).split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match "CloudName: enabled" or "CloudName: disabled"
    const match = line.match(/^(\w[\w\s]*?):\s+(enabled|disabled)/i);
    if (match) {
      const cloud = match[1].trim().toLowerCase();
      const state = match[2].toLowerCase();

      if (state === "enabled") {
        enabled.push(cloud);
      } else {
        // Look for "Reason:" on the next line(s)
        let reason = "unknown";
        for (let j = i + 1; j < lines.length && j <= i + 3; j++) {
          const next = lines[j].trim();
          if (next.startsWith("Reason:")) {
            reason = next.slice("Reason:".length).trim();
            break;
          }
          // Stop if we hit another cloud entry
          if (/^\w[\w\s]*?:\s+(enabled|disabled)/i.test(next)) break;
        }
        disabled[cloud] = reason;
      }
    }
  }

  return { enabled, disabled };
}

/**
 * Extract a human-readable error from SkyPilot stderr.
 * Pattern-matches known error types into friendly messages.
 */
export function extract_error(stderr: string): string {
  if (stderr.includes("Credentials not found") || stderr.includes("credentials not found")) {
    return "Cloud credentials not configured. Run `sky check` for setup instructions.";
  }
  if (stderr.includes("No cloud access") || stderr.includes("NoCloudAccessError")) {
    return "No cloud provider enabled. Run `sky check` for setup instructions.";
  }
  if (stderr.includes("ResourcesUnavailableError")) {
    if (stderr.includes("Catalog does not contain")) {
      return "No matching instance type found. Try relaxing resource requirements.";
    }
    return "Requested resources unavailable. Try a different region or instance type.";
  }
  if (stderr.includes("Failed to provision")) {
    return "Cloud provider could not allocate resources. Check quotas and try again.";
  }

  // Fallback: return the last non-empty line of stderr (often the most relevant)
  const lines = stderr.trim().split("\n").filter(Boolean);
  if (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    // Truncate if very long
    return last.length > 200 ? `${last.slice(0, 200)}...` : last;
  }

  return "Unknown error occurred";
}
