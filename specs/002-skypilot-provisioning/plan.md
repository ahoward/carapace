# Implementation Plan: SkyPilot Provisioning

**Branch**: `002-skypilot-provisioning` | **Date**: 2026-02-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-skypilot-provisioning/spec.md`

## Summary

Add cloud VPS provisioning to Carapace via SkyPilot CLI. The Gatekeeper (Bun/TypeScript) spawns SkyPilot commands as child processes, generates dynamic YAML from user config, manages cluster lifecycle (launch/stop/destroy), configures vault file_mounts, streams provisioning progress via SSE, and polls cluster status. All SkyPilot interaction is CLI-only, consumed through `Bun.spawn()`.

## Technical Context

**Language/Version**: TypeScript 5.6+ (Bun runtime)
**Primary Dependencies**: SkyPilot CLI (external, user-installed), Bun.spawn (subprocess), Bun.serve (HTTP/SSE)
**Storage**: In-memory cluster state (no database for MVP)
**Testing**: `bun test` (Bun native test runner)
**Target Platform**: macOS desktop (development on Linux remote)
**Project Type**: Desktop app (Tauri + React frontend, Bun/TS backend)
**Performance Goals**: Status polling every 15-30s, SSE event delivery <100ms
**Constraints**: Single cluster at a time, SkyPilot installed separately by user
**Scale/Scope**: Single user, single cluster, 4 user stories, ~12 source files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Privacy by Default | PASS | Private vault synced via file_mounts at launch only. No continuous cloud exposure. Gatekeeper on VPS enforces mode-based access. |
| II. Data Sovereignty | PASS | Local machine is source of truth. VPS gets copies via rsync. Destroy removes all cloud data. |
| III. Zero Configuration | PASS | User clicks "Launch Server" — YAML generated automatically. No SkyPilot YAML editing required. |
| IV. Thin Desktop Shell | PASS | All provisioning logic in Gatekeeper (Bun/TS). Tauri backend remains thin IPC bridge. React handles UI state. |
| V. Vertical Slice | PASS | Feature builds thin end-to-end: UI button → Gatekeeper API → SkyPilot CLI → cloud VPS → status back to UI. |
| VI. Upstream Integrity | PASS | SkyPilot consumed as external CLI tool, not forked or embedded. |
| VII. Fail Secure | PASS | Unknown cluster states map to `error`. Gatekeeper defaults to LOCAL mode on VPS boot. |

## Project Structure

### Documentation (this feature)

```text
specs/002-skypilot-provisioning/
├── plan.md              # This file
├── research.md          # Phase 0: SkyPilot CLI research
├── data-model.md        # Phase 1: Entities and state machine
├── quickstart.md        # Phase 1: Test scenarios
├── contracts/           # Phase 1: API contracts
│   └── cluster-api.md   # HTTP endpoints + internal service interfaces
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
# Gatekeeper backend (Bun/TypeScript) — new files for this feature
gatekeeper/src/
├── handlers/
│   └── cluster.ts           # HTTP handlers: launch, stop, destroy, status, events (SSE)
├── services/
│   └── sky_runner.ts        # Process spawning: Bun.spawn for sky commands
├── types.ts                 # Extended with ClusterStatus, Cluster, ProviderConfig
└── index.ts                 # New routes wired in

# Pure functional core (no IO, no React) — new files
src/lib/
├── skypilot.ts              # YAML generation, status parsing, error extraction
└── cluster_client.ts        # React-side HTTP client for cluster endpoints

# React frontend — modified files
src/
├── App.tsx                  # New cluster UI section + SSE connection
└── App.css                  # Cluster status styles

# QA playbook — modified
src/lib/
└── playbook.ts              # New QA steps for provisioning features

# Tests
gatekeeper/src/__tests__/
├── skypilot.test.ts         # Unit tests for YAML generation, parsing
└── cluster.test.ts          # Integration tests for cluster handlers
```

**Structure Decision**: Extends existing two-layer architecture (gatekeeper + frontend). New `services/` directory in gatekeeper for process-spawning logic, keeping handlers thin. Pure functions in `src/lib/skypilot.ts` for testable YAML generation and output parsing.

## Complexity Tracking

> No constitution violations. All logic fits cleanly into existing two-layer architecture.
