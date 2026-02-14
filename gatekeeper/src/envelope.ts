import type { ResultEnvelope } from "./types";

export function make_envelope<T>(path: string, start: number, result: T): ResultEnvelope<T> {
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

export function make_error(
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
