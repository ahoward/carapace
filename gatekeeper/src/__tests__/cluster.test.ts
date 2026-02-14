import { beforeEach, describe, expect, test } from "bun:test";
import {
  handle_cluster_check,
  handle_cluster_destroy,
  handle_cluster_launch,
  handle_cluster_status,
  handle_cluster_stop,
  handle_ensure_skypilot,
  handle_install_status,
  set_cluster,
} from "../handlers/cluster";
import type { Cluster } from "../types";

// ── Helper ──

function make_request(body?: unknown): Request {
  return new Request("http://localhost:3001/cluster/launch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── T010: POST /cluster/launch tests ──

describe("POST /cluster/launch", () => {
  beforeEach(() => {
    set_cluster(null);
  });

  test("returns 409 when cluster already active", async () => {
    set_cluster({
      name: "carapace-node",
      status: "running",
      cloud: "aws",
      region: "us-east-1",
      ip: "1.2.3.4",
      launched_at: Date.now(),
      error: null,
    });

    const response = await handle_cluster_launch(make_request(), "/cluster/launch");
    expect(response.status).toBe(409);

    const body = await response.json();
    expect(body.status).toBe("error");
    expect(body.errors.cluster[0]).toContain("already active");
  });

  test("returns 409 when cluster is provisioning", async () => {
    set_cluster({
      name: "carapace-node",
      status: "provisioning",
      cloud: null,
      region: null,
      ip: null,
      launched_at: Date.now(),
      error: null,
    });

    const response = await handle_cluster_launch(make_request(), "/cluster/launch");
    expect(response.status).toBe(409);
  });

  test("attempts auto-install when sky not available", async () => {
    // With auto-install wired in, the handler either:
    // - succeeds installing and proceeds (424 for no credentials, or 202)
    // - fails installing and returns 424 with install error
    // Use a longer timeout since auto-install may download uv
    const response = await handle_cluster_launch(make_request(), "/cluster/launch");
    // 424 = install failed or no credentials; 202 = launch started
    expect([202, 424]).toContain(response.status);

    if (response.status === 424) {
      const body = await response.json();
      expect(body.status).toBe("error");
      // Error should mention sky or credentials, not the old "pip install" message
      const error_keys = Object.keys(body.errors);
      expect(error_keys.length).toBeGreaterThan(0);
    }
  }, 120_000);
});

// ── T011: GET /cluster/check tests ──

describe("GET /cluster/check", () => {
  test("returns sky_installed boolean and cloud info", async () => {
    const response = await handle_cluster_check("/cluster/check");
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("success");
    expect(typeof body.result.sky_installed).toBe("boolean");
    expect(Array.isArray(body.result.enabled_clouds)).toBe(true);
    expect(typeof body.result.disabled_clouds).toBe("object");
  }, 120_000);
});

// ── T014: GET /cluster/status tests ──

describe("GET /cluster/status", () => {
  beforeEach(() => {
    set_cluster(null);
  });

  test("returns no_server when no cluster exists", () => {
    const response = handle_cluster_status("/cluster/status");
    expect(response.status).toBe(200);
  });

  test("returns cluster info when cluster exists", async () => {
    set_cluster({
      name: "carapace-node",
      status: "running",
      cloud: "aws",
      region: "us-east-1",
      ip: "1.2.3.4",
      launched_at: Date.now(),
      error: null,
    });

    const response = handle_cluster_status("/cluster/status");
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.result.status).toBe("running");
    expect(body.result.name).toBe("carapace-node");
    expect(body.result.ip).toBe("1.2.3.4");
  });

  test("returns no_server status shape when cluster is null", async () => {
    const response = handle_cluster_status("/cluster/status");
    const body = await response.json();
    expect(body.result.status).toBe("no_server");
    expect(body.result.name).toBeNull();
    expect(body.result.ip).toBeNull();
  });
});

// ── T022: POST /cluster/stop tests ──

describe("POST /cluster/stop", () => {
  beforeEach(() => {
    set_cluster(null);
  });

  test("returns 404 when no cluster exists", async () => {
    const response = await handle_cluster_stop("/cluster/stop");
    expect(response.status).toBe(404);
  });

  test("returns 409 when cluster not running", async () => {
    set_cluster({
      name: "carapace-node",
      status: "stopped",
      cloud: "aws",
      region: "us-east-1",
      ip: null,
      launched_at: Date.now(),
      error: null,
    });

    const response = await handle_cluster_stop("/cluster/stop");
    expect(response.status).toBe(409);

    const body = await response.json();
    expect(body.errors.cluster[0]).toContain("must be running");
  });
});

// ── T022: POST /cluster/destroy tests ──

describe("POST /cluster/destroy", () => {
  beforeEach(() => {
    set_cluster(null);
  });

  test("returns 404 when no cluster exists", async () => {
    const response = await handle_cluster_destroy("/cluster/destroy");
    expect(response.status).toBe(404);
  });

  test("returns 409 when cluster already destroying", async () => {
    set_cluster({
      name: "carapace-node",
      status: "destroying",
      cloud: "aws",
      region: null,
      ip: null,
      launched_at: Date.now(),
      error: null,
    });

    const response = await handle_cluster_destroy("/cluster/destroy");
    expect(response.status).toBe(409);

    const body = await response.json();
    expect(body.errors.cluster[0]).toContain("already being destroyed");
  });

  test("returns 409 when cluster in invalid state for destroy", async () => {
    set_cluster({
      name: "carapace-node",
      status: "provisioning",
      cloud: null,
      region: null,
      ip: null,
      launched_at: Date.now(),
      error: null,
    });

    const response = await handle_cluster_destroy("/cluster/destroy");
    expect(response.status).toBe(409);
  });
});

// ── T016: GET /cluster/install-status tests ──

describe("GET /cluster/install-status", () => {
  test("returns 200 with install status shape", async () => {
    const response = await handle_install_status("/cluster/install-status");
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("success");
    expect(typeof body.result.uv_installed).toBe("boolean");
    expect(typeof body.result.sky_installed).toBe("boolean");
    expect(typeof body.result.carapace_home).toBe("string");
    expect(body.result.carapace_home.startsWith("/")).toBe(true);
  });

  test("uv_version and sky_version are string or null", async () => {
    const response = await handle_install_status("/cluster/install-status");
    const body = await response.json();
    expect(body.result.uv_version === null || typeof body.result.uv_version === "string").toBe(
      true,
    );
    expect(body.result.sky_version === null || typeof body.result.sky_version === "string").toBe(
      true,
    );
  });
});

// ── T016: POST /cluster/ensure-skypilot tests ──

describe("POST /cluster/ensure-skypilot", () => {
  test("returns 200 when already installed or 202 when starting install", async () => {
    const response = await handle_ensure_skypilot("/cluster/ensure-skypilot");
    // 200 = already installed, 202 = install started
    expect([200, 202]).toContain(response.status);

    const body = await response.json();
    expect(body.status).toBe("success");
    expect(typeof body.result.message).toBe("string");
  });
});
