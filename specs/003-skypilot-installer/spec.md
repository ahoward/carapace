# Feature Specification: SkyPilot Automatic Installer

**Feature Branch**: `003-skypilot-installer`
**Created**: 2026-02-14
**Status**: Draft
**Input**: User description: "Steel thread SkyPilot installer: Bundle SkyPilot CLI into Carapace via uv package manager. One install code path for dev, prod, and Docker (dev/prod parity). Download uv binary on first use, then install SkyPilot into ~/.carapace/ isolated environment. Lazy install when user first triggers cloud operations. Progress streamed via existing SSE event bus. Cross-platform: macOS arm64/x86, Linux x86_64. Update bin/setup and Dockerfile to use same paths and commands. No system Python required."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatic SkyPilot Installation on First Cloud Action (Priority: P1)

A user opens Carapace and clicks "Launch Server" or "Check Clouds" for the first time. SkyPilot has never been installed on their machine. Instead of seeing an error telling them to manually install software, the system automatically downloads and installs the required cloud tooling in the background. The user sees real-time progress messages ("Downloading package manager...", "Installing cloud tools...") in the same event stream they would normally see provisioning progress. Once installation completes (1-2 minutes), the original action proceeds automatically — the user never leaves the app or opens a terminal.

**Why this priority**: This is the core value proposition. Without automatic installation, every new user must manually install Python, pip, and SkyPilot before they can use cloud features. This eliminates that friction entirely. It also represents the "steel thread" — the single install path that all other stories build on.

**Independent Test**: Trigger any cloud operation on a clean machine (no SkyPilot installed). Verify the system installs SkyPilot automatically and the cloud operation proceeds without user intervention.

**Acceptance Scenarios**:

1. **Given** a machine with no SkyPilot installed, **When** the user clicks "Launch Server", **Then** the system automatically installs SkyPilot, reports progress via the event stream, and proceeds to launch once installation completes.
2. **Given** a machine with no SkyPilot installed, **When** the user clicks "Check Clouds", **Then** the system automatically installs SkyPilot, then returns the cloud provider check results.
3. **Given** SkyPilot is already installed, **When** the user clicks "Launch Server", **Then** the system detects the existing installation and proceeds immediately with no install step.
4. **Given** installation is in progress from one action, **When** the user triggers another cloud action, **Then** the second action waits for the in-progress installation rather than starting a duplicate install.

---

### User Story 2 - Developer Setup Installs Cloud Tools (Priority: P2)

A developer clones the Carapace repository and runs the project setup script. The setup script installs all required tooling — including the cloud provisioning tools — using the exact same installation mechanism that the running application uses. There is no separate "developer install" vs "production install". The developer can immediately use cloud features after setup completes.

**Why this priority**: Dev/prod parity is a core architectural principle. If the setup script uses a different install path than the app runtime, divergence is inevitable. This story ensures developers always exercise the same code path that end users do.

**Independent Test**: Clone the repo on a clean machine, run the setup script, verify SkyPilot is installed at the expected location and functional.

**Acceptance Scenarios**:

1. **Given** a fresh clone of the repository, **When** the developer runs the setup script, **Then** the cloud tooling is installed to the application-managed directory using the same mechanism as runtime auto-install.
2. **Given** cloud tooling is already installed from a previous setup or app run, **When** the developer runs the setup script again, **Then** the existing installation is detected and the step completes instantly (idempotent).
3. **Given** the setup script installs cloud tooling, **When** the developer launches the app and clicks "Check Clouds", **Then** the app detects the already-installed tooling without re-installing.

---

### User Story 3 - Installation Status Visibility (Priority: P3)

A user or developer can check whether the cloud tooling is installed and what version is present, without triggering any cloud operations. This is useful for troubleshooting, verifying setup, and understanding the system state.

**Why this priority**: Observability supports debugging and confidence but is not required for core functionality.

**Independent Test**: Query the installation status endpoint and verify it accurately reports whether cloud tools are present.

**Acceptance Scenarios**:

1. **Given** no cloud tooling is installed, **When** the user queries installation status, **Then** the system reports that cloud tools are not installed, along with the expected installation directory.
2. **Given** cloud tooling is installed, **When** the user queries installation status, **Then** the system reports installed versions and the installation directory.

---

### User Story 4 - Cross-Platform Installation (Priority: P4)

The automatic installation works identically on macOS (both Apple Silicon and Intel) and Linux (x86_64). The installation process detects the current platform and downloads the appropriate binaries. A user on any supported platform has the same experience.

**Why this priority**: Cross-platform support is essential but is a characteristic of the installer rather than a separate feature. It is tested as part of every other story.

**Independent Test**: Run the auto-install on macOS arm64, macOS x86_64, and Linux x86_64 and verify each produces a working SkyPilot installation.

**Acceptance Scenarios**:

1. **Given** a macOS Apple Silicon machine, **When** auto-install is triggered, **Then** the correct platform-specific binaries are downloaded and SkyPilot functions correctly.
2. **Given** a macOS Intel machine, **When** auto-install is triggered, **Then** the correct platform-specific binaries are downloaded and SkyPilot functions correctly.
3. **Given** a Linux x86_64 machine, **When** auto-install is triggered, **Then** the correct platform-specific binaries are downloaded and SkyPilot functions correctly.

---

### Edge Cases

- What happens when the network is unavailable during installation? The system reports a clear error message explaining the network issue and allows the user to retry.
- What happens when the download is interrupted mid-way? The system detects the incomplete installation on next attempt and re-downloads.
- What happens when disk space is insufficient (~200MB needed)? The installation fails with a clear error message about disk space.
- What happens when the user has SkyPilot installed globally via pip? The system detects the global installation via PATH fallback and uses it, without reinstalling.
- What happens when two cloud actions are triggered simultaneously on an uninstalled system? Only one installation runs; the second waits for the first to complete.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST install cloud provisioning tools automatically when the user triggers a cloud operation and the tools are not yet installed.
- **FR-002**: System MUST use a single installation mechanism across all contexts: runtime auto-install, developer setup script, and container builds.
- **FR-003**: System MUST stream installation progress messages to the user through the existing real-time event channel.
- **FR-004**: System MUST install tools into an application-managed directory (`~/.carapace/`) that does not pollute system-wide package managers or directories.
- **FR-005**: System MUST NOT require Python to be pre-installed on the user's machine. The installer manages its own runtime dependencies.
- **FR-006**: System MUST detect and reuse an existing installation (idempotent). Re-running the installer on a machine that already has the tools installed MUST complete in under 2 seconds.
- **FR-007**: System MUST support macOS (arm64, x86_64) and Linux (x86_64) platforms, detecting the correct platform automatically.
- **FR-008**: System MUST fall back to a globally-installed cloud CLI (if found in PATH) when no application-managed installation exists.
- **FR-009**: System MUST prevent concurrent installations — if an installation is already in progress, subsequent requests MUST wait for it rather than starting a duplicate.
- **FR-010**: System MUST provide an endpoint to query installation status without triggering an install.
- **FR-011**: System MUST provide an endpoint to explicitly trigger installation (for developer setup and pre-warming).
- **FR-012**: The developer setup script MUST install cloud tools using the same paths and mechanisms as the runtime installer.
- **FR-013**: The container build MUST pre-install cloud tools using the same paths and mechanisms as the runtime installer.
- **FR-014**: System MUST report clear, actionable error messages when installation fails (network errors, disk space, permission issues).

### Key Entities

- **Installation State**: Whether cloud tools are installed, their versions, and the installation directory path. Used for status reporting and install-vs-skip decisions.
- **Install Progress**: A timestamped message with a phase indicator (checking, downloading, installing, verifying, complete, error) streamed to the user during installation.
- **Platform Descriptor**: The detected operating system and CPU architecture, used to select the correct download artifacts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user on a clean machine can trigger a cloud operation and have the required tools automatically installed and the operation completed — all without leaving the application or opening a terminal.
- **SC-002**: The installation process completes in under 3 minutes on a standard broadband connection (25 Mbps+).
- **SC-003**: On a machine where tools are already installed, the detection check adds less than 2 seconds to any cloud operation.
- **SC-004**: The same installation mechanism is used in all three contexts (runtime, developer setup, container build) with zero code path divergence.
- **SC-005**: Installation works on all 3 supported platforms (macOS arm64, macOS x86_64, Linux x86_64) without platform-specific user instructions.
- **SC-006**: When installation fails, the user sees an actionable error message within 10 seconds of the failure, and can retry without restarting the application.

## Assumptions

- Users have internet access when cloud tooling is first needed (offline installation is out of scope).
- The `~/.carapace/` directory is writable by the current user without elevated privileges.
- The cloud tool package (`skypilot-nightly[aws]`) and its transitive dependencies are available as pre-built binary wheels for all supported platforms (no C compilation required at install time).
- The package manager binary (`uv`) is available for download from a public URL for all supported platforms.
- Approximately 200MB of disk space is available for the installation (package manager + cloud tool + runtime).
