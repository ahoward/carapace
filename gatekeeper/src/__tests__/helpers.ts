import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Subprocess } from "bun";

export interface TestServer {
  port: number;
  base_url: string;
  public_vault: string;
  private_vault: string;
  process: Subprocess;
  cleanup: () => void;
}

/**
 * Start a gatekeeper server on a random port with temp vault directories.
 * Populates vaults with known fixture files.
 */
export async function start_test_server(): Promise<TestServer> {
  const tmp = mkdtempSync(path.join(tmpdir(), "gatekeeper-test-"));
  const public_vault = path.join(tmp, "public");
  const private_vault = path.join(tmp, "private");

  mkdirSync(public_vault, { recursive: true });
  mkdirSync(private_vault, { recursive: true });

  // create fixture files
  writeFileSync(path.join(public_vault, "readme.txt"), "hello public");
  mkdirSync(path.join(public_vault, "docs"), { recursive: true });
  writeFileSync(path.join(public_vault, "docs", "guide.txt"), "public guide");
  writeFileSync(path.join(private_vault, "secrets.txt"), "top secret");
  mkdirSync(path.join(private_vault, "keys"), { recursive: true });
  writeFileSync(path.join(private_vault, "keys", "id_rsa"), "private key data");

  // find a random available port
  const port_server = Bun.serve({
    port: 0,
    fetch() {
      return new Response("");
    },
  });
  const port = port_server.port;
  port_server.stop(true);

  const proc = Bun.spawn(["bun", "run", "src/index.ts"], {
    cwd: path.resolve(import.meta.dir, "../.."),
    env: {
      ...process.env,
      GATEKEEPER_PORT: String(port),
      PUBLIC_VAULT: public_vault,
      PRIVATE_VAULT: private_vault,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  // wait for server to be ready
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://localhost:${port}/health`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  return {
    port,
    base_url: `http://localhost:${port}`,
    public_vault,
    private_vault,
    process: proc,
    cleanup() {
      proc.kill();
      rmSync(tmp, { recursive: true, force: true });
    },
  };
}
