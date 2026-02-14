import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { make_envelope } from "../envelope";
import type { FileEntry, ListResult, Mode } from "../types";
import { PRIVATE_VAULT, PUBLIC_VAULT, type VaultPrefix } from "../vaults";

function walk_vault(vault_root: string, prefix: VaultPrefix): FileEntry[] {
  const entries: FileEntry[] = [];

  function walk(dir: string) {
    let items: string[];
    try {
      items = readdirSync(dir);
    } catch {
      return;
    }

    for (const item of items) {
      const full_path = path.join(dir, item);
      try {
        const stat = statSync(full_path);
        const relative = path.relative(vault_root, full_path);
        const vault_path = `${prefix}/${relative}`;

        if (stat.isDirectory()) {
          entries.push({ name: `${vault_path}/`, kind: "directory", size: 0 });
          walk(full_path);
        } else if (stat.isFile()) {
          entries.push({ name: vault_path, kind: "file", size: stat.size });
        }
      } catch {
        // skip inaccessible entries
      }
    }
  }

  walk(vault_root);
  return entries;
}

export function handle_fs_list(pathname: string, current_mode: Mode): Response {
  const start = Date.now();

  const files: FileEntry[] = [];

  // always include public vault
  files.push(...walk_vault(PUBLIC_VAULT, "public"));

  // include private vault only in LOCAL mode
  if (current_mode === "LOCAL") {
    files.push(...walk_vault(PRIVATE_VAULT, "private"));
  }

  const result: ListResult = { mode: current_mode, files };
  return Response.json(make_envelope(pathname, start, result));
}
