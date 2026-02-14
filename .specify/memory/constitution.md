<!--
Sync Impact Report
===================
Version change: 1.0.0 → 1.1.0
Modified sections:
  - Technology Constraints: Gatekeeper changed from Python 3.11+/FastAPI to Bun/TypeScript
  - Principle IV (Thin Desktop Shell): updated language reference from Python to Bun/TypeScript
  - Development Workflow: updated Gatekeeper testing reference
Rationale: Unify the stack on a single language (TypeScript) across frontend, backend,
  and Gatekeeper. Eliminates Python runtime dependency. SkyPilot consumed via CLI.
Templates requiring updates:
  - .specify/templates/plan-template.md ✅ compatible
  - .specify/templates/spec-template.md ✅ compatible
  - .specify/templates/tasks-template.md ✅ compatible
Follow-up TODOs: Update README.md tech stack table
-->

# Carapace Constitution

## Core Principles

### I. Privacy by Default (NON-NEGOTIABLE)

Sensitive user data MUST never leave the user's controlled environment
when using third-party AI APIs. The system MUST fail secure: if the
Gatekeeper crashes, disconnects, or enters an unknown state, private
data MUST be inaccessible. Cloud mode MUST block all access to private
data — there are no exceptions, overrides, or "trust me" flags.

### II. Data Sovereignty

The user's local machine is the single source of truth for all data.
The VPS is ephemeral compute that can be destroyed and recreated at
any time without data loss. All data flows from local → remote, never
the reverse. The user MUST be able to destroy their VPS and retain
100% of their data locally.

### III. Zero Configuration for End Users

The target user is a non-DevOps person. Every infrastructure operation
(provisioning, networking, deployment) MUST be abstracted behind a
single click or toggle. Users MUST NOT need to learn Terraform, SSH,
Docker, or SkyPilot. If a workflow requires terminal access, it is a
bug in the product.

### IV. Thin Desktop Shell

The Tauri desktop app MUST remain a thin orchestration layer. Business
logic belongs in the Bun/TypeScript Gatekeeper (security/data), SkyPilot
CLI (infrastructure), or React frontend (UI state). The Rust/Tauri backend
handles only: spawning child processes, IPC bridging, and OS-level
operations (file paths, system tray). This keeps most logic testable
without building a native binary.

### V. Vertical Slice Development

Every feature MUST be built as a thin end-to-end path through all
layers before any single layer is widened. No layer gets polished in
isolation. A working ugly feature beats a beautiful half-feature. Each
slice MUST be demonstrable: a human can pull, build, and manually
verify it on macOS.

### VI. Upstream Integrity

Carapace wraps OpenClaw; it does not fork, patch, or embed it.
OpenClaw is consumed as a published Docker image
(`openclaw/core:latest`). Carapace MUST NOT contain OpenClaw
source code. If OpenClaw needs changes, those changes are contributed
upstream.

### VII. Fail Secure, Not Fail Open

When any component enters an error state, the system MUST restrict
access rather than grant it. The Gatekeeper defaults to LOCAL mode on
boot. Network failures MUST NOT expose private data. Unknown states
are treated as hostile. This principle applies to every layer: Tauri
backend, Gatekeeper, Docker networking, Tailscale tunnel.

## Technology Constraints

- **Desktop**: Tauri 2.x + React + TypeScript + Vite
- **Gatekeeper**: Bun + TypeScript (Hono or Bun.serve)
- **Infrastructure**: SkyPilot (all supported cloud providers)
- **Networking**: Tailscale (hard dependency, no abstraction layer)
- **VPS Runtime**: Docker Compose (OpenClaw + Ollama + Gatekeeper)
- **Auth model**: Local single-user; no accounts, no server-side auth
- **Multi-cluster**: Single cluster for MVP; design MUST NOT preclude
  multi-cluster in the future (use cluster identifiers, not singletons)
- **File integrity**: `.envrc` MUST never be overwritten, deleted, or
  modified by any automated process

## Development Workflow

- **Spec-driven**: Every feature goes through the spec-kit cycle:
  specify → plan → tasks → implement. No code without a spec.
- **Step-by-step delivery**: Each push MUST be pullable and testable
  on macOS. Development happens on a remote Linux machine; manual
  testing happens on the developer's local macOS machine.
- **React in browser first**: The React frontend MUST be runnable via
  `npm run dev` in a browser with mock backends, independent of Tauri.
- **Gatekeeper tested headless**: The Bun/TypeScript Gatekeeper MUST have a
  standalone test suite (via `bun test`) that runs without any desktop app or VPS.
- **Commits are atomic**: Each commit represents a complete,
  non-breaking unit of work. No "WIP" commits on main after Phase 0.

## Governance

This constitution supersedes all other development practices for the
Carapace project. All code changes MUST comply with these principles.

- **Amendments** require explicit documentation of what changed and why,
  version bump per semantic versioning, and propagation to dependent
  templates.
- **Versioning**: MAJOR for principle removal/redefinition, MINOR for
  new principles or material expansion, PATCH for clarifications.
- **Compliance**: Every spec and plan MUST include a Constitution Check
  that verifies alignment with these principles before implementation
  begins.

**Version**: 1.1.0 | **Ratified**: 2026-02-14 | **Last Amended**: 2026-02-14
