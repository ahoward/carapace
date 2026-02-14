/**
 * uv-based SkyPilot installer — THE steel thread.
 *
 * One install code path for dev, prod, and Docker.
 * Downloads uv binary, then `uv tool install skypilot-nightly[aws]`.
 * All artifacts live under ~/.carapace/ — no system pollution.
 */

import { existsSync } from "node:fs";
import { chmod, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { InstallProgress, InstallStatus } from "../types";

// ── Path functions (pure, sync) ──

export function carapace_home(): string {
  return path.join(os.homedir(), ".carapace");
}

export function uv_binary_path(): string {
  return path.join(carapace_home(), "uv", "bin", "uv");
}

export function sky_binary_path(): string {
  return path.join(carapace_home(), "tools", "bin", "sky");
}

export function uv_env(): Record<string, string> {
  const home = carapace_home();
  return {
    UV_TOOL_BIN_DIR: path.join(home, "tools", "bin"),
    UV_TOOL_DIR: path.join(home, "tools", "environments"),
    UV_PYTHON_INSTALL_DIR: path.join(home, "python"),
  };
}

export function detect_platform(): { arch: string; os: string } {
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  const os_name = process.platform === "darwin" ? "apple-darwin" : "unknown-linux-gnu";
  return { arch, os: os_name };
}

// ── Detection functions (async, IO) ──

export async function detect_uv(): Promise<string | null> {
  const bin = uv_binary_path();
  if (!existsSync(bin)) return null;

  try {
    const proc = Bun.spawn([bin, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    const version = stdout.trim().replace(/^uv\s+/, "");
    return version || null;
  } catch {
    return null;
  }
}

export async function detect_sky(): Promise<string | null> {
  const bin = sky_binary_path();
  if (!existsSync(bin)) return null;
  return "installed";
}

export async function check_install_status(): Promise<InstallStatus> {
  const [uv_version, sky_version] = await Promise.all([detect_uv(), detect_sky()]);

  return {
    uv_installed: uv_version !== null,
    uv_version,
    sky_installed: sky_version !== null,
    sky_version,
    carapace_home: carapace_home(),
  };
}

// ── Installation (THE steel thread) ──

let install_promise: Promise<string> | null = null;

export async function ensure_skypilot(
  on_progress: (progress: InstallProgress) => void,
): Promise<string> {
  // Concurrency guard: if already installing, wait for it
  if (install_promise) {
    on_progress({
      phase: "checking",
      message: "Installation already in progress, waiting...",
      percent: null,
    });
    return install_promise;
  }

  install_promise = do_ensure_skypilot(on_progress).finally(() => {
    install_promise = null;
  });

  return install_promise;
}

async function do_ensure_skypilot(
  on_progress: (progress: InstallProgress) => void,
): Promise<string> {
  on_progress({
    phase: "checking",
    message: "Checking existing installation...",
    percent: null,
  });

  // Already installed?
  const sky_path = sky_binary_path();
  if (existsSync(sky_path)) {
    on_progress({
      phase: "complete",
      message: "SkyPilot already installed",
      percent: 100,
    });
    return sky_path;
  }

  // Ensure uv is present
  const uv_path = uv_binary_path();
  if (!existsSync(uv_path)) {
    await download_uv(on_progress);
  }

  // Install SkyPilot via uv
  on_progress({
    phase: "installing_skypilot",
    message: "Installing SkyPilot (this may take 1-2 minutes)...",
    percent: null,
  });

  const env = { ...process.env, ...uv_env() };

  // Ensure tool directories exist
  await mkdir(env.UV_TOOL_BIN_DIR, { recursive: true });
  await mkdir(env.UV_TOOL_DIR, { recursive: true });
  await mkdir(env.UV_PYTHON_INSTALL_DIR, { recursive: true });

  const proc = Bun.spawn([uv_path, "tool", "install", "skypilot-nightly[aws]"], {
    stdout: "pipe",
    stderr: "pipe",
    env,
  });

  // Stream output for progress
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of proc.stdout) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) {
        on_progress({
          phase: "installing_skypilot",
          message: line.trim(),
          percent: null,
        });
      }
    }
  }

  const stderr = await new Response(proc.stderr).text();
  const exit_code = await proc.exited;

  if (exit_code !== 0) {
    // Stream stderr lines as progress too
    for (const line of stderr.split("\n")) {
      if (line.trim()) {
        on_progress({
          phase: "installing_skypilot",
          message: line.trim(),
          percent: null,
        });
      }
    }
    throw new Error(
      `SkyPilot installation failed (exit ${exit_code}): ${stderr.trim().split("\n").pop() || "unknown error"}`,
    );
  }

  // Verify
  on_progress({
    phase: "verifying",
    message: "Verifying installation...",
    percent: null,
  });

  if (!existsSync(sky_path)) {
    throw new Error(`sky binary not found at ${sky_path} after installation`);
  }

  on_progress({
    phase: "complete",
    message: "SkyPilot installed successfully",
    percent: 100,
  });

  return sky_path;
}

async function download_uv(on_progress: (progress: InstallProgress) => void): Promise<void> {
  on_progress({
    phase: "downloading_uv",
    message: "Downloading uv package manager...",
    percent: 0,
  });

  const platform = detect_platform();
  const target = `uv-${platform.arch}-${platform.os}`;
  const url = `https://github.com/astral-sh/uv/releases/latest/download/${target}.tar.gz`;

  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Failed to download uv: HTTP ${response.status} from ${url}`);
  }

  // Write to temp file
  const tmp_dir = path.join(os.tmpdir(), `carapace-uv-${Date.now()}`);
  await mkdir(tmp_dir, { recursive: true });
  const tmp_tarball = path.join(tmp_dir, "uv.tar.gz");

  const total = Number(response.headers.get("content-length") ?? 0);
  let downloaded = 0;

  const body = response.body;
  if (!body) throw new Error("No response body from uv download");

  const file = Bun.file(tmp_tarball);
  const writer = file.writer();

  for await (const chunk of body) {
    writer.write(chunk);
    downloaded += chunk.length;
    if (total > 0) {
      const pct = Math.round((downloaded / total) * 100);
      on_progress({
        phase: "downloading_uv",
        message: `Downloading uv... ${pct}%`,
        percent: pct,
      });
    }
  }
  await writer.end();

  on_progress({
    phase: "downloading_uv",
    message: "Extracting uv...",
    percent: 100,
  });

  // Extract to ~/.carapace/uv/bin/
  const uv_bin_dir = path.dirname(uv_binary_path());
  await mkdir(uv_bin_dir, { recursive: true });

  const tar = Bun.spawn(["tar", "xzf", tmp_tarball, "--strip-components=1", "-C", uv_bin_dir], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const tar_stderr = await new Response(tar.stderr).text();
  const tar_exit = await tar.exited;

  if (tar_exit !== 0) {
    throw new Error(`Failed to extract uv: ${tar_stderr}`);
  }

  // Set executable bit
  await chmod(uv_binary_path(), 0o755);

  // Cleanup temp
  try {
    const rm = Bun.spawn(["rm", "-rf", tmp_dir], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await rm.exited;
  } catch {
    // ignore cleanup errors
  }

  on_progress({
    phase: "downloading_uv",
    message: "uv downloaded successfully",
    percent: 100,
  });
}
