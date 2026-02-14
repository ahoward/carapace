import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type TestServer, start_test_server } from "./helpers";

let server: TestServer;

beforeAll(async () => {
  server = await start_test_server();

  // create a symlink that escapes the vault
  writeFileSync("/tmp/gatekeeper-escape-target.txt", "escaped!");
  try {
    symlinkSync(
      "/tmp/gatekeeper-escape-target.txt",
      path.join(server.public_vault, "escape_link.txt"),
    );
  } catch {
    // symlink might fail in some environments
  }
});

afterAll(() => {
  server.cleanup();
});

describe("Path traversal protection", () => {
  it("rejects ../../etc/passwd traversal", async () => {
    const res = await fetch(`${server.base_url}/tools/fs/read?path=public/../../etc/passwd`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.errors.path).toContain("path traversal detected");
  });

  it("rejects %2e%2e%2f encoded traversal", async () => {
    const res = await fetch(
      `${server.base_url}/tools/fs/read?path=public/%2e%2e%2f%2e%2e%2fetc/passwd`,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.errors.path).toContain("path traversal detected");
  });

  it("rejects absolute path /etc/passwd", async () => {
    const res = await fetch(`${server.base_url}/tools/fs/read?path=/etc/passwd`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe("error");
  });

  it("rejects null byte in path", async () => {
    const res = await fetch(`${server.base_url}/tools/fs/read?path=public/readme.txt%00.jpg`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.errors.path).toContain("path traversal detected");
  });

  it("rejects symlink escaping vault", async () => {
    const res = await fetch(`${server.base_url}/tools/fs/read?path=public/escape_link.txt`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.errors.path).toContain("path traversal detected");
  });

  it("allows valid relative path within vault", async () => {
    const res = await fetch(`${server.base_url}/tools/fs/read?path=public/readme.txt`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.result.content).toBe("hello public");
  });

  it("rejects double-encoded traversal", async () => {
    const res = await fetch(
      `${server.base_url}/tools/fs/read?path=public/%252e%252e%252f%252e%252e%252fetc/passwd`,
    );
    // after first decode by URL parser: %2e%2e%2f...
    // after second decode in our code: ../../etc/passwd
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe("error");
  });

  it("rejects backslash traversal variant", async () => {
    const res = await fetch(`${server.base_url}/tools/fs/read?path=public/..\\..\\etc\\passwd`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe("error");
  });
});
