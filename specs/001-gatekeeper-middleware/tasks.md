# Tasks: Gatekeeper Middleware

**Input**: Design documents from `/specs/001-gatekeeper-middleware/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Integration tests are explicitly requested in the spec (FR-012, User Story 4). Tests are included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Refactor spike into modular structure, extract shared types and utilities

- [X] T001 Extract shared types (ResultEnvelope, Mode, FileEntry, HealthResult, SetModeResult, ReadResult, ListResult) to `gatekeeper/src/types.ts`
- [X] T002 Extract make_envelope and make_error helpers to `gatekeeper/src/envelope.ts`
- [X] T003 Implement vault resolution and path sanitization module in `gatekeeper/src/vaults.ts` — resolve vault prefix, decode URL encoding, path.resolve + startsWith check, symlink detection via lstat/realpath, null byte rejection
- [X] T004 Add `"test"` script to `gatekeeper/package.json` for `bun test`
- [X] T005 Add `test` script to root `package.json` running `bun test --cwd gatekeeper`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extract existing spike handlers into modular files, keeping existing behavior working

**WARNING**: No user story work can begin until this phase is complete

- [X] T006 Extract health handler to `gatekeeper/src/handlers/health.ts` — same behavior as spike
- [X] T007 [P] Extract set-mode handler to `gatekeeper/src/handlers/control.ts` — same behavior as spike
- [X] T008 Rewrite `gatekeeper/src/index.ts` as thin router importing from handlers, types, and envelope modules — Bun.serve entry point with vault dir creation on startup
- [X] T009 Verify existing endpoints still work: `bun run gatekeeper/src/index.ts` → curl /health, POST /control/set-mode, GET /tools/fs/list (still dummy data at this point)

**Checkpoint**: Refactored Gatekeeper runs identically to the spike but with modular code structure

---

## Phase 3: User Story 1 — Mode-Aware File Reading (Priority: P1) MVP

**Goal**: Client can read files from public/private vaults via `GET /tools/fs/read?path=public/file.txt`. CLOUD mode blocks private vault reads.

**Independent Test**: Start Gatekeeper with populated vault dirs, read public and private files in both modes, verify access control.

### Tests for User Story 1

- [X] T010 [US1] Write integration tests in `gatekeeper/src/__tests__/fs_read.test.ts` — test cases: LOCAL reads public file, LOCAL reads private file, CLOUD reads public file, CLOUD rejects private file (403), missing file returns 404, missing path param returns 400, invalid vault prefix returns 400

### Implementation for User Story 1

- [X] T011 [US1] Implement fs_read handler in `gatekeeper/src/handlers/fs_read.ts` — parse `path` query param, validate vault prefix, call vaults.ts to resolve and sanitize path, check mode-based access, read file via Bun.file(), return ReadResult envelope
- [X] T012 [US1] Register `/tools/fs/read` route in `gatekeeper/src/index.ts`
- [X] T013 [US1] Run `bun test --cwd gatekeeper` — all fs_read tests pass

**Checkpoint**: File reading with mode-based access control works end-to-end

---

## Phase 4: User Story 2 — Mode-Aware Directory Listing (Priority: P1)

**Goal**: `GET /tools/fs/list` returns real files from vault directories with vault-prefixed paths. CLOUD mode excludes private vault entries.

**Independent Test**: Populate both vaults with known files, verify listing in both modes.

### Tests for User Story 2

- [X] T014 [US2] Write integration tests in `gatekeeper/src/__tests__/fs_list.test.ts` — test cases: LOCAL lists files from both vaults, CLOUD lists only public vault files, empty vaults return empty list, returned paths use vault prefix format, entries include kind and size

### Implementation for User Story 2

- [X] T015 [US2] Implement fs_list handler in `gatekeeper/src/handlers/fs_list.ts` — walk vault directories using node:fs, build FileEntry array with vault-prefixed names, filter by mode
- [X] T016 [US2] Replace dummy DUMMY_FILES data in router with real fs_list handler in `gatekeeper/src/index.ts`
- [X] T017 [US2] Run `bun test --cwd gatekeeper` — all fs_list tests pass

**Checkpoint**: Real directory listing with mode-based filtering works end-to-end

---

## Phase 5: User Story 3 — Path Traversal Protection (Priority: P1)

**Goal**: All traversal attacks (../,  encoded, absolute paths, null bytes, symlinks escaping vault) are rejected regardless of mode.

**Independent Test**: Send crafted traversal payloads, verify every one is rejected with 400.

### Tests for User Story 3

- [X] T018 [US3] Write traversal tests in `gatekeeper/src/__tests__/traversal.test.ts` — test cases: `../../etc/passwd` rejected, `%2e%2e%2f` encoded traversal rejected, absolute path `/etc/passwd` rejected, null byte in path rejected, symlink escaping vault rejected, valid relative path within vault succeeds

### Implementation for User Story 3

- [X] T019 [US3] Verify vaults.ts sanitization (from T003) handles all traversal test cases — fix any gaps found by tests
- [X] T020 [US3] Run `bun test --cwd gatekeeper` — all traversal tests pass

**Checkpoint**: Zero traversal bypasses — all attack vectors rejected

---

## Phase 6: User Story 4 — Integration Tests (Priority: P2)

**Goal**: Full integration test suite with mode switching tests, proving the security contract holds end-to-end.

**Independent Test**: Run `bun test --cwd gatekeeper` — all tests pass in under 10 seconds.

### Tests for User Story 4

- [X] T021 [US4] Write mode-switching integration tests in `gatekeeper/src/__tests__/mode.test.ts` — test cases: default mode is LOCAL, switch to CLOUD and verify private reads blocked, switch back to LOCAL and verify private reads restored, invalid mode rejected, health endpoint reflects current mode

### Implementation for User Story 4

- [X] T022 [US4] Run full test suite `bun test --cwd gatekeeper` — all tests across all files pass
- [X] T023 [US4] Verify test suite completes within 10 seconds

**Checkpoint**: Complete test suite locks the security contract

---

## Phase 7: User Story 5 — Containerized Gatekeeper (Priority: P3)

**Goal**: Dockerfile builds a runnable Gatekeeper image that passes health checks.

**Independent Test**: `docker build` + `docker run` + `curl /health` returns success.

### Implementation for User Story 5

- [X] T024 [US5] Create `gatekeeper/Dockerfile` — base image `oven/bun:slim`, copy src/, expose port, CMD bun run src/index.ts
- [X] T025 [US5] Create `gatekeeper/.dockerignore` — exclude node_modules, __tests__, *.test.ts
- [X] T026 [US5] Build and test: `docker build -t carapace/gatekeeper gatekeeper/` succeeds
- [X] T027 [US5] Run container with mounted vault dirs, verify `/health` returns success envelope

**Checkpoint**: Gatekeeper runs in Docker with same behavior as local

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Update frontend, docs, and verify everything works together

- [X] T028 Update `src/App.tsx` to use new vault-prefixed path format in file list display
- [X] T029 Update `src/App.tsx` types to match new FileEntry shape (size instead of private boolean)
- [X] T030 Run `bun run check` — Biome passes clean on all gatekeeper and frontend code
- [X] T031 Run quickstart.md validation — all curl commands from quickstart.md produce expected results
- [X] T032 Update `dna/product/ROADMAP.md` — check off Phase 1A Gatekeeper items

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 File Reading (Phase 3)**: Depends on Foundational — this is the MVP
- **US2 Directory Listing (Phase 4)**: Depends on Foundational — independent of US1
- **US3 Traversal Protection (Phase 5)**: Depends on Foundational — independent of US1/US2 (vaults.ts built in Setup)
- **US4 Integration Tests (Phase 6)**: Depends on US1 + US2 + US3 (tests all features together)
- **US5 Dockerfile (Phase 7)**: Depends on Foundational — independent of US1-US4
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Foundational → US1 (MVP target)
- **US2 (P1)**: Foundational → US2 (can parallel with US1)
- **US3 (P1)**: Foundational → US3 (can parallel with US1, US2)
- **US4 (P2)**: US1 + US2 + US3 → US4
- **US5 (P3)**: Foundational → US5 (can parallel with US1-US3)

### Parallel Opportunities

Within each user story, tests and implementation are sequential (test-first). But user stories US1, US2, US3, and US5 can all run in parallel after Foundational completes.

---

## Parallel Example: After Foundational Phase

```text
# These can all start simultaneously after Phase 2:
Stream A: T010 → T011 → T012 → T013  (US1: File Reading)
Stream B: T014 → T015 → T016 → T017  (US2: Directory Listing)
Stream C: T018 → T019 → T020         (US3: Traversal Protection)
Stream D: T024 → T025 → T026 → T027  (US5: Dockerfile)

# Then after A+B+C complete:
Stream E: T021 → T022 → T023         (US4: Full Integration Tests)

# Finally:
Stream F: T028 → T029 → T030 → T031 → T032  (Polish)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T005)
2. Complete Phase 2: Foundational (T006–T009)
3. Complete Phase 3: US1 File Reading (T010–T013)
4. **STOP and VALIDATE**: `bun test --cwd gatekeeper` passes, curl tests work
5. Can demo: "CLOUD mode blocks private file reads"

### Incremental Delivery

1. Setup + Foundational → modular codebase ready
2. US1 File Reading → core security mechanism proven (MVP!)
3. US2 Directory Listing → real file discovery works
4. US3 Traversal Protection → security hardened
5. US4 Full Test Suite → contract locked
6. US5 Dockerfile → deployment-ready
7. Polish → frontend updated, docs current

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Each user story is independently completable and testable
- Tests are written FIRST per AGENTS.md antagonistic testing (US4 is the exception — it's the meta-test story)
- Commit after each phase checkpoint
- vaults.ts (T003) is the security-critical module — built in Setup, validated in US3
