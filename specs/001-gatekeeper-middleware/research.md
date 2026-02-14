# Research: Gatekeeper Middleware

## R1: Path Traversal Sanitization in Bun/Node

**Decision**: Use `path.resolve()` + prefix check against vault root. Decode URL-encoded paths first, then normalize, then verify the resolved absolute path starts with the expected vault root.

**Rationale**: This is the standard approach recommended by OWASP. `path.normalize()` alone is insufficient — it collapses `..` but doesn't prevent escaping a root. `path.resolve(vault_root, user_path)` produces an absolute path, and checking `.startsWith(vault_root)` catches all traversal variants (encoded, double-encoded, backslash on Windows, etc.).

**Alternatives considered**:
- Regex-based `..` detection: Brittle, misses encoded variants.
- Chroot/sandbox: Overkill for MVP; correct for production Docker deployment (which we get via container filesystem isolation).

## R2: Bun Test Runner

**Decision**: Use `bun test` with Bun's built-in test runner (Jest-compatible `describe`/`it`/`expect` API).

**Rationale**: Zero dependencies. Bun ships a test runner that supports TypeScript natively. Tests can spawn the Gatekeeper as a subprocess or test handler functions directly. Integration tests will start the server, make HTTP requests via `fetch`, and assert on response envelopes.

**Alternatives considered**:
- Vitest: Extra dependency, designed for Vite projects. Bun's runner is sufficient.
- Node test runner: Would require running tests via Node instead of Bun.

## R3: Symlink Detection

**Decision**: Use `fs.lstat()` to check if a path is a symlink, then `fs.realpath()` to resolve it. If the resolved real path falls outside the vault root, reject the request.

**Rationale**: `lstat` returns symlink metadata without following the link. `realpath` resolves all symlinks to the final target. Checking `.startsWith(vault_root)` on the real path catches symlinks that escape the vault.

**Alternatives considered**:
- Disable symlink following entirely: Too restrictive — legitimate symlinks within the vault should work.
- `O_NOFOLLOW` open flag: Not available in Bun's high-level file API.

## R4: Dockerfile Base Image

**Decision**: Use `oven/bun:slim` as the base image.

**Rationale**: Official Bun Docker image. Slim variant minimizes image size. No build step needed — Bun runs TypeScript directly. Copy source, expose port, `CMD ["bun", "run", "src/index.ts"]`.

**Alternatives considered**:
- `oven/bun:alpine`: Even smaller, but Alpine can cause compatibility issues with native modules (not a concern here but slim is safer default).
- Multi-stage build: Unnecessary since there's no compilation step.

## R5: Vault Configuration

**Decision**: Configure vault roots via environment variables `PUBLIC_VAULT` and `PRIVATE_VAULT`, defaulting to `./data/public` and `./data/private` relative to CWD.

**Rationale**: Env vars are the standard Docker/12-factor approach. Relative defaults make local development zero-config. In Docker, volumes mount real data at these paths.

**Alternatives considered**:
- Config file (JSON/TOML): Unnecessary complexity for two paths.
- CLI arguments: Less Docker-friendly than env vars.

## R6: Integration Test Strategy

**Decision**: Tests start a real Gatekeeper server on a random port, use temp directories as vaults populated with known fixtures, make HTTP requests via `fetch`, and assert on Result Envelope responses. Each test file gets its own server instance for isolation.

**Rationale**: Testing at the HTTP boundary catches routing, serialization, and access control bugs. Testing internal functions alone would miss integration issues. Random ports and temp directories prevent test interference.

**Alternatives considered**:
- Unit tests only (mock filesystem): Misses real I/O edge cases.
- Single shared server: Test ordering dependencies, harder to parallelize.
