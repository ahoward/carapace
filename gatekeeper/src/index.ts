const PORT = Number(process.env.GATEKEEPER_PORT) || 3001;

type Mode = "LOCAL" | "CLOUD";

interface ResultEnvelope<T> {
  status: "success" | "error";
  result: T | null;
  errors: Record<string, string[]> | null;
  meta: {
    path: string;
    timestamp: string;
    duration_ms: number;
  };
}

interface HealthResult {
  mode: Mode;
  uptime_ms: number;
}

interface SetModeResult {
  previous_mode: Mode;
  current_mode: Mode;
}

interface FileEntry {
  name: string;
  kind: "file" | "directory";
  private: boolean;
}

let current_mode: Mode = "LOCAL";
const start_time = Date.now();

function make_envelope<T>(path: string, start: number, result: T): ResultEnvelope<T> {
  return {
    status: "success",
    result,
    errors: null,
    meta: {
      path,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - start,
    },
  };
}

function make_error(
  path: string,
  start: number,
  errors: Record<string, string[]>,
): ResultEnvelope<null> {
  return {
    status: "error",
    result: null,
    errors,
    meta: {
      path,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - start,
    },
  };
}

const DUMMY_FILES: FileEntry[] = [
  { name: "README.md", kind: "file", private: false },
  { name: "public/logo.svg", kind: "file", private: false },
  { name: "public/docs/", kind: "directory", private: false },
  { name: "private/credentials.json", kind: "file", private: true },
  { name: "private/ssh_keys/", kind: "directory", private: true },
  { name: "private/diary.md", kind: "file", private: true },
];

function handle_health(url: URL): Response {
  const start = Date.now();
  const result: HealthResult = {
    mode: current_mode,
    uptime_ms: Date.now() - start_time,
  };
  return Response.json(make_envelope(url.pathname, start, result));
}

async function handle_set_mode(request: Request, url: URL): Promise<Response> {
  const start = Date.now();

  if (request.method !== "POST") {
    return Response.json(make_error(url.pathname, start, { method: ["POST required"] }), {
      status: 405,
    });
  }

  let body: { mode?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json(make_error(url.pathname, start, { body: ["invalid JSON"] }), {
      status: 400,
    });
  }

  const new_mode = body.mode;
  if (new_mode !== "LOCAL" && new_mode !== "CLOUD") {
    return Response.json(make_error(url.pathname, start, { mode: ["must be LOCAL or CLOUD"] }), {
      status: 400,
    });
  }

  const previous_mode = current_mode;
  current_mode = new_mode;

  const result: SetModeResult = { previous_mode, current_mode };
  return Response.json(make_envelope(url.pathname, start, result));
}

function handle_fs_list(url: URL): Response {
  const start = Date.now();

  const files = current_mode === "CLOUD" ? DUMMY_FILES.filter((f) => !f.private) : DUMMY_FILES;

  return Response.json(make_envelope(url.pathname, start, { mode: current_mode, files }));
}

const server = Bun.serve({
  port: PORT,
  fetch(request: Request): Response | Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return handle_health(url);
    }
    if (url.pathname === "/control/set-mode") {
      return handle_set_mode(request, url);
    }
    if (url.pathname === "/tools/fs/list" && request.method === "GET") {
      return handle_fs_list(url);
    }

    const start = Date.now();
    return Response.json(make_error(url.pathname, start, { route: ["not found"] }), {
      status: 404,
    });
  },
});

console.log(`gatekeeper listening on http://localhost:${server.port}`);
