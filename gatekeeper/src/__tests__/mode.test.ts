import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { type TestServer, start_test_server } from "./helpers";

let server: TestServer;

beforeAll(async () => {
  server = await start_test_server();
});

afterAll(() => {
  server.cleanup();
});

describe("Mode switching integration", () => {
  it("default mode is LOCAL", async () => {
    const res = await fetch(`${server.base_url}/health`);
    const body = await res.json();
    expect(body.result.mode).toBe("LOCAL");
  });

  it("switch to CLOUD blocks private reads", async () => {
    // switch to CLOUD
    const switch_res = await fetch(`${server.base_url}/control/set-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "CLOUD" }),
    });
    const switch_body = await switch_res.json();
    expect(switch_body.result.previous_mode).toBe("LOCAL");
    expect(switch_body.result.current_mode).toBe("CLOUD");

    // verify private read blocked
    const read_res = await fetch(`${server.base_url}/tools/fs/read?path=private/secrets.txt`);
    expect(read_res.status).toBe(403);

    // verify private files excluded from list
    const list_res = await fetch(`${server.base_url}/tools/fs/list`);
    const list_body = await list_res.json();
    expect(list_body.result.mode).toBe("CLOUD");
    const names = list_body.result.files.map((f: { name: string }) => f.name);
    expect(names.some((n: string) => n.startsWith("private/"))).toBe(false);
  });

  it("switch back to LOCAL restores private reads", async () => {
    // ensure we're in CLOUD first
    await fetch(`${server.base_url}/control/set-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "CLOUD" }),
    });

    // switch back to LOCAL
    const switch_res = await fetch(`${server.base_url}/control/set-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "LOCAL" }),
    });
    const switch_body = await switch_res.json();
    expect(switch_body.result.previous_mode).toBe("CLOUD");
    expect(switch_body.result.current_mode).toBe("LOCAL");

    // verify private read works
    const read_res = await fetch(`${server.base_url}/tools/fs/read?path=private/secrets.txt`);
    expect(read_res.status).toBe(200);
    const read_body = await read_res.json();
    expect(read_body.result.content).toBe("top secret");

    // verify private files included in list
    const list_res = await fetch(`${server.base_url}/tools/fs/list`);
    const list_body = await list_res.json();
    expect(list_body.result.mode).toBe("LOCAL");
    const names = list_body.result.files.map((f: { name: string }) => f.name);
    expect(names.some((n: string) => n.startsWith("private/"))).toBe(true);
  });

  it("invalid mode rejected with 400", async () => {
    const res = await fetch(`${server.base_url}/control/set-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "INVALID" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.errors.mode).toContain("must be LOCAL or CLOUD");
  });

  it("health endpoint reflects current mode", async () => {
    // switch to CLOUD
    await fetch(`${server.base_url}/control/set-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "CLOUD" }),
    });

    const res = await fetch(`${server.base_url}/health`);
    const body = await res.json();
    expect(body.result.mode).toBe("CLOUD");

    // switch back to LOCAL for cleanup
    await fetch(`${server.base_url}/control/set-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "LOCAL" }),
    });

    const res2 = await fetch(`${server.base_url}/health`);
    const body2 = await res2.json();
    expect(body2.result.mode).toBe("LOCAL");
  });
});
