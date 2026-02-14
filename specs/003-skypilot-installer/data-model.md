# Data Model: SkyPilot Automatic Installer

**Feature**: 003-skypilot-installer
**Date**: 2026-02-14

## Entities

### InstallPhase (Enum)

Represents the current phase of the installation process.

| Value | Description |
|-------|-------------|
| `checking` | Detecting existing installation |
| `downloading_uv` | Downloading the uv package manager binary |
| `installing_skypilot` | Running `uv tool install` for SkyPilot |
| `verifying` | Verifying the installed binary works |
| `complete` | Installation finished successfully |
| `error` | Installation failed |

**Transitions**: `checking` → `complete` (already installed) OR `checking` → `downloading_uv` → `installing_skypilot` → `verifying` → `complete`. Any phase can transition to `error`.

### InstallProgress

A progress event emitted during installation. Streamed to the user in real-time.

| Field | Type | Description |
|-------|------|-------------|
| `phase` | InstallPhase | Current installation phase |
| `message` | string | Human-readable progress description |
| `percent` | number \| null | Completion percentage (null when indeterminate) |

### InstallStatus

The result of querying the current installation state. Read-only, no mutation.

| Field | Type | Description |
|-------|------|-------------|
| `uv_installed` | boolean | Whether the uv binary exists and is executable |
| `uv_version` | string \| null | Version string from `uv --version`, null if not installed |
| `sky_installed` | boolean | Whether the sky binary exists and is executable |
| `sky_version` | string \| null | Version string, null if not installed |
| `carapace_home` | string | Absolute path to `~/.carapace/` |

### Platform

Describes the detected operating system and CPU architecture.

| Field | Type | Description |
|-------|------|-------------|
| `arch` | `"aarch64"` \| `"x86_64"` | CPU architecture |
| `os` | `"apple-darwin"` \| `"unknown-linux-gnu"` | OS identifier in uv target-triple format |

## Relationships

- `InstallProgress` events reference `InstallPhase` via the `phase` field
- `InstallStatus` is a snapshot — queried on-demand, not stored persistently
- `Platform` is detected once per process and cached

## Validation Rules

- `InstallPhase` transitions are one-directional (cannot go from `complete` back to `checking`)
- `percent` is only non-null during `downloading_uv` phase (when content-length header is available)
- `carapace_home` is always an absolute path starting with `/`
- `uv_version` format: semver string (e.g., `"0.10.2"`)

## Storage

No persistent storage. All state is:
- **Filesystem**: existence of binaries at known paths (`~/.carapace/uv/bin/uv`, `~/.carapace/tools/bin/sky`)
- **In-memory**: installation mutex (Promise-based, process-scoped)

The installer is stateless — it discovers state from the filesystem on every invocation.
