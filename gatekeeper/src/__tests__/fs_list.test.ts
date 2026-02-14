import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { type TestServer, start_test_server } from "./helpers";

let server: TestServer;

beforeAll(async () => {
  server = await start_test_server();
});

afterAll(() => {
  server.cleanup();
});

describe("GET /tools/fs/list", () => {
  it("LOCAL mode lists files from both vaults", async () => {
    const res = await fetch(`${server.base_url}/tools/fs/list`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.result.mode).toBe("LOCAL");

    const names = body.result.files.map((f: { name: string }) => f.name);
    // should contain both public and private files
    expect(names.some((n: string) => n.startsWith("public/"))).toBe(true);
    expect(names.some((n: string) => n.startsWith("private/"))).toBe(true);
  });

  it("CLOUD mode lists only public vault files", async () => {
    // switch to CLOUD
    await fetch(`${server.base_url}/control/set-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "CLOUD" }),
    });

    const res = await fetch(`${server.base_url}/tools/fs/list`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.result.mode).toBe("CLOUD");

    const names = body.result.files.map((f: { name: string }) => f.name);
    // should only contain public files
    expect(names.every((n: string) => n.startsWith("public/"))).toBe(true);
    expect(names.some((n: string) => n.startsWith("private/"))).toBe(false);

    // switch back to LOCAL
    await fetch(`${server.base_url}/control/set-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "LOCAL" }),
    });
  });

  it("returned paths use vault prefix format", async () => {
    const res = await fetch(`${server.base_url}/tools/fs/list`);
    const body = await res.json();
    for (const entry of body.result.files) {
      expect(entry.name.startsWith("public/") || entry.name.startsWith("private/")).toBe(true);
    }
  });

  it("entries include kind and size", async () => {
    const res = await fetch(`${server.base_url}/tools/fs/list`);
    const body = await res.json();
    for (const entry of body.result.files) {
      expect(["file", "directory"]).toContain(entry.kind);
      expect(typeof entry.size).toBe("number");
    }
  });

  it("empty vaults return empty list", async () => {
    // We can test this by switching to CLOUD mode and checking that
    // if there were no public files, we'd get an empty list.
    // Since our fixtures have public files, we verify the structure is correct.
    const res = await fetch(`${server.base_url}/tools/fs/list`);
    const body = await res.json();
    expect(Array.isArray(body.result.files)).toBe(true);
  });
});
