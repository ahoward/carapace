import { mkdirSync } from "node:fs";
import { make_error } from "./envelope";
import { handle_set_mode } from "./handlers/control";
import { handle_fs_list } from "./handlers/fs_list";
import { handle_fs_read } from "./handlers/fs_read";
import { handle_health } from "./handlers/health";
import type { Mode } from "./types";
import { PRIVATE_VAULT, PUBLIC_VAULT } from "./vaults";

const PORT = Number(process.env.GATEKEEPER_PORT) || 3001;

// ensure vault directories exist
mkdirSync(PUBLIC_VAULT, { recursive: true });
mkdirSync(PRIVATE_VAULT, { recursive: true });

// in-memory state
let current_mode: Mode = "LOCAL";
const start_time = Date.now();

const server = Bun.serve({
  port: PORT,
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return handle_health(url.pathname, current_mode, start_time);
    }

    if (url.pathname === "/control/set-mode") {
      return handle_set_mode(
        request,
        url.pathname,
        () => current_mode,
        (mode) => {
          current_mode = mode;
        },
      );
    }

    if (url.pathname === "/tools/fs/read" && request.method === "GET") {
      return handle_fs_read(url, current_mode);
    }

    if (url.pathname === "/tools/fs/list" && request.method === "GET") {
      return handle_fs_list(url.pathname, current_mode);
    }

    const start = Date.now();
    return Response.json(make_error(url.pathname, start, { route: ["not found"] }), {
      status: 404,
    });
  },
});

console.log(`gatekeeper listening on http://localhost:${server.port}`);
