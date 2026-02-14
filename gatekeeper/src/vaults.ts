import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

export const PUBLIC_VAULT = path.resolve(process.env.PUBLIC_VAULT || "./data/public");
export const PRIVATE_VAULT = path.resolve(process.env.PRIVATE_VAULT || "./data/private");

export type VaultPrefix = "public" | "private";

export interface ResolvedPath {
  vault_prefix: VaultPrefix;
  vault_root: string;
  absolute_path: string;
  relative_path: string;
}

export interface VaultError {
  field: string;
  message: string;
}

/**
 * Parse a vault-prefixed path like "public/readme.txt" or "private/secrets.txt"
 * into a resolved absolute path within the correct vault directory.
 *
 * Returns either a ResolvedPath or a VaultError.
 */
export function resolve_vault_path(user_path: string): { ok: ResolvedPath } | { err: VaultError } {
  // reject null bytes
  if (user_path.includes("\0")) {
    return { err: { field: "path", message: "path traversal detected" } };
  }

  // decode URL encoding before any path operations
  let decoded: string;
  try {
    decoded = decodeURIComponent(user_path);
  } catch {
    return { err: { field: "path", message: "path traversal detected" } };
  }

  // reject null bytes after decoding
  if (decoded.includes("\0")) {
    return { err: { field: "path", message: "path traversal detected" } };
  }

  // reject backslashes (Windows path separator used as traversal vector)
  if (decoded.includes("\\")) {
    return { err: { field: "path", message: "path traversal detected" } };
  }

  // determine vault prefix
  let vault_prefix: VaultPrefix;
  let vault_root: string;
  let relative: string;

  if (decoded.startsWith("public/")) {
    vault_prefix = "public";
    vault_root = PUBLIC_VAULT;
    relative = decoded.slice("public/".length);
  } else if (decoded.startsWith("private/")) {
    vault_prefix = "private";
    vault_root = PRIVATE_VAULT;
    relative = decoded.slice("private/".length);
  } else {
    return { err: { field: "path", message: "must start with public/ or private/" } };
  }

  // reject empty relative path
  if (relative === "" || relative === "/") {
    return { err: { field: "path", message: "must start with public/ or private/" } };
  }

  // resolve absolute path within vault root
  const absolute_path = path.resolve(vault_root, relative);

  // verify resolved path is within vault root (catches ../ traversal)
  if (!absolute_path.startsWith(vault_root + path.sep) && absolute_path !== vault_root) {
    return { err: { field: "path", message: "path traversal detected" } };
  }

  return {
    ok: {
      vault_prefix,
      vault_root,
      absolute_path,
      relative_path: `${vault_prefix}/${relative}`,
    },
  };
}

/**
 * Check if a resolved path escapes the vault via symlinks.
 * Returns null if safe, or a VaultError if the symlink target is outside the vault.
 */
export async function check_symlink_escape(resolved: ResolvedPath): Promise<VaultError | null> {
  try {
    const stat = await lstat(resolved.absolute_path);
    if (stat.isSymbolicLink()) {
      const real = await realpath(resolved.absolute_path);
      if (!real.startsWith(resolved.vault_root + path.sep) && real !== resolved.vault_root) {
        return { field: "path", message: "path traversal detected" };
      }
    }
  } catch {
    // file doesn't exist — let the caller handle 404
    return null;
  }
  return null;
}
