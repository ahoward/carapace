# Implementation Plan: Gatekeeper Middleware

**Branch**: `001-gatekeeper-middleware` | **Date**: 2026-02-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-gatekeeper-middleware/spec.md`

## Summary

Upgrade the Phase 0 spike Gatekeeper from dummy data to a real filesystem-backed middleware with mode-based access control (LOCAL/CLOUD), path traversal sanitization, integration tests via `bun test`, and a Dockerfile for VPS deployment. The existing `gatekeeper/src/index.ts` is refactored into focused modules while preserving the Result Envelope pattern and snake_case conventions from AGENTS.md.

## Technical Context

**Language/Version**: Bun 1.3+ / TypeScript (ES2021 target)
**Primary Dependencies**: Bun built-ins (Bun.serve, Bun.file, node:fs, node:path). No external packages.
**Storage**: Local filesystem — two vault directories configured via env vars
**Testing**: `bun test` (Bun's built-in test runner, Jest-compatible API)
**Target Platform**: Linux (VPS Docker), macOS (dev), cross-platform via Bun
**Project Type**: Single service (HTTP server)
**Performance Goals**: <100ms per request for vaults up to 1,000 files
**Constraints**: UTF-8 text files only, no pagination, single instance
**Scale/Scope**: MVP — two vault dirs, ~10k files max

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Privacy by Default | **PASS** | CLOUD mode blocks all private vault access (FR-002, FR-005). Fail-secure: defaults to LOCAL on boot (FR-008). |
| II. Data Sovereignty | **PASS** | Vaults are local directories synced from user's machine. Gatekeeper never writes data — read-only access. |
| III. Zero Configuration | **PASS** | Env vars with sensible defaults. No user-facing configuration for the Gatekeeper itself. |
| IV. Thin Desktop Shell | **PASS** | All access control logic lives in Bun/TypeScript Gatekeeper, not in Tauri. Desktop only spawns/stops the process. |
| V. Vertical Slice | **PASS** | This is Phase 1A of the vertical slice — the security layer. Testable with `bin/dev --browser` and `bun test`. |
| VI. Upstream Integrity | **PASS** | No OpenClaw code. Gatekeeper is a standalone service. |
| VII. Fail Secure | **PASS** | Defaults to LOCAL (FR-008). Unknown paths rejected. Traversal attempts rejected. Missing vault prefix rejected. |
| .envrc protection | **PASS** | No file writes in this feature. .envrc not referenced. |

All gates pass. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/001-gatekeeper-middleware/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api.md           # HTTP API contract
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
gatekeeper/
├── package.json
├── tsconfig.json
├── Dockerfile
└── src/
    ├── index.ts          # Server entry point (Bun.serve)
    ├── types.ts           # Shared types (ResultEnvelope, Mode, FileEntry, etc.)
    ├── envelope.ts        # make_envelope / make_error helpers
    ├── vaults.ts          # Vault path resolution, traversal sanitization, symlink checks
    ├── handlers/
    │   ├── health.ts      # GET /health
    │   ├── control.ts     # POST /control/set-mode
    │   ├── fs_read.ts     # GET /tools/fs/read
    │   └── fs_list.ts     # GET /tools/fs/list
    └── __tests__/
        ├── fs_read.test.ts
        ├── fs_list.test.ts
        ├── traversal.test.ts
        └── mode.test.ts
```

**Structure Decision**: Modular files within the existing `gatekeeper/` directory. Handlers are split by route for clarity. Shared logic (envelope, vault resolution, types) in root `src/`. Tests colocated in `__tests__/` using `bun test`.
