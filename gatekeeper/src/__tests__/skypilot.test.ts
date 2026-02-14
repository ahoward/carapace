import { describe, expect, test } from "bun:test";
import { extract_error, generate_yaml, parse_check, parse_status } from "../../../src/lib/skypilot";
import type { SkyPilotConfig } from "../types";

// ── T004: generate_yaml tests ──

describe("generate_yaml", () => {
  const base_config: SkyPilotConfig = {
    name: "carapace-node",
    resources: {
      cloud: null,
      region: null,
      instance_type: null,
      cpus: "4+",
      memory: "16+",
      disk_size: 100,
      use_spot: false,
      ports: [3001],
    },
    envs: { TAILSCALE_AUTH_KEY: "tskey-xxx" },
    file_mounts: {
      "/opt/carapace/data/public": "./data/public",
      "/opt/carapace/data/private": "./data/private",
    },
    setup: "curl -fsSL https://get.docker.com | sh\nsudo usermod -aG docker $USER",
    run: "cd /opt/carapace && docker compose up -d\nwhile true; do sleep 3600; done",
  };

  test("includes cluster name", () => {
    const yaml = generate_yaml(base_config);
    expect(yaml).toContain("name: carapace-node");
  });

  test("includes resources section with cpus, memory, disk_size", () => {
    const yaml = generate_yaml(base_config);
    expect(yaml).toContain("resources:");
    expect(yaml).toContain("cpus: 4+");
    expect(yaml).toContain("memory: 16+");
    expect(yaml).toContain("disk_size: 100");
  });

  test("includes use_spot setting", () => {
    const yaml = generate_yaml(base_config);
    expect(yaml).toContain("use_spot: false");
  });

  test("includes ports list", () => {
    const yaml = generate_yaml(base_config);
    expect(yaml).toContain("ports:");
    expect(yaml).toContain("- 3001");
  });

  test("includes envs section", () => {
    const yaml = generate_yaml(base_config);
    expect(yaml).toContain("envs:");
    expect(yaml).toContain("TAILSCALE_AUTH_KEY: tskey-xxx");
  });

  test("includes file_mounts section", () => {
    const yaml = generate_yaml(base_config);
    expect(yaml).toContain("file_mounts:");
    expect(yaml).toContain("/opt/carapace/data/public: ./data/public");
    expect(yaml).toContain("/opt/carapace/data/private: ./data/private");
  });

  test("includes setup section", () => {
    const yaml = generate_yaml(base_config);
    expect(yaml).toContain("setup: |");
    expect(yaml).toContain("curl -fsSL https://get.docker.com | sh");
  });

  test("includes run section", () => {
    const yaml = generate_yaml(base_config);
    expect(yaml).toContain("run: |");
    expect(yaml).toContain("docker compose up -d");
  });

  test("includes cloud/region when specified", () => {
    const config: SkyPilotConfig = {
      ...base_config,
      resources: { ...base_config.resources, cloud: "aws", region: "us-east-1" },
    };
    const yaml = generate_yaml(config);
    expect(yaml).toContain("cloud: aws");
    expect(yaml).toContain("region: us-east-1");
  });

  test("omits cloud/region when null", () => {
    const yaml = generate_yaml(base_config);
    expect(yaml).not.toContain("cloud:");
    expect(yaml).not.toContain("region:");
  });

  test("includes instance_type when specified", () => {
    const config: SkyPilotConfig = {
      ...base_config,
      resources: { ...base_config.resources, instance_type: "m5.xlarge" },
    };
    const yaml = generate_yaml(config);
    expect(yaml).toContain("instance_type: m5.xlarge");
  });
});

// ── T005: parse_status tests ──

describe("parse_status", () => {
  test("returns running for UP status", () => {
    const stdout = `NAME            LAUNCHED     RESOURCES            STATUS   AUTOSTOP  COMMAND
carapace-node   2 mins ago   1x AWS(m5.xlarge)    UP       60 min    sky launch ...`;
    expect(parse_status(stdout, "carapace-node")).toBe("running");
  });

  test("returns stopped for STOPPED status", () => {
    const stdout = `NAME            LAUNCHED     RESOURCES            STATUS    AUTOSTOP  COMMAND
carapace-node   1 hr ago     1x AWS(m5.xlarge)    STOPPED   -         sky launch ...`;
    expect(parse_status(stdout, "carapace-node")).toBe("stopped");
  });

  test("returns provisioning for INIT status", () => {
    const stdout = `NAME            LAUNCHED     RESOURCES            STATUS   AUTOSTOP  COMMAND
carapace-node   just now     1x AWS(m5.xlarge)    INIT     60 min    sky launch ...`;
    expect(parse_status(stdout, "carapace-node")).toBe("provisioning");
  });

  test("returns no_server when cluster not in output", () => {
    const stdout = `NAME            LAUNCHED     RESOURCES            STATUS   AUTOSTOP  COMMAND
other-cluster   2 mins ago   1x GCP(n1-std-4)     UP       60 min    sky launch ...`;
    expect(parse_status(stdout, "carapace-node")).toBe("no_server");
  });

  test("returns no_server for empty output", () => {
    expect(parse_status("", "carapace-node")).toBe("no_server");
  });

  test("returns no_server for output with only headers", () => {
    const stdout = "NAME  LAUNCHED  RESOURCES  STATUS  AUTOSTOP  COMMAND\n";
    expect(parse_status(stdout, "carapace-node")).toBe("no_server");
  });
});

// ── T006: parse_check tests ──

describe("parse_check", () => {
  test("extracts enabled clouds", () => {
    const stdout = `Checking credentials to enable clouds for SkyPilot.
  AWS: enabled [compute, storage]
  GCP: enabled [compute, storage]
  Azure: disabled
    Reason: ~/.azure/msal_token_cache.json does not exist. Run: az login`;

    const result = parse_check(stdout);
    expect(result.enabled).toContain("aws");
    expect(result.enabled).toContain("gcp");
    expect(result.enabled).not.toContain("azure");
  });

  test("extracts disabled clouds with reasons", () => {
    const stdout = `Checking credentials to enable clouds for SkyPilot.
  AWS: enabled [compute, storage]
  Azure: disabled
    Reason: ~/.azure/msal_token_cache.json does not exist
  Lambda: disabled
    Reason: Credentials not found`;

    const result = parse_check(stdout);
    expect(result.disabled.azure).toContain("does not exist");
    expect(result.disabled.lambda).toContain("Credentials not found");
  });

  test("returns empty for no clouds", () => {
    const result = parse_check("No output");
    expect(result.enabled).toEqual([]);
    expect(result.disabled).toEqual({});
  });

  test("handles all clouds enabled", () => {
    const stdout = `  AWS: enabled [compute]
  GCP: enabled [compute]`;
    const result = parse_check(stdout);
    expect(result.enabled).toEqual(["aws", "gcp"]);
    expect(Object.keys(result.disabled)).toEqual([]);
  });
});

// ── T007: extract_error tests ──

describe("extract_error", () => {
  test("detects credentials not found", () => {
    const stderr = "sky.exceptions.SomeError: Credentials not found for AWS";
    expect(extract_error(stderr)).toContain("credentials not configured");
  });

  test("detects no cloud access", () => {
    const stderr = "sky.exceptions.NoCloudAccessError: No cloud access credentials found.";
    expect(extract_error(stderr)).toContain("No cloud provider enabled");
  });

  test("detects resources unavailable", () => {
    const stderr =
      "sky.exceptions.ResourcesUnavailableError: Failed to provision all possible launchable resources.";
    expect(extract_error(stderr)).toContain("unavailable");
  });

  test("detects catalog mismatch", () => {
    const stderr =
      "sky.exceptions.ResourcesUnavailableError: Catalog does not contain any instances satisfying the request.";
    expect(extract_error(stderr)).toContain("No matching instance type");
  });

  test("detects failed to provision", () => {
    const stderr = "Failed to provision resources in us-east-1a.";
    expect(extract_error(stderr)).toContain("could not allocate resources");
  });

  test("returns last line for unknown errors", () => {
    const stderr = "some random error\nthe actual error message";
    expect(extract_error(stderr)).toBe("the actual error message");
  });

  test("returns unknown for empty stderr", () => {
    expect(extract_error("")).toBe("Unknown error occurred");
  });
});
