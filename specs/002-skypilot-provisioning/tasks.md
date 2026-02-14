# Tasks: SkyPilot Provisioning

**Input**: Design documents from `/specs/002-skypilot-provisioning/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/cluster-api.md

**Tests**: Included — unit tests for pure functions and integration tests for handlers.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Extend project structure for cluster management — new directories, shared types, pure function library

- [X] T001 Add ClusterStatus, Cluster, ProviderConfig, SkyPilotConfig, and ProvisioningEvent types to `gatekeeper/src/types.ts` per data-model.md entities and validation rules
- [X] T002 [P] Create `src/lib/skypilot.ts` with pure functions: `generate_yaml()`, `parse_status()`, `parse_check()`, `extract_error()` per contracts/cluster-api.md internal service contracts (skypilot.ts section)
- [X] T003 [P] Create `gatekeeper/src/services/` directory and `gatekeeper/src/services/sky_runner.ts` with SkyRunner functions: `sky_launch()`, `sky_stop()`, `sky_down()`, `sky_status()`, `sky_check()`, `sky_ip()` per contracts/cluster-api.md internal service contracts (sky_runner.ts section)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented — tests for pure functions and the SSE event bus

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Create unit tests for `generate_yaml()` in `gatekeeper/src/__tests__/skypilot.test.ts` — verify YAML output includes name, resources (cpus, memory, disk_size, use_spot, ports), envs, file_mounts, setup, and run sections per research.md §2 key YAML fields
- [X] T005 [P] Create unit tests for `parse_status()` in `gatekeeper/src/__tests__/skypilot.test.ts` — verify SkyPilot state mapping: INIT→provisioning, UP→running, STOPPED→stopped, not-in-output→no_server per research.md §3 cluster state mapping table
- [X] T006 [P] Create unit tests for `parse_check()` in `gatekeeper/src/__tests__/skypilot.test.ts` — verify extraction of enabled/disabled clouds from `sky check` output
- [X] T007 [P] Create unit tests for `extract_error()` in `gatekeeper/src/__tests__/skypilot.test.ts` — verify error pattern matching: "Credentials not found", "No cloud access", "Failed to provision", "ResourcesUnavailableError", "Catalog does not contain" per research.md §5
- [X] T008 Implement in-memory cluster state store in `gatekeeper/src/handlers/cluster.ts` — module-level `Cluster | null` variable with getter/setter, initialized to null (no_server), enforcing single-cluster constraint (FR-010) and state transition validation rules from data-model.md
- [X] T009 [P] Implement SSE event bus in `gatekeeper/src/handlers/cluster.ts` — array of connected `ReadableStream` controllers, `broadcast_event(event: ProvisioningEvent)` function that writes `event:` + `data:` lines to all connected clients per contracts/cluster-api.md GET /cluster/events spec

**Checkpoint**: Foundation ready — pure functions tested, cluster state store and SSE bus available for handler implementation

---

## Phase 3: User Story 1 — Launch a Cloud Server (Priority: P1) 🎯 MVP

**Goal**: User clicks "Launch Server" → system generates YAML, spawns `sky launch`, streams progress, and reports "running" when complete

**Independent Test**: Trigger launch via `POST /cluster/launch` → verify state transitions no_server→provisioning→running, SSE events stream, and status endpoint reports running with IP

### Tests for User Story 1

- [X] T010 [P] [US1] Create handler integration tests in `gatekeeper/src/__tests__/cluster.test.ts` — test POST /cluster/launch returns 202 with cluster_name, test 409 when cluster already active, test 424 when sky not installed, test 424 when no credentials
- [X] T011 [P] [US1] Create handler integration test in `gatekeeper/src/__tests__/cluster.test.ts` — test GET /cluster/check returns sky_installed boolean, sky_version, enabled_clouds array, disabled_clouds record

### Implementation for User Story 1

- [X] T012 [US1] Implement `GET /cluster/check` handler in `gatekeeper/src/handlers/cluster.ts` — calls `sky_check()` from sky_runner, parses output via `parse_check()`, returns ResultEnvelope per contracts/cluster-api.md
- [X] T013 [US1] Implement `POST /cluster/launch` handler in `gatekeeper/src/handlers/cluster.ts` — validates no active cluster (409), checks sky installed (424), checks credentials (424), generates YAML via `generate_yaml()`, writes to temp file, spawns `sky_launch()`, sets status to provisioning, streams progress via SSE broadcast, on exit 0 sets status to running + fetches IP via `sky_ip()`, on error sets status to error with `extract_error()` message
- [X] T014 [US1] Implement `GET /cluster/status` handler in `gatekeeper/src/handlers/cluster.ts` — returns current cluster state from in-memory store per contracts/cluster-api.md GET /cluster/status response shape
- [X] T015 [US1] Implement `GET /cluster/events` SSE handler in `gatekeeper/src/handlers/cluster.ts` — returns Response with ReadableStream (type: "direct"), content-type text/event-stream, registers controller in SSE bus, cleans up on close
- [X] T016 [US1] Wire cluster routes into `gatekeeper/src/index.ts` — add /cluster/launch, /cluster/status, /cluster/events, /cluster/check routes pointing to cluster handlers, using existing routing pattern
- [X] T017 [US1] Create `src/lib/cluster_client.ts` — typed HTTP client functions: `cluster_launch(config?)`, `cluster_status()`, `cluster_check()`, `cluster_events()` returning EventSource, all targeting gatekeeper base URL per contracts/cluster-api.md endpoint shapes
- [X] T018 [US1] Add cluster UI section to `src/App.tsx` — cluster status badge (color-coded: green=running, yellow=provisioning, red=error, gray=no_server), "Launch Server" button (disabled when cluster active per FR-010), progress event stream display in debug panel, SSE connection via EventSource to /cluster/events
- [X] T019 [US1] Add cluster status styles to `src/App.css` — status badge colors, launch button states, progress event styling consistent with existing debug panel aesthetic

**Checkpoint**: User Story 1 fully functional — launch a server, see progress, confirm running with IP

---

## Phase 4: User Story 2 — Monitor Server Status (Priority: P2)

**Goal**: Application polls for cluster status at regular intervals and displays current state so user always knows what's happening

**Independent Test**: Launch a server, observe status polling updates in UI every 15-30 seconds; externally change state and verify UI reflects it within 60 seconds

### Implementation for User Story 2

- [X] T020 [US2] Implement status polling in `src/App.tsx` — `setInterval` that calls `cluster_status()` from cluster_client, 15s during transitions (provisioning/stopping/destroying), 30s during steady-state (running/stopped/no_server) per research.md §3 polling interval decision; reconcile polled status with local state, clear interval on unmount
- [X] T021 [US2] Implement server-side status refresh in `gatekeeper/src/handlers/cluster.ts` — when GET /cluster/status is called and cluster exists, optionally spawn `sky_status()` with `--refresh` flag to get live cloud state, update in-memory store if SkyPilot reports different state than local (handles app-restart detection per edge case: user closes app mid-provisioning)

**Checkpoint**: Status polling works — UI reflects actual cloud state within 60 seconds of any change (SC-002)

---

## Phase 5: User Story 3 — Stop and Destroy Server (Priority: P3)

**Goal**: User can stop a running server to save costs and destroy it to remove all cloud resources

**Independent Test**: Launch a server, stop it (verify stopped), destroy it (verify no_server and `sky status` shows nothing)

### Tests for User Story 3

- [X] T022 [P] [US3] Create handler integration tests in `gatekeeper/src/__tests__/cluster.test.ts` — test POST /cluster/stop returns 202 when running, 409 when not running, 404 when no cluster; test POST /cluster/destroy returns 202 when running/stopped/error, 404 when no cluster, 409 when already destroying

### Implementation for User Story 3

- [X] T023 [US3] Implement `POST /cluster/stop` handler in `gatekeeper/src/handlers/cluster.ts` — validates cluster is running (404/409), sets status to stopping, spawns `sky_stop()`, on success sets status to stopped, on failure sets status to error with extract_error() message, broadcasts SSE events
- [X] T024 [US3] Implement `POST /cluster/destroy` handler in `gatekeeper/src/handlers/cluster.ts` — validates cluster exists and not already destroying (404/409), sets status to destroying, spawns `sky_down()`, on success resets cluster to null (no_server), on failure sets status to error, broadcasts SSE events
- [X] T025 [US3] Wire /cluster/stop and /cluster/destroy routes into `gatekeeper/src/index.ts`
- [X] T026 [US3] Add Stop and Destroy buttons to cluster UI in `src/App.tsx` — "Stop Server" enabled only when status=running, "Destroy Server" enabled when status=running/stopped/error, both disabled during transitions (stopping/destroying/provisioning), confirmation dialog before destroy, op log entries for each action
- [X] T027 [US3] Add stop/destroy button styles to `src/App.css` — destructive action styling for destroy button, disabled states, confirmation dialog styling

**Checkpoint**: Full lifecycle works — launch, stop, destroy, back to no_server

---

## Phase 6: User Story 4 — Vault File Mounts (Priority: P4)

**Goal**: Provisioned VPS automatically mounts Public and Private vault directories so Gatekeeper on VPS can serve files

**Independent Test**: Launch a server with local vault files, SSH in and verify files exist at `/opt/carapace/data/public/` and `/opt/carapace/data/private/`

### Implementation for User Story 4

- [X] T028 [US4] Update `generate_yaml()` in `src/lib/skypilot.ts` to include file_mounts section mapping `./data/public` → `/opt/carapace/data/public` and `./data/private` → `/opt/carapace/data/private` per research.md §6 vault mount paths
- [X] T029 [US4] Add unit tests for file_mounts in `gatekeeper/src/__tests__/skypilot.test.ts` — verify generate_yaml() output includes both vault mount paths, verify paths are correct local→remote mappings
- [X] T030 [US4] Display mount status in cluster UI in `src/App.tsx` — when cluster is running, show indicator that vault files are synced (informational only, no live sync indicator since rsync is at launch time per research.md §6)

**Checkpoint**: Vault file mounts configured automatically — no user interaction needed beyond clicking Launch (FR-007, SC-006)

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: QA playbook, final validation, cleanup

- [X] T031 Update QA playbook in `src/lib/playbook.ts` — add provisioning QA steps: launch server and verify running, check status polling accuracy, stop and verify stopped, destroy and verify no_server, error case: missing SkyPilot, per quickstart.md QA playbook integration section
- [X] T032 [P] Run full test suite (`bun test --cwd gatekeeper`) and verify all existing + new tests pass
- [X] T033 [P] Run `bun run check` (biome) and fix any lint/format issues
- [ ] T034 Run quickstart.md scenarios 1-6 as manual validation (requires SkyPilot + cloud credentials)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 types (T001) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational phase completion
- **User Story 2 (Phase 4)**: Depends on US1 (needs launch capability and status endpoint)
- **User Story 3 (Phase 5)**: Depends on US1 (needs a launchable cluster to stop/destroy)
- **User Story 4 (Phase 6)**: Depends on US1 (file_mounts are part of launch YAML generation)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 — no dependencies on other stories
- **US2 (P2)**: Depends on US1 (polling needs an existing status endpoint and cluster)
- **US3 (P3)**: Depends on US1 (stop/destroy need a running cluster to act on)
- **US4 (P4)**: Can start after Phase 2 — file_mounts are part of YAML generation (independent of UI); however, testing requires US1 launch capability

### Within Each User Story

- Tests written FIRST, verified to fail before implementation
- Types/models before services
- Services before handlers
- Handlers before routes
- Backend before frontend
- Core implementation before integration

### Parallel Opportunities

**Phase 1**: T002 and T003 can run in parallel (different files) after T001
**Phase 2**: T005, T006, T007 can run in parallel (same file but independent test cases); T008 and T009 parallel (different concerns in same file — state vs SSE)
**Phase 3**: T010 and T011 parallel (test tasks); T017 and T018 parallel (different layers — client lib vs React UI)
**Phase 5**: T022 parallel with other story work if Phase 2 done
**Phase 6**: T028 and T029 can run alongside US3 work (different files)

---

## Parallel Example: User Story 1

```bash
# Write tests first (parallel):
Task T010: "Handler integration tests for launch/check in cluster.test.ts"
Task T011: "Handler integration test for GET /cluster/check in cluster.test.ts"

# Backend implementation (sequential):
Task T012: "GET /cluster/check handler"
Task T013: "POST /cluster/launch handler"
Task T014: "GET /cluster/status handler"
Task T015: "GET /cluster/events SSE handler"
Task T016: "Wire cluster routes into index.ts"

# Frontend (parallel, after backend):
Task T017: "Cluster client library in src/lib/cluster_client.ts"
Task T018: "Cluster UI section in src/App.tsx"
Task T019: "Cluster status styles in src/App.css"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (types + pure functions + sky_runner)
2. Complete Phase 2: Foundational (tests + state store + SSE bus)
3. Complete Phase 3: User Story 1 (launch + status + events + UI)
4. **STOP and VALIDATE**: Launch a real cluster, see progress, confirm running
5. Push for manual testing on macOS

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (Launch) → Test launch flow → Push (MVP!)
3. Add US2 (Status Polling) → Test polling → Push
4. Add US3 (Stop/Destroy) → Test lifecycle → Push
5. Add US4 (File Mounts) → Test with SSH verification → Push
6. Polish → QA playbook + full test suite → Push

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- `sky_runner.ts` functions are async (Bun.spawn + piped stdout) — all callers must await
- SSE uses Bun's ReadableStream with `type: "direct"` and `controller.flush()` pattern
- Status polling intervals: 15s during transitions, 30s during steady-state
- SkyPilot status parsing: no `--json` flag, parse tabular output for INIT/UP/STOPPED keywords
- Killing `sky launch` process does NOT cancel provisioning — this is by design
- MUST update `src/lib/playbook.ts` with QA steps for this feature (T031)
