# Carapace

A zero-configuration desktop application for deploying AI agents on private cloud infrastructure with built-in data privacy controls.

## What It Does

Carapace lets non-DevOps users spin up a private AI environment with one click. It manages the full lifecycle: provisioning a cloud VPS, securing the network, and enforcing data access rules based on which AI model is active.

The core insight is the **Data Gatekeeper** — a middleware layer that segregates data access between local and cloud AI models. When using a cloud model (e.g., Anthropic), sensitive data is blocked at the API level. When using a local model (e.g., Ollama), full access is granted. The system fails secure by default.

## Key Features

- **One-Click Provisioning** — Enter cloud credentials, click launch. SkyPilot handles the VPS, Docker, and networking.
- **Privacy Toggle** — Switch between local inference (full data access) and cloud inference (public data only) with a UI toggle.
- **Data Sovereignty** — Your data lives on your machine. The VPS is ephemeral compute. Local folders sync to the server; destroy the server anytime without losing anything.
- **Secure Networking** — Tailscale mesh encrypts all traffic between your machine and the VPS. No open ports.

## Architecture

```
┌─────────────────────┐          ┌──────────────────────────────┐
│  Desktop (Electron)  │◄──────►│  VPS (Docker)                │
│                      │Tailscale│                              │
│  - React/TypeScript  │  mesh   │  - OpenClaw Agent            │
│  - SkyPilot SDK      │         │  - Ollama (local inference)  │
│  - Control Plane     │         │  - Gatekeeper (FastAPI)      │
└─────────────────────┘          └──────────────────────────────┘
```

- **Frontend (Host):** Electron (React/TypeScript)
- **Infrastructure:** SkyPilot — manages cloud VPS lifecycle
- **Networking:** Tailscale — encrypted mesh, no public ports
- **Backend (VPS):** Docker — OpenClaw, Ollama, Gatekeeper middleware

## Security Model

| Threat | Mitigation |
|--------|------------|
| Agent jailbreak | Agent container has no volume mounts. All file access goes through the Gatekeeper API. |
| Cloud data leakage | Gatekeeper defaults to LOCAL mode on boot. Disconnect = fail secure (private data locked). |
| VPS compromise | Tailscale mesh — no public internet ports except SSH for SkyPilot provisioning. |

## Status

Early development. See `dna/product/PRD.md` for full requirements.

## Project Structure

```
AGENTS.md              # Coding standards and design principles
dna/                   # Project knowledge base
  product/PRD.md       # Product requirements document
```
