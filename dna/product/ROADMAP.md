# Carapace Roadmap

**Product:** Carapace — Desktop Control-Plane for OpenClaw
**PRD Reference:** [dna/product/PRD.md](PRD.md)
**Status:** Draft
**Last Updated:** 2026-02-13

---

## Overview

Carapace is a zero-configuration desktop application that wraps OpenClaw, enabling non-DevOps users to deploy it on a private cloud VPS with data privacy guarantees. The development strategy is a **full vertical slice**: build a thin end-to-end path through all layers first, then widen each layer incrementally.

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Desktop framework | Tauri + React/TypeScript | Lighter weight than Electron, native performance, smaller bundle |
| Cloud providers | All SkyPilot-supported providers | SkyPilot abstracts provider differences; no reason to limit |
| Development strategy | Full vertical slice | Proves the architecture end-to-end before investing deeply in any layer |
| Upstream dependency | OpenClaw (separate project) | Carapace wraps OpenClaw; does not fork or embed it |
| OpenClaw image | `openclaw/core:latest` (published & stable) | Pull from registry; no need to build or bundle |
| Ollama models | Ship default, allow override | Pull a sensible default (e.g., Llama 3); user can change via UI |
| Multi-cluster | Single cluster now, design for multi later | Keep MVP simple; avoid painting ourselves into a corner |
| Auth model | Local single-user, no accounts | Desktop app — whoever runs it owns it |
| Tunnel | Tailscale only (hard dependency) | Simplest path; no abstraction layer needed |

---

## Phase 0 — Foundation

**Goal:** Project scaffolding, tooling, and the thinnest possible proof that all layers connect.

- [x] Initialize Tauri + React/TS project structure
- [x] Set up build tooling (Vite, TypeScript, Rust/Tauri backend)
- [x] Define project conventions (linting, formatting — Biome)
- [x] Establish constitution and spec-kit workflow
- [x] Spike: Tauri → Bun child process communication (for SkyPilot/Gatekeeper)

---

## Phase 1 — Vertical Slice (MVP-0)

**Goal:** One user can launch a VPS, toggle Local/Cloud mode, and see the Gatekeeper enforce data boundaries. Ugly is fine. It works end-to-end.

### 1A — Gatekeeper Middleware (Bun/TypeScript) ✓

- [x] Implement `/control/set-mode` endpoint (LOCAL / CLOUD)
- [x] Implement `/tools/fs/read` with mode-based access control
- [x] Implement `/tools/fs/list` with mode-based file visibility
- [x] Path traversal sanitization and security hardening
- [x] Dockerfile for the Gatekeeper service
- [x] Integration tests: Cloud mode blocks private data, Local mode allows it

### 1B — SkyPilot Provisioning

- [ ] Dynamic SkyPilot YAML generation from user config
- [ ] `sky launch` wrapper (spawn from Tauri backend)
- [ ] `sky down` / `sky stop` lifecycle management
- [ ] file_mounts configuration for Public/Private vaults
- [ ] Status polling: is the cluster up, healthy, errored?

### 1C — Tailscale Networking

- [ ] Tailscale auth key management (user provides key or OAuth)
- [ ] Tailscale setup in VPS provisioning script
- [ ] Connectivity check: can the desktop reach the VPS over Tailscale?
- [ ] DNS resolution for `openclaw.internal` (or equivalent MagicDNS)

### 1D — Desktop App (Tauri + React/TS)

- [ ] Settings screen: cloud provider credentials, Tailscale auth key
- [ ] "Launch Server" button → triggers SkyPilot provisioning
- [ ] Server status indicator (provisioning / running / stopped / error)
- [ ] Privacy toggle: Local Mode / Cloud Mode → calls Gatekeeper `/control/set-mode`
- [ ] "Destroy Server" button → triggers `sky down`

### 1E — Docker Compose (VPS)

- [ ] Compose config: OpenClaw + Ollama + Gatekeeper
- [ ] Internal networking (Gatekeeper is the only file access path)
- [ ] Volume mounts from SkyPilot file_mounts
- [ ] Health checks for all services

---

## Phase 2 — Data Sovereignty

**Goal:** The user's laptop is the source of truth. VPS is ephemeral compute.

- [ ] Local vault management: `~/OpenClaw/Private` and `~/OpenClaw/Public`
- [ ] Continuous sync (rsync daemon or SkyPilot file_mounts refresh)
- [ ] Sync status UI in desktop app
- [ ] Conflict resolution strategy (local always wins)
- [ ] Graceful handling of VPS destruction (no data loss)

---

## Phase 3 — Hardening & UX

**Goal:** Production-grade security, polished UI, error recovery.

### Security

- [ ] Gatekeeper fails secure on crash/disconnect (defaults to LOCAL)
- [ ] Audit logging for all Gatekeeper access decisions
- [ ] No open ports on VPS (Tailscale-only access)
- [ ] Secrets management (credentials never written to disk in plaintext)
- [ ] Security review of agent jailbreak vectors

### UX

- [ ] Onboarding flow for first-time users
- [ ] Provider selection UI (pick from SkyPilot-supported clouds)
- [ ] Instance type / region selection
- [ ] Cost estimation before launch
- [ ] Real-time logs from VPS in desktop app
- [ ] Error recovery: what happens when provisioning fails mid-way?

---

## Phase 4 — Polish & Distribution

**Goal:** Shippable product.

- [ ] Auto-update mechanism (Tauri built-in updater)
- [ ] Installers: macOS (.dmg), Windows (.msi), Linux (.AppImage / .deb)
- [ ] End-to-end test suite (provisioning → toggle → data access → teardown)
- [ ] Documentation: user guide, architecture overview
- [ ] Performance: file_mounts latency for large datasets (500MB+)
- [ ] Telemetry (opt-in) for debugging deployment issues
- [ ] Bundle Gatekeeper as Tauri sidecar binary (currently spawned via `bun run`)

---

## Resolved Questions

| # | Question | Answer |
|---|----------|--------|
| 1 | **OpenClaw Docker image** — published and stable? | Yes. Pull `openclaw/core:latest` from registry. |
| 2 | **Ollama model management** — who manages models? | Carapace ships a sensible default (e.g., Llama 3), user can override. |
| 3 | **Multi-VPS** — multiple clusters at once? | Not for MVP. Single cluster only, but design so multi-cluster is possible later. |
| 4 | **Auth** — user accounts needed? | No. Local single-user desktop app. No accounts, no auth. |
| 5 | **Tailscale dependency** — mandatory or pluggable? | Mandatory. Tailscale is a hard dependency. No abstraction layer. |
