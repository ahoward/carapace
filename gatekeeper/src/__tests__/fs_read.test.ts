import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { type TestServer, start_test_server } from "./helpers";

let server: TestServer;

beforeAll(async () => {
  server = await start_test_server();
});

afterAll(() => {
  server.cleanup();
});

describe("GET /tools/fs/read", () => {
  it("LOCAL mode reads a public file", async () => {
    const res = await fetch(`${server.base_url}/tools/fs/read?path=public/readme.txt`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.result.path).toBe("public/readme.txt");
    expect(body.result.content).toBe("hello public");
    expect(body.result.size).toBe(12);
  });

  it("LOCAL mode reads a private file", async () => {
    const res = await fetch(`${server.base_url}/tools/fs/read?path=private/secrets.txt`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.result.path).toBe("private/secrets.txt");
    expect(body.result.content).toBe("top secret");
    expect(body.result.size).toBe(10);
  });

  it("CLOUD mode reads a public file", async () => {
    // switch to CLOUD
    await fetch(`${server.base_url}/control/set-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "CLOUD" }),
    });

    const res = await fetch(`${server.base_url}/tools/fs/read?path=public/readme.txt`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.result.content).toBe("hello public");

    // switch back to LOCAL
    await fetch(`${server.base_url}/control/set-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "LOCAL" }),
    });
  });

  it("CLOUD mode rejects private file read with 403", async () => {
    // switch to CLOUD
    await fetch(`${server.base_url}/control/set-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "CLOUD" }),
    });

    const res = await fetch(`${server.base_url}/tools/fs/read?path=private/secrets.txt`);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.errors.access).toContain("private vault access denied in CLOUD mode");

    // switch back to LOCAL
    await fetch(`${server.base_url}/control/set-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "LOCAL" }),
    });
  });

  it("missing file returns 404", async () => {
    const res = await fetch(`${server.base_url}/tools/fs/read?path=public/nonexistent.txt`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.errors.path).toContain("file not found");
  });

  it("missing path param returns 400", async () => {
    const res = await fetch(`${server.base_url}/tools/fs/read`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.errors.path).toBeDefined();
  });

  it("invalid vault prefix returns 400", async () => {
    const res = await fetch(`${server.base_url}/tools/fs/read?path=unknown/file.txt`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.errors.path).toContain("must start with public/ or private/");
  });
});
