# Feature Specification: SkyPilot Provisioning

**Feature Branch**: `002-skypilot-provisioning`
**Created**: 2026-02-14
**Status**: Draft
**Input**: User description: "Phase 1B — SkyPilot Provisioning: Add cloud VPS provisioning to Carapace via SkyPilot CLI. Generate dynamic SkyPilot YAML from user config, implement sky launch/down/stop lifecycle wrappers spawned from the Tauri backend, configure file_mounts for Public/Private vaults, and add status polling to track cluster state (provisioning/running/stopped/error). All SkyPilot interaction is via CLI (not Python SDK), consumed through Bun/TypeScript subprocess spawning."

## User Scenarios & Testing

### User Story 1 - Launch a Cloud Server (Priority: P1)

A user wants to launch a cloud VPS so that OpenClaw can run on remote compute while the Gatekeeper enforces data privacy. The user provides their cloud provider credentials and clicks "Launch Server." The system generates the appropriate configuration, provisions a VPS on the user's chosen cloud provider, and reports back when the server is ready.

**Why this priority**: Without the ability to launch a server, no other provisioning feature has value. This is the foundational capability of the entire phase.

**Independent Test**: Can be fully tested by triggering a launch action with valid cloud credentials and verifying a VPS is provisioned and reachable. Delivers the core value of "I clicked a button and got a cloud server."

**Acceptance Scenarios**:

1. **Given** valid cloud provider credentials are configured, **When** the user triggers "Launch Server," **Then** a VPS is provisioned on the selected cloud provider and the system reports the server as "running" within 10 minutes.
2. **Given** a launch is in progress, **When** the user views the application, **Then** the system displays "provisioning" status with progress feedback so the user knows something is happening.
3. **Given** invalid or missing cloud credentials, **When** the user triggers "Launch Server," **Then** the system displays a clear error message identifying the credential problem before attempting to provision.

---

### User Story 2 - Monitor Server Status (Priority: P2)

A user wants to see the current state of their cloud server at a glance — is it running, stopped, being provisioned, or in an error state? The application polls for status and displays it prominently so the user never has to wonder what's happening.

**Why this priority**: Once a server can be launched, the user needs immediate feedback on its state. Without status visibility, the user is blind to whether their server is actually running, which makes the product feel broken.

**Independent Test**: Can be tested by launching a server, then observing status transitions from "provisioning" to "running." Also testable by manually stopping a server externally and verifying the UI detects the change.

**Acceptance Scenarios**:

1. **Given** a server is running, **When** the user views the application, **Then** the status displays "running" and updates at least every 30 seconds.
2. **Given** a server was just launched, **When** provisioning is in progress, **Then** the status displays "provisioning" and transitions to "running" when complete.
3. **Given** a server has encountered an error during provisioning, **When** the user views the application, **Then** the status displays "error" with a human-readable description of what went wrong.
4. **Given** no server has been launched, **When** the user views the application, **Then** the status displays "no server" or equivalent, prompting the user to launch one.

---

### User Story 3 - Stop and Destroy Server (Priority: P3)

A user wants to stop their cloud server to save costs when they're not using it, and destroy it entirely when they're done. Stopping preserves the server state for quick resume; destroying removes all cloud resources.

**Why this priority**: Cost management is critical — cloud VPS instances cost money per hour. Users must be able to stop spending when they're done working. Destroying is the cleanup action.

**Independent Test**: Can be tested by launching a server, then stopping it and verifying it transitions to "stopped," then destroying it and verifying all cloud resources are removed.

**Acceptance Scenarios**:

1. **Given** a running server, **When** the user triggers "Stop Server," **Then** the server is stopped within 2 minutes and status transitions to "stopped."
2. **Given** a stopped server, **When** the user triggers "Destroy Server," **Then** all cloud resources for that server are removed and status transitions to "no server."
3. **Given** a running server, **When** the user triggers "Destroy Server," **Then** the server is stopped and destroyed, with status transitioning to "no server."
4. **Given** a stop or destroy is in progress, **When** the user views the application, **Then** the system shows an appropriate transitional status (e.g., "stopping," "destroying").

---

### User Story 4 - Vault File Mounts (Priority: P4)

The provisioned VPS must mount the user's Public and Private vault directories so that the Gatekeeper (already running on the VPS via Docker Compose in Phase 1E) can serve files from them. The file mount configuration is generated automatically as part of the provisioning config — the user does not manually configure mount paths.

**Why this priority**: File mounts connect the provisioning layer to the Gatekeeper layer. Without them, the VPS is compute-only with no data access. However, this can be validated after the basic launch/stop/destroy lifecycle works.

**Independent Test**: Can be tested by launching a server with file mounts configured, then verifying the mounted directories exist on the VPS and contain the expected vault contents.

**Acceptance Scenarios**:

1. **Given** the user triggers "Launch Server," **When** provisioning completes, **Then** the Public vault directory is mounted and accessible on the VPS.
2. **Given** the user triggers "Launch Server," **When** provisioning completes, **Then** the Private vault directory is mounted and accessible on the VPS.
3. **Given** the user has files in their local vault directories, **When** the server is provisioned, **Then** those files are available at the expected mount paths on the VPS.

---

### Edge Cases

- What happens when the cloud provider rate-limits or rejects the provisioning request (e.g., quota exceeded)? The system surfaces the provider's error message to the user.
- How does the system handle a network disconnection during provisioning? The system detects the failure on next status poll and reports an error state.
- What happens if the user closes the application while provisioning is in progress? The provisioning continues on the cloud side; when the user reopens the app, status polling detects the running (or failed) server.
- How does the system behave if the VPS becomes unreachable after successful provisioning? Status polling detects the failure and transitions to "error" with a description.
- What happens if the user triggers "Launch" when a server is already running? The system prevents the action and informs the user a server is already active.
- What happens if "Stop" or "Destroy" fails mid-operation? The system reports the error and allows the user to retry.
- How does the system handle the case where SkyPilot is not installed on the user's machine? The system detects the missing dependency and displays installation instructions.

## Requirements

### Functional Requirements

- **FR-001**: System MUST generate provisioning configuration dynamically based on the user's cloud provider selection and credentials.
- **FR-002**: System MUST provision a VPS on any SkyPilot-supported cloud provider when the user triggers "Launch Server."
- **FR-003**: System MUST report server status as one of: "no server," "provisioning," "running," "stopping," "stopped," "destroying," or "error."
- **FR-004**: System MUST poll for server status at regular intervals (at least every 30 seconds) and update the display.
- **FR-005**: System MUST allow the user to stop a running server, preserving its state for later resume.
- **FR-006**: System MUST allow the user to destroy a server, removing all cloud resources associated with it.
- **FR-007**: System MUST configure file mounts for the Public and Private vault directories as part of the provisioning configuration.
- **FR-008**: System MUST validate that cloud credentials are present and minimally correct before attempting to provision.
- **FR-009**: System MUST display clear, human-readable error messages when provisioning, stopping, or destroying fails.
- **FR-010**: System MUST prevent duplicate launch attempts when a server is already running or provisioning.
- **FR-011**: System MUST detect when SkyPilot is not available and inform the user how to install it.
- **FR-012**: System MUST stream or relay provisioning progress to the user so they are not staring at a spinner with no information.

### Key Entities

- **Cluster**: Represents a provisioned cloud VPS. Has a name, status, cloud provider, region, and creation timestamp. One active cluster at a time (single-cluster MVP).
- **Cluster Status**: The lifecycle state of a cluster: no_server → provisioning → running → stopping → stopped → destroying → no_server. Error is reachable from any active state.
- **Provider Config**: The user's cloud provider selection and associated credentials. Includes provider name, credential references, preferred region, and instance type.
- **Provisioning Config**: The generated configuration document that defines what to provision: instance specs, setup commands, file mount mappings, and environment variables.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A user with valid cloud credentials can go from "no server" to "running" in under 10 minutes with no manual steps beyond clicking "Launch Server."
- **SC-002**: Server status is always accurate within 60 seconds of any state change (provisioning complete, stop complete, error occurred).
- **SC-003**: Stopping a running server completes within 2 minutes.
- **SC-004**: Destroying a server removes all cloud resources and returns to "no server" within 3 minutes.
- **SC-005**: 100% of provisioning failures surface a human-readable error message to the user (no silent failures).
- **SC-006**: Vault file mounts are correctly configured on 100% of successful provisioning attempts.
- **SC-007**: The system prevents 100% of duplicate launch attempts (user cannot accidentally provision two servers).

## Assumptions

- SkyPilot is installed separately by the user (or by a future setup step). Carapace invokes it as an external tool, not a bundled dependency.
- The user has already set up cloud provider credentials in their environment (e.g., `~/.aws/credentials`, `gcloud auth`, etc.) — Carapace does not manage the credential setup flow, only validates their presence.
- Single cluster at a time (per ROADMAP: "single for MVP, design for multi later").
- The provisioning configuration includes a setup script that installs Docker and Docker Compose on the VPS (the Docker Compose configuration itself is Phase 1E scope).
- File mounts use SkyPilot's file_mounts mechanism, which syncs local directories to the VPS at launch time.
- The user's local vault directories are at the default paths used by the Gatekeeper (`./data/public` and `./data/private` relative to the project root, or overridable via environment variables).
