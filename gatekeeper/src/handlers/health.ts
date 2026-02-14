import { make_envelope } from "../envelope";
import type { HealthResult, Mode } from "../types";

export function handle_health(pathname: string, current_mode: Mode, start_time: number): Response {
  const start = Date.now();
  const result: HealthResult = {
    mode: current_mode,
    uptime_ms: Date.now() - start_time,
  };
  return Response.json(make_envelope(pathname, start, result));
}
