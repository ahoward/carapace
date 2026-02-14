/**
 * Cluster management handlers — HTTP handlers for SkyPilot provisioning.
 *
 * In-memory cluster state store + SSE event bus + route handlers.
 */

import { extract_error, generate_yaml, parse_check, parse_status } from "../../../src/lib/skypilot";
import { make_envelope, make_error } from "../envelope";
import {
  sky_binary,
  sky_check,
  sky_down,
  sky_ip,
  sky_launch,
  sky_status as sky_status_cmd,
  sky_stop,
} from "../services/sky_runner";
import type { Cluster, ClusterStatus, ProviderConfig, ProvisioningEvent } from "../types";

// ── T008: In-memory cluster state store ──

const CLUSTER_NAME = "carapace-node";

let cluster: Cluster | null = null;

export function get_cluster(): Cluster | null {
  return cluster;
}

export function set_cluster(c: Cluster | null): void {
  cluster = c;
}

function set_status(status: ClusterStatus, error?: string): void {
  if (cluster) {
    cluster.status = status;
    cluster.error = error ?? null;
  }
}

/**
 * Validate state transition. Returns error message if invalid, null if OK.
 */
function validate_transition(from: ClusterStatus, to: ClusterStatus): string | null {
  const valid: Record<ClusterStatus, ClusterStatus[]> = {
    no_server: ["provisioning"],
    provisioning: ["running", "error"],
    running: ["stopping", "destroying"],
    stopping: ["stopped", "error"],
    stopped: ["destroying", "provisioning"],
    destroying: ["no_server", "error"],
    error: ["no_server", "provisioning"],
  };

  if (valid[from]?.includes(to)) return null;
  return `invalid transition: ${from} → ${to}`;
}

// ── T009: SSE event bus ──

type SSEController = {
  write: (data: string) => void;
  flush: () => void;
  close: () => void;
};

const sse_clients: Set<SSEController> = new Set();

export function broadcast_event(event: ProvisioningEvent): void {
  const event_type = event.type;
  const data = JSON.stringify(event);
  const message = `event: ${event_type}\ndata: ${data}\n\n`;

  for (const client of sse_clients) {
    try {
      client.write(message);
      client.flush();
    } catch {
      sse_clients.delete(client);
    }
  }
}

function make_event(type: ProvisioningEvent["type"], message: string): ProvisioningEvent {
  return {
    timestamp: new Date().toISOString(),
    type,
    message,
  };
}

// ── Route handlers ──

/**
 * GET /cluster/check — check SkyPilot installation and credentials.
 */
export async function handle_cluster_check(pathname: string): Promise<Response> {
  const start = Date.now();

  const bin = sky_binary();
  if (!bin) {
    return Response.json(
      make_envelope(pathname, start, {
        sky_installed: false,
        sky_version: null,
        enabled_clouds: [],
        disabled_clouds: {},
      }),
    );
  }

  const result = await sky_check();
  const parsed = parse_check(result.stdout + result.stderr);

  return Response.json(
    make_envelope(pathname, start, {
      sky_installed: true,
      sky_version: null, // sky check doesn't reliably report version
      enabled_clouds: parsed.enabled,
      disabled_clouds: parsed.disabled,
    }),
  );
}

/**
 * POST /cluster/launch — trigger SkyPilot provisioning.
 */
export async function handle_cluster_launch(request: Request, pathname: string): Promise<Response> {
  const start = Date.now();

  // Check if cluster already active (FR-010)
  if (cluster && cluster.status !== "no_server") {
    return Response.json(
      make_error(pathname, start, {
        cluster: [`cluster already active (status: ${cluster.status})`],
      }),
      { status: 409 },
    );
  }

  // Check sky installed (FR-011)
  const bin = sky_binary();
  if (!bin) {
    return Response.json(
      make_error(pathname, start, {
        sky: [
          "SkyPilot not installed. Install with: pip install skypilot-nightly[aws] (or gcp, azure)",
        ],
      }),
      { status: 424 },
    );
  }

  // Check credentials (FR-008)
  const check_result = await sky_check();
  const check_parsed = parse_check(check_result.stdout + check_result.stderr);
  if (check_parsed.enabled.length === 0) {
    return Response.json(
      make_error(pathname, start, {
        credentials: ["No cloud credentials configured. Run `sky check` for setup instructions."],
      }),
      { status: 424 },
    );
  }

  // Parse optional config from request body
  let body: Partial<ProviderConfig> = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — all fields optional
  }

  // Generate YAML
  const config = {
    name: CLUSTER_NAME,
    resources: {
      cloud: body.cloud ?? null,
      region: body.region ?? null,
      instance_type: body.instance_type ?? null,
      cpus: body.cpus ?? "4+",
      memory: body.memory ?? "16+",
      disk_size: body.disk_size ?? 100,
      use_spot: body.use_spot ?? false,
      ports: [3001],
    },
    envs: {} as Record<string, string>,
    file_mounts: {
      "/opt/carapace/data/public": "./data/public",
      "/opt/carapace/data/private": "./data/private",
    },
    setup: "curl -fsSL https://get.docker.com | sh\nsudo usermod -aG docker $USER",
    run: "cd /opt/carapace && docker compose up -d\nwhile true; do sleep 3600; done",
  };

  const yaml = generate_yaml(config);

  // Write YAML to temp file
  const tmp_path = `/tmp/carapace-sky-${Date.now()}.yaml`;
  await Bun.write(tmp_path, yaml);

  // Set initial state
  cluster = {
    name: CLUSTER_NAME,
    status: "provisioning",
    cloud: body.cloud ?? null,
    region: body.region ?? null,
    ip: null,
    launched_at: Date.now(),
    error: null,
  };

  broadcast_event(make_event("progress", "Starting provisioning..."));

  // Spawn sky launch in background (don't await — return 202 immediately)
  sky_launch(tmp_path, CLUSTER_NAME, (line) => {
    broadcast_event(make_event("progress", line));
  }).then(async (result) => {
    if (result.exit_code === 0) {
      const ip = await sky_ip(CLUSTER_NAME);
      if (cluster && cluster.name === CLUSTER_NAME) {
        cluster.status = "running";
        cluster.ip = ip;
        cluster.error = null;
      }
      broadcast_event(make_event("complete", "Cluster is UP"));
    } else {
      const error_msg = extract_error(result.stderr);
      if (cluster && cluster.name === CLUSTER_NAME) {
        cluster.status = "error";
        cluster.error = error_msg;
      }
      broadcast_event(make_event("error", error_msg));
    }
  });

  return Response.json(
    make_envelope(pathname, start, {
      message: "Provisioning started",
      cluster_name: CLUSTER_NAME,
    }),
    { status: 202 },
  );
}

/**
 * GET /cluster/status — return current cluster state.
 */
export function handle_cluster_status(pathname: string): Response {
  const start = Date.now();

  if (!cluster) {
    return Response.json(
      make_envelope(pathname, start, {
        status: "no_server" as ClusterStatus,
        name: null,
        cloud: null,
        region: null,
        ip: null,
        launched_at: null,
        error: null,
      }),
    );
  }

  return Response.json(
    make_envelope(pathname, start, {
      status: cluster.status,
      name: cluster.name,
      cloud: cluster.cloud,
      region: cluster.region,
      ip: cluster.ip,
      launched_at: cluster.launched_at,
      error: cluster.error,
    }),
  );
}

/**
 * GET /cluster/status with server-side refresh (T021).
 * When a cluster exists, optionally poll sky status to reconcile.
 */
export async function handle_cluster_status_refresh(pathname: string): Promise<Response> {
  const start = Date.now();

  if (!cluster || cluster.status === "no_server") {
    // No cluster — check if one exists on the cloud side (app restart detection)
    const bin = sky_binary();
    if (bin) {
      const result = await sky_status_cmd(CLUSTER_NAME);
      const detected = parse_status(result.stdout, CLUSTER_NAME);
      if (detected !== "no_server") {
        // Cluster exists on cloud side — reconstruct local state
        const ip = detected === "running" ? await sky_ip(CLUSTER_NAME) : null;
        cluster = {
          name: CLUSTER_NAME,
          status: detected,
          cloud: null,
          region: null,
          ip,
          launched_at: null,
          error: null,
        };
      }
    }
  } else if (
    cluster.status === "running" ||
    cluster.status === "stopped" ||
    cluster.status === "provisioning"
  ) {
    // Reconcile with live cloud state (steady-state check)
    const bin = sky_binary();
    if (bin) {
      const result = await sky_status_cmd(CLUSTER_NAME);
      const live_status = parse_status(result.stdout, CLUSTER_NAME);

      // Only update if cloud reports a different final state
      if (live_status === "no_server" && cluster.status !== "no_server") {
        cluster = null;
      } else if (live_status === "running" && cluster.status !== "running") {
        const ip = await sky_ip(CLUSTER_NAME);
        cluster.status = "running";
        cluster.ip = ip;
        cluster.error = null;
      } else if (live_status === "stopped" && cluster.status !== "stopped") {
        cluster.status = "stopped";
        cluster.error = null;
      }
    }
  }

  return handle_cluster_status(pathname);
}

/**
 * GET /cluster/events — SSE stream.
 */
export function handle_cluster_events(): Response {
  const stream = new ReadableStream({
    type: "direct",
    pull(controller: SSEController) {
      sse_clients.add(controller);

      // Send initial connection event
      const init = make_event("progress", "Connected to event stream");
      controller.write(`event: progress\ndata: ${JSON.stringify(init)}\n\n`);
      controller.flush();

      // Keep connection open — controller stays in sse_clients set
      // Connection cleanup happens when client disconnects (write throws)
      return new Promise<void>(() => {
        // Never resolves — keeps the stream open
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * POST /cluster/stop — stop a running cluster.
 */
export async function handle_cluster_stop(pathname: string): Promise<Response> {
  const start = Date.now();

  if (!cluster) {
    return Response.json(make_error(pathname, start, { cluster: ["no cluster exists"] }), {
      status: 404,
    });
  }

  if (cluster.status !== "running") {
    return Response.json(
      make_error(pathname, start, {
        cluster: [`cluster is ${cluster.status}, must be running to stop`],
      }),
      { status: 409 },
    );
  }

  cluster.status = "stopping";
  broadcast_event(make_event("progress", "Stopping cluster..."));

  // Spawn sky stop in background
  sky_stop(CLUSTER_NAME).then((result) => {
    if (result.exit_code === 0) {
      if (cluster && cluster.name === CLUSTER_NAME) {
        cluster.status = "stopped";
        cluster.ip = null;
        cluster.error = null;
      }
      broadcast_event(make_event("complete", "Cluster stopped"));
    } else {
      const error_msg = extract_error(result.stderr);
      if (cluster && cluster.name === CLUSTER_NAME) {
        cluster.status = "error";
        cluster.error = error_msg;
      }
      broadcast_event(make_event("error", error_msg));
    }
  });

  return Response.json(
    make_envelope(pathname, start, {
      message: "Stop initiated",
      cluster_name: CLUSTER_NAME,
    }),
    { status: 202 },
  );
}

/**
 * POST /cluster/destroy — destroy a cluster completely.
 */
export async function handle_cluster_destroy(pathname: string): Promise<Response> {
  const start = Date.now();

  if (!cluster) {
    return Response.json(make_error(pathname, start, { cluster: ["no cluster exists"] }), {
      status: 404,
    });
  }

  if (cluster.status === "destroying") {
    return Response.json(
      make_error(pathname, start, { cluster: ["cluster is already being destroyed"] }),
      { status: 409 },
    );
  }

  // Destroy is valid from running, stopped, or error
  if (!["running", "stopped", "error"].includes(cluster.status)) {
    return Response.json(
      make_error(pathname, start, {
        cluster: [`cannot destroy cluster in ${cluster.status} state`],
      }),
      { status: 409 },
    );
  }

  cluster.status = "destroying";
  broadcast_event(make_event("progress", "Destroying cluster..."));

  // Spawn sky down in background
  sky_down(CLUSTER_NAME).then((result) => {
    if (result.exit_code === 0) {
      cluster = null;
      broadcast_event(make_event("complete", "Cluster destroyed"));
    } else {
      const error_msg = extract_error(result.stderr);
      if (cluster && cluster.name === CLUSTER_NAME) {
        cluster.status = "error";
        cluster.error = error_msg;
      }
      broadcast_event(make_event("error", error_msg));
    }
  });

  return Response.json(
    make_envelope(pathname, start, {
      message: "Destroy initiated",
      cluster_name: CLUSTER_NAME,
    }),
    { status: 202 },
  );
}

// Export for testing
export { CLUSTER_NAME };
