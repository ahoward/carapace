import { make_envelope, make_error } from "../envelope";
import type { Mode, ReadResult } from "../types";
import { check_symlink_escape, resolve_vault_path } from "../vaults";

export async function handle_fs_read(url: URL, current_mode: Mode): Promise<Response> {
  const start = Date.now();
  const pathname = url.pathname;

  const raw_path = url.searchParams.get("path");
  if (!raw_path) {
    return Response.json(
      make_error(pathname, start, { path: ["path query parameter is required"] }),
      { status: 400 },
    );
  }

  const resolved = resolve_vault_path(raw_path);

  if ("err" in resolved) {
    return Response.json(
      make_error(pathname, start, { [resolved.err.field]: [resolved.err.message] }),
      { status: 400 },
    );
  }

  const { ok } = resolved;

  // mode-based access control
  if (current_mode === "CLOUD" && ok.vault_prefix === "private") {
    return Response.json(
      make_error(pathname, start, { access: ["private vault access denied in CLOUD mode"] }),
      { status: 403 },
    );
  }

  // symlink escape check
  const symlink_error = await check_symlink_escape(ok);
  if (symlink_error) {
    return Response.json(
      make_error(pathname, start, { [symlink_error.field]: [symlink_error.message] }),
      { status: 400 },
    );
  }

  // read the file
  const file = Bun.file(ok.absolute_path);
  const exists = await file.exists();
  if (!exists) {
    return Response.json(make_error(pathname, start, { path: ["file not found"] }), {
      status: 404,
    });
  }

  const content = await file.text();
  const result: ReadResult = {
    path: ok.relative_path,
    content,
    size: file.size,
  };

  return Response.json(make_envelope(pathname, start, result));
}
