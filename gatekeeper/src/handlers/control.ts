import { make_envelope, make_error } from "../envelope";
import type { Mode, SetModeResult } from "../types";

export async function handle_set_mode(
  request: Request,
  pathname: string,
  get_mode: () => Mode,
  set_mode: (mode: Mode) => void,
): Promise<Response> {
  const start = Date.now();

  if (request.method !== "POST") {
    return Response.json(make_error(pathname, start, { method: ["POST required"] }), {
      status: 405,
    });
  }

  let body: { mode?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json(make_error(pathname, start, { body: ["invalid JSON"] }), {
      status: 400,
    });
  }

  const new_mode = body.mode;
  if (new_mode !== "LOCAL" && new_mode !== "CLOUD") {
    return Response.json(make_error(pathname, start, { mode: ["must be LOCAL or CLOUD"] }), {
      status: 400,
    });
  }

  const previous_mode = get_mode();
  set_mode(new_mode);

  const result: SetModeResult = { previous_mode, current_mode: new_mode };
  return Response.json(make_envelope(pathname, start, result));
}
