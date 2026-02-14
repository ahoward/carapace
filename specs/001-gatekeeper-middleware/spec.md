# Feature Specification: Gatekeeper Middleware

**Feature Branch**: `001-gatekeeper-middleware`
**Created**: 2026-02-14
**Status**: Draft
**Input**: User description: "Phase 1A — Gatekeeper Middleware: Upgrade the spike gatekeeper into a real middleware service. Implement /tools/fs/read with mode-based access control, upgrade /tools/fs/list to read real directories, add path traversal sanitization, write integration tests proving CLOUD mode blocks private data while LOCAL allows it, and create a Dockerfile for the gatekeeper service."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mode-Aware File Reading (Priority: P1)

An AI agent (OpenClaw) requests file contents through the Gatekeeper. In LOCAL mode, the agent can read any file in both the Public and Private vaults. In CLOUD mode, the agent can only read files in the Public vault — any attempt to read Private vault files is denied with a clear security rejection.

**Why this priority**: This is the core data sovereignty mechanism. Without it, there is no privacy guarantee — the entire product value proposition depends on the Gatekeeper correctly blocking private data access in CLOUD mode.

**Independent Test**: Can be fully tested by starting the Gatekeeper, placing files in Public and Private directories, toggling modes, and verifying read access is granted or denied accordingly.

**Acceptance Scenarios**:

1. **Given** the Gatekeeper is in LOCAL mode and a file exists at `<private_vault>/secrets.txt`, **When** a client requests `GET /tools/fs/read?path=private/secrets.txt`, **Then** the file contents are returned in a success Result Envelope.
2. **Given** the Gatekeeper is in CLOUD mode and a file exists at `<private_vault>/secrets.txt`, **When** a client requests `GET /tools/fs/read?path=private/secrets.txt`, **Then** the request is denied with an error Result Envelope (403 status) containing a clear "access denied" message.
3. **Given** the Gatekeeper is in CLOUD mode and a file exists at `<public_vault>/readme.txt`, **When** a client requests `GET /tools/fs/read?path=public/readme.txt`, **Then** the file contents are returned in a success Result Envelope.
4. **Given** any mode, **When** a client requests a file that does not exist (e.g., `?path=public/nonexistent.txt`), **Then** a 404 error Result Envelope is returned.
5. **Given** any mode, **When** a client requests a path without a valid vault prefix (e.g., `?path=secrets.txt`), **Then** the request is rejected with a 400 error Result Envelope.

---

### User Story 2 - Mode-Aware Directory Listing (Priority: P1)

An AI agent requests a listing of available files. In LOCAL mode, files from both Public and Private vaults are listed. In CLOUD mode, only Public vault files are listed — Private vault files are completely invisible.

**Why this priority**: Equally critical to file reading — if CLOUD mode lists private filenames, the agent learns about private data even without reading it, which is an information leak.

**Independent Test**: Can be fully tested by populating both vault directories with known files, toggling modes, and verifying the returned file list includes or excludes private files accordingly.

**Acceptance Scenarios**:

1. **Given** the Gatekeeper is in LOCAL mode with files in both vaults, **When** a client requests `GET /tools/fs/list`, **Then** the response lists files from both Public and Private vaults.
2. **Given** the Gatekeeper is in CLOUD mode with files in both vaults, **When** a client requests `GET /tools/fs/list`, **Then** the response lists only Public vault files — no Private vault files appear.
3. **Given** the vaults are empty, **When** a client requests a listing, **Then** an empty file list is returned in a success Result Envelope.

---

### User Story 3 - Path Traversal Protection (Priority: P1)

A malicious or misconfigured agent attempts to access files outside the designated vault directories using path traversal techniques (e.g., `../../etc/passwd`). The Gatekeeper rejects all such attempts regardless of mode.

**Why this priority**: Security-critical. Without path traversal protection, an agent could escape the vault sandbox and access arbitrary files on the host system, completely undermining the security model.

**Independent Test**: Can be fully tested by sending crafted path traversal payloads and verifying every one is rejected.

**Acceptance Scenarios**:

1. **Given** any mode, **When** a client requests a path containing `..` (e.g., `../../etc/passwd`), **Then** the request is rejected with an error Result Envelope (400 status).
2. **Given** any mode, **When** a client requests a path containing encoded traversal sequences (e.g., `%2e%2e%2f`), **Then** the request is rejected.
3. **Given** any mode, **When** a client requests a path that is absolute (e.g., `/etc/passwd`), **Then** the request is rejected.
4. **Given** LOCAL mode, **When** a client requests a valid relative path within the Private vault, **Then** the file is served normally (traversal protection does not block legitimate access).

---

### User Story 4 - Integration Tests (Priority: P2)

A developer runs the test suite and gets a clear pass/fail signal confirming that the Gatekeeper's data sovereignty guarantees hold. Tests cover both happy paths and adversarial cases.

**Why this priority**: Tests lock the security contract. Without them, future changes could silently break the privacy guarantee. The AGENTS.md workflow requires tests before implementation.

**Independent Test**: Can be fully tested by running the test command and observing pass/fail results with no manual verification needed.

**Acceptance Scenarios**:

1. **Given** the test suite exists, **When** a developer runs the test command, **Then** all tests execute and report pass/fail within 10 seconds.
2. **Given** the Gatekeeper implementation is correct, **When** the full test suite runs, **Then** all tests pass.
3. **Given** a developer introduces a regression (e.g., removes the CLOUD mode block), **When** the test suite runs, **Then** at least one test fails with a clear description of what broke.

---

### User Story 5 - Containerized Gatekeeper (Priority: P3)

The Gatekeeper can be built as a container image and run in a Docker environment, matching the VPS deployment architecture where it runs alongside OpenClaw and Ollama.

**Why this priority**: Required for VPS deployment but not for local development or testing. The Gatekeeper must eventually run in Docker on the VPS, but developers can test everything locally with `bun run` first.

**Independent Test**: Can be fully tested by building the container image, running it, and verifying the health endpoint responds.

**Acceptance Scenarios**:

1. **Given** the Dockerfile exists, **When** a developer builds the image, **Then** the build succeeds without errors.
2. **Given** the container is running, **When** a client hits the health endpoint, **Then** a success Result Envelope is returned with mode and uptime.
3. **Given** the container is running with vault directories mounted, **When** mode-based file operations are performed, **Then** the same access control rules apply as when running outside Docker.

---

### Edge Cases

- What happens when a file path contains null bytes or other control characters? (Reject with 400)
- What happens when the requested file is a symlink pointing outside the vault? (Reject — do not follow symlinks outside vault boundaries)
- What happens when a file is unreadable due to permissions? (Return 500 error envelope)
- What happens when the vault directories don't exist at startup? (Create them, or fail with a clear error)
- What happens when a directory listing encounters an extremely large number of files? (Return what's available; no pagination needed for MVP)
- What happens when the Gatekeeper receives a request with no path parameter? (Return 400 error envelope)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Gatekeeper MUST expose a `GET /tools/fs/read` endpoint that reads file contents from vault directories, returning them in a Result Envelope. The `path` parameter uses a vault prefix (`public/` or `private/`) to identify the target vault.
- **FR-002**: Gatekeeper MUST deny Private vault file reads in CLOUD mode with a 403 error Result Envelope.
- **FR-003**: Gatekeeper MUST allow Private vault file reads in LOCAL mode.
- **FR-004**: Gatekeeper MUST expose a `GET /tools/fs/list` endpoint that lists real files from vault directories (not dummy data). Returned paths MUST use the same vault-prefixed format as `/tools/fs/read` (e.g., `public/readme.txt`, `private/secrets.txt`).
- **FR-005**: Gatekeeper MUST exclude all Private vault entries from listings in CLOUD mode.
- **FR-006**: Gatekeeper MUST reject any file path containing traversal sequences (`..`), encoded traversal, or absolute paths.
- **FR-007**: Gatekeeper MUST not follow symlinks that resolve outside vault boundaries.
- **FR-008**: Gatekeeper MUST default to LOCAL mode on startup (fail-secure: most restrictive for cloud agents, most permissive for local user).
- **FR-009**: All endpoints MUST return responses in the Result Envelope format defined in AGENTS.md.
- **FR-010**: Gatekeeper MUST expose a `GET /health` endpoint returning current mode and uptime.
- **FR-011**: Gatekeeper MUST expose a `POST /control/set-mode` endpoint to switch between LOCAL and CLOUD modes.
- **FR-012**: An integration test suite MUST exist that verifies all access control rules hold.
- **FR-013**: A Dockerfile MUST exist that builds a runnable Gatekeeper container image.

### Key Entities

- **Vault**: A designated directory on the filesystem. Two types: Public (always accessible) and Private (accessible only in LOCAL mode). Configured via environment variables.
- **Mode**: The current access control state — either LOCAL (full access) or CLOUD (public-only access). Stored in memory, defaults to LOCAL.
- **FileEntry**: A file or directory within a vault, represented by its relative path, kind (file/directory), and vault membership (public/private).
- **Result Envelope**: The standard response wrapper containing status, result, errors, and meta fields.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All integration tests pass, covering LOCAL-read, CLOUD-read-blocked, LOCAL-list-all, CLOUD-list-public-only, and path traversal rejection.
- **SC-002**: The Gatekeeper responds to file read and list requests within 100ms for vault directories containing up to 1,000 files.
- **SC-003**: Zero path traversal bypasses exist — every crafted traversal payload in the test suite is rejected.
- **SC-004**: The Dockerfile builds successfully and the containerized Gatekeeper passes the same health check as the local version.
- **SC-005**: A developer can run the full test suite with a single command and get pass/fail results within 10 seconds.

## Clarifications

### Session 2026-02-14

- Q: How does the client specify which vault a file is in for `/tools/fs/read`? → A: Vault prefix in path — `public/readme.txt`, `private/secrets.txt`. The Gatekeeper strips the prefix to determine the vault root. Access control rejects any `private/` prefix in CLOUD mode.
- Q: Should `/tools/fs/list` include the vault prefix in returned file paths? → A: Yes. Paths in list responses use the same vault-prefixed format as `/tools/fs/read` (e.g., `public/readme.txt`), so the client can pass any listed path directly to a read request.

## Assumptions

- Vault directories are configured via environment variables (e.g., `PUBLIC_VAULT`, `PRIVATE_VAULT`), defaulting to sensible local paths for development.
- File content is returned as UTF-8 text. Binary file handling is out of scope for MVP.
- No authentication is required on the Gatekeeper itself — it runs on a private network (Tailscale) and is not publicly accessible.
- No pagination for directory listings — MVP assumes vault sizes under 10,000 files.
- The Gatekeeper runs as a single instance (no clustering or replication needed for MVP).

## Scope Boundaries

**In scope**: File read, file list, mode switching, path traversal protection, integration tests, Dockerfile.

**Out of scope**: File write/delete operations, user authentication, rate limiting, audit logging, file watching/sync, WebSocket notifications, binary file handling.
