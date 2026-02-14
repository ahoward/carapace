# Tasks: SkyPilot Automatic Installer

**Input**: Design documents from `/specs/003-skypilot-installer/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/installer-api.md

**Tests**: Included — unit tests for pure functions and handler integration tests.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add installer types and create the core path resolution functions — the foundation all stories depend on.

- [X] T001 Add InstallPhase, InstallProgress, and InstallStatus types to `gatekeeper/src/types.ts` per data-model.md entities
- [X] T002 Create `gatekeeper/src/services/uv_installer.ts` with pure path functions: `carapace_home()`, `uv_binary_path()`, `sky_binary_path()`, `uv_env()`, `detect_platform()` per contracts/installer-api.md internal service contracts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Unit tests for path functions and detection functions — MUST be complete before user story implementation

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Create unit tests for path functions in `gatekeeper/src/__tests__/uv_installer.test.ts` — verify `carapace_home()` returns `~/.carapace`, `uv_binary_path()` returns path under `carapace_home/uv/bin/uv`, `sky_binary_path()` returns path under `carapace_home/tools/bin/sky`, `uv_env()` returns correct env vars, `detect_platform()` returns valid arch/os pair
- [X] T004 [P] Implement detection functions in `gatekeeper/src/services/uv_installer.ts`: `detect_uv()` (spawns `uv --version`), `detect_sky()` (checks file existence), `check_install_status()` (combines both into InstallStatus object) per contracts/installer-api.md
- [X] T005 [P] Create unit tests for detection functions in `gatekeeper/src/__tests__/uv_installer.test.ts` — verify `check_install_status()` returns correct shape with uv_installed, sky_installed, carapace_home fields

**Checkpoint**: Foundation ready — path functions and detection tested, ready for installer implementation

---

## Phase 3: User Story 1 — Automatic SkyPilot Installation on First Cloud Action (Priority: P1) 🎯 MVP

**Goal**: User triggers any cloud operation → system auto-installs uv + SkyPilot → proceeds with the original action. Progress streamed via SSE.

**Independent Test**: Delete `~/.carapace/`, start gatekeeper, call `POST /cluster/launch` — verify SkyPilot installs automatically and progress events stream via SSE.

### Tests for User Story 1

- [X] T006 [P] [US1] Create unit tests for `ensure_skypilot()` in `gatekeeper/src/__tests__/uv_installer.test.ts` — test idempotent behavior (returns immediately when sky binary exists), test progress callback receives phase transitions, test concurrency guard (second call awaits first)
- [X] T007 [P] [US1] Create handler integration tests in `gatekeeper/src/__tests__/cluster.test.ts` — update existing "returns 424 when sky not installed" test to verify auto-install is attempted, add test for install failure returning 424 with descriptive error

### Implementation for User Story 1

- [X] T008 [US1] Implement `download_uv()` in `gatekeeper/src/services/uv_installer.ts` — detect platform via `detect_platform()`, construct GitHub Releases URL (`https://github.com/astral-sh/uv/releases/latest/download/uv-{arch}-{os}.tar.gz`), download via `fetch()`, extract tarball with `--strip-components=1` to `carapace_home()/uv/bin/`, set executable bit, report progress via callback
- [X] T009 [US1] Implement `ensure_skypilot()` in `gatekeeper/src/services/uv_installer.ts` — the steel thread function: check if sky exists at `sky_binary_path()` → return early if so; else call `download_uv()` if uv missing; then spawn `uv tool install "skypilot-nightly[aws]"` with `UV_TOOL_BIN_DIR`/`UV_TOOL_DIR`/`UV_PYTHON_INSTALL_DIR` env vars set; verify sky binary exists after install; include promise-based concurrency mutex per research.md §6
- [X] T010 [US1] Modify `sky_binary()` in `gatekeeper/src/services/sky_runner.ts` — check `sky_binary_path()` from uv_installer first (existsSync), fall back to `Bun.which("sky")` per contracts/installer-api.md sky_runner.ts section
- [X] T011 [US1] Wire auto-install into `handle_cluster_launch()` in `gatekeeper/src/handlers/cluster.ts` — replace 424 "SkyPilot not installed" error with: call `ensure_skypilot()` with progress wired to `broadcast_event()`, on success proceed with credential check, on failure return 424 with install error message
- [X] T012 [US1] Wire auto-install into `handle_cluster_check()` in `gatekeeper/src/handlers/cluster.ts` — when `sky_binary()` returns null, call `ensure_skypilot()` with progress via `broadcast_event()`, on success proceed with `sky_check()`, on failure return `sky_installed: false` gracefully

**Checkpoint**: Auto-install works — user triggers cloud action, SkyPilot installs automatically, progress streams via SSE

---

## Phase 4: User Story 2 — Developer Setup Installs Cloud Tools (Priority: P2)

**Goal**: `script/setup` installs uv + SkyPilot using same paths/env vars as the runtime installer (steel thread parity).

**Independent Test**: Delete `~/.carapace/`, run `./script/setup`, verify `~/.carapace/tools/bin/sky` exists and is executable.

### Implementation for User Story 2

- [X] T013 [US2] Add `ensure_uv()` bash function to `script/setup` — check if `~/.carapace/uv/bin/uv` exists and is executable; if not, detect platform via `uname -m` and `uname`, download uv tarball from GitHub Releases, extract with `--strip-components=1` to `~/.carapace/uv/bin/`, chmod +x; follows same pattern as existing `ensure_bun()` and `ensure_rust()`
- [X] T014 [US2] Add `ensure_skypilot()` bash function to `script/setup` — check if `~/.carapace/tools/bin/sky` exists; if not, set `UV_TOOL_BIN_DIR=~/.carapace/tools/bin`, `UV_TOOL_DIR=~/.carapace/tools/environments`, `UV_PYTHON_INSTALL_DIR=~/.carapace/python`, run `~/.carapace/uv/bin/uv tool install "skypilot-nightly[aws]"`; follows same idempotent pattern as ensure_bun/ensure_rust
- [X] T015 [US2] Add `~/.carapace/tools/bin` to shell profile PATH in `ensure_shell_profile()` in `script/setup` — add check for `.carapace/tools/bin` pattern, append `export PATH="$HOME/.carapace/tools/bin:$PATH"` if missing

**Checkpoint**: `script/setup` installs uv + skypilot using identical paths as runtime installer — dev/prod parity verified

---

## Phase 5: User Story 3 — Installation Status Visibility (Priority: P3)

**Goal**: `GET /cluster/install-status` endpoint reports current uv/sky installation state without triggering install. `POST /cluster/ensure-skypilot` explicitly triggers install.

**Independent Test**: Start gatekeeper, call `GET /cluster/install-status`, verify response matches contracts/installer-api.md shape.

### Tests for User Story 3

- [X] T016 [P] [US3] Create handler integration tests in `gatekeeper/src/__tests__/cluster.test.ts` — test `GET /cluster/install-status` returns 200 with uv_installed/sky_installed/carapace_home fields, test `POST /cluster/ensure-skypilot` returns 200 when already installed or 202 when starting install

### Implementation for User Story 3

- [X] T017 [US3] Implement `handle_install_status()` handler in `gatekeeper/src/handlers/cluster.ts` — calls `check_install_status()` from uv_installer, returns ResultEnvelope with InstallStatus per contracts/installer-api.md GET /cluster/install-status
- [X] T018 [US3] Implement `handle_ensure_skypilot()` handler in `gatekeeper/src/handlers/cluster.ts` — checks `sky_binary()` first (return 200 "already installed" if exists), otherwise calls `ensure_skypilot()` in background with SSE progress, returns 202 per contracts/installer-api.md POST /cluster/ensure-skypilot
- [X] T019 [US3] Wire new routes into `gatekeeper/src/index.ts` — add `GET /cluster/install-status` → `handle_install_status()` and `POST /cluster/ensure-skypilot` → `handle_ensure_skypilot()` using existing routing pattern
- [X] T020 [US3] Add `cluster_install_status()` and `cluster_ensure_skypilot()` client functions to `src/lib/cluster_client.ts` — typed HTTP client functions following existing pattern (fetch + ResultEnvelope + error handling)

**Checkpoint**: Installation status visible via API — developers and UI can check install state and explicitly trigger install

---

## Phase 6: User Story 4 — Cross-Platform Installation (Priority: P4)

**Goal**: Platform detection works correctly for macOS arm64, macOS x86_64, and Linux x86_64.

**Independent Test**: Run `detect_platform()` on each platform, verify correct target triple is returned.

### Implementation for User Story 4

- [X] T021 [US4] Add platform-specific unit tests to `gatekeeper/src/__tests__/uv_installer.test.ts` — verify `detect_platform()` returns `{ arch: "aarch64"|"x86_64", os: "apple-darwin"|"unknown-linux-gnu" }` for current platform, verify download URL construction produces valid GitHub Releases URL format

**Checkpoint**: Cross-platform detection tested — correct uv binary downloaded for each platform

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Dockerfile, test suite validation, lint, and manual testing

- [X] T022 Update `gatekeeper/Dockerfile` — add `curl` and `ca-certificates` packages, download uv binary to `~/.carapace/uv/bin/` using same paths as TypeScript installer, run `uv tool install "skypilot-nightly[aws]"` with same env vars, verify sky binary exists per plan.md Dockerfile section
- [X] T023 [P] Run full test suite (`bun test --cwd gatekeeper`) and verify all existing + new tests pass
- [X] T024 [P] Run `bun run check` (biome) and fix any lint/format issues
- [ ] T025 Run quickstart.md scenarios 1-5 as manual validation (requires network access for uv/skypilot download) — DEFERRED: manual testing on macOS after push

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 types (T001, T002) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational phase completion
- **User Story 2 (Phase 4)**: Depends on US1 (uses same paths verified in US1)
- **User Story 3 (Phase 5)**: Depends on US1 (needs ensure_skypilot and check_install_status)
- **User Story 4 (Phase 6)**: Can start after Phase 2 (detect_platform is independent)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 — no dependencies on other stories
- **US2 (P2)**: Depends on US1 paths being verified — uses same `~/.carapace/` structure
- **US3 (P3)**: Depends on US1 — needs `ensure_skypilot` and `check_install_status` functions
- **US4 (P4)**: Can start after Phase 2 — `detect_platform()` is independent; testing requires US1 download logic

### Within Each User Story

- Tests written FIRST, verified to fail before implementation
- Pure functions before IO functions
- Services before handlers
- Handlers before routes
- Backend before frontend client

### Parallel Opportunities

**Phase 2**: T004 and T005 can run in parallel (detection vs tests)
**Phase 3**: T006 and T007 parallel (test tasks); T011 and T012 parallel after T009/T010 (different handlers)
**Phase 4**: T013 and T014 are sequential (ensure_uv before ensure_skypilot)
**Phase 5**: T016 parallel with US4 work
**Phase 7**: T023 and T024 parallel (tests vs lint)

---

## Parallel Example: User Story 1

```bash
# Write tests first (parallel):
Task T006: "Unit tests for ensure_skypilot() in uv_installer.test.ts"
Task T007: "Handler integration tests for auto-install in cluster.test.ts"

# Core implementation (sequential):
Task T008: "download_uv() implementation"
Task T009: "ensure_skypilot() implementation"
Task T010: "sky_binary() modification"

# Handler wiring (parallel, after core):
Task T011: "Wire auto-install into handle_cluster_launch()"
Task T012: "Wire auto-install into handle_cluster_check()"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (types + path functions)
2. Complete Phase 2: Foundational (tests + detection)
3. Complete Phase 3: User Story 1 (download + install + auto-install in handlers)
4. **STOP and VALIDATE**: Delete `~/.carapace/`, trigger launch, verify auto-install
5. Push for manual testing on macOS

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (Auto-install) → Test on Linux → Push (MVP!)
3. Add US2 (script/setup) → Test on macOS → Push
4. Add US3 (Status endpoint) → Test → Push
5. Add US4 (Platform tests) → Verify cross-platform → Push
6. Polish → Dockerfile + full test suite → Push

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- `ensure_skypilot()` is THE steel thread — same function called from handlers, script/setup mimics same paths
- `download_uv()` uses `fetch()` + `Bun.spawn(["tar", ...])` for extraction — no npm tar dependency
- `uv tool install` creates a self-contained shim — no runtime env vars needed after install
- Concurrency guard: promise-based mutex prevents parallel installs from corrupting state
