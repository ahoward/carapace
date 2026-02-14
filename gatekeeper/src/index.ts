import { mkdirSync } from "node:fs";
import { make_envelope, make_error } from "./envelope";
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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function with_cors(response: Response): Response {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

const server = Bun.serve({
  port: PORT,
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return with_cors(handle_health(url.pathname, current_mode, start_time));
    }

    if (url.pathname === "/control/set-mode") {
      return with_cors(
        await handle_set_mode(
          request,
          url.pathname,
          () => current_mode,
          (mode) => {
            current_mode = mode;
          },
        ),
      );
    }

    if (url.pathname === "/tools/fs/read" && request.method === "GET") {
      return with_cors(await handle_fs_read(url, current_mode));
    }

    if (url.pathname === "/tools/fs/list" && request.method === "GET") {
      return with_cors(handle_fs_list(url.pathname, current_mode));
    }

    if (url.pathname === "/control/shutdown" && request.method === "POST") {
      const start = Date.now();
      const response = with_cors(
        Response.json(make_envelope(url.pathname, start, { message: "shutting down" })),
      );
      // schedule shutdown after response is sent
      setTimeout(() => graceful_shutdown("HTTP /control/shutdown"), 50);
      return response;
    }

    const start = Date.now();
    return with_cors(
      Response.json(make_error(url.pathname, start, { route: ["not found"] }), {
        status: 404,
      }),
    );
  },
});

function graceful_shutdown(reason: string) {
  console.log(`gatekeeper shutting down (${reason})`);
  server.stop(true);
  process.exit(0);
}

process.on("SIGTERM", () => graceful_shutdown("SIGTERM"));
process.on("SIGINT", () => graceful_shutdown("SIGINT"));

console.log(`gatekeeper listening on http://localhost:${server.port} (pid ${process.pid})`);
