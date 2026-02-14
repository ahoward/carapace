```
      ___  ___  ___  ___  ___  ___  ___  ___
     /   \/   \/   \/   \/   \/   \/   \/   \
    | C  | A  | R  | A  | P  | A  | C  | E  |
     \___/\___/\___/\___/\___/\___/\___/\___/
      /     \___________/     \___________/
     /  YOUR DATA STAYS  \   INSIDE THE   /
    /   IN THE SHELL.     \ SHELL.        /
    \_____________________/\_____________/
```

> **Your AI. Your data. Your shell.**

# Carapace

A zero-config desktop app that deploys [OpenClaw](https://github.com/openclaw) on your own private cloud — with a kill switch between your brain and theirs.

```
  ┌─ YOU ──────────────────────────────────────────────────┐
  │                                                        │
  │  ~/OpenClaw/Private/   ← YOUR source of truth          │
  │  ~/OpenClaw/Public/    ← safe to share                 │
  │                                                        │
  │  [Carapace Desktop]                                    │
  │     ├── Launch Server    ← one click                   │
  │     ├── Privacy Toggle   ← LOCAL / CLOUD               │
  │     └── Destroy Server   ← nuke from orbit             │
  │                                                        │
  └──────────────┬─────────────────────────────────────────┘
                 │ Tailscale (encrypted mesh, no open ports)
  ┌──────────────▼─────────────────────────────────────────┐
  │  YOUR VPS (ephemeral compute — destroy anytime)        │
  │                                                        │
  │  ┌──────────────────────────────────────────────┐      │
  │  │ GATEKEEPER (FastAPI)                         │      │
  │  │                                              │      │
  │  │  LOCAL MODE:  /private ✅  /public ✅         │      │
  │  │  CLOUD MODE:  /private 🚫  /public ✅         │      │
  │  │                                              │      │
  │  │  crash = fail secure (private locked)        │      │
  │  └──────────────┬───────────────────────────────┘      │
  │                 │                                      │
  │  ┌──────────────▼──────┐  ┌────────────────────┐      │
  │  │ OpenClaw Agent      │  │ Ollama             │      │
  │  │ (no volume mounts)  │  │ (local inference)  │      │
  │  │ (reads via API only)│  │ (your models)      │      │
  │  └─────────────────────┘  └────────────────────┘      │
  │                                                        │
  └────────────────────────────────────────────────────────┘
```

## The Problem

You want to use AI agents on your private data. But:

- **Cloud AI** (Claude, GPT) = smart but sees everything you send it
- **Local AI** (Ollama, llama.cpp) = private but dumber
- **Self-hosting** = powerful but requires a DevOps degree

Pick two? No. Pick all three.

## The Solution

Carapace gives you a **privacy toggle**:

```
  [ LOCAL MODE ]     Your data + local model.
                       Full access. Full privacy.
                       Ollama on your VPS. Nothing leaves.

  [ CLOUD MODE ]     Your data is LOCKED.
                       Cloud model sees public data only.
                       The Gatekeeper blocks everything else.
                       At the API level. Not a pinky promise.
```

One click to launch. One click to switch. One click to destroy.

Your laptop is the source of truth. The VPS is disposable compute. Nuke it whenever you want — your data stays home.

## How It Works

1. **You enter cloud credentials** (AWS, GCP, DigitalOcean, whatever SkyPilot supports)
2. **You click "Launch Server"** — SkyPilot provisions a VPS, installs Docker, joins your Tailscale mesh
3. **OpenClaw + Ollama + Gatekeeper** start in containers on the VPS
4. **You toggle Local/Cloud** — the Gatekeeper enforces data boundaries in real-time
5. **You click "Destroy Server"** — VPS is gone. Your data isn't.

## Security Model

| Threat | What Happens |
|--------|-------------|
| **Agent tries to read private files in Cloud mode** | Gatekeeper returns `403 ACCESS_DENIED`. Logged as security alert. |
| **Gatekeeper crashes** | Defaults to LOCAL mode on boot. Private data locked until explicitly unlocked. |
| **VPS compromised** | No public ports. All traffic tunneled through Tailscale. Attacker can't reach it. |
| **Agent jailbreak** | Agent container has zero volume mounts. It physically cannot read the disk. Must go through Gatekeeper API. |
| **You destroy the VPS** | Your data is on your laptop. VPS was just borrowing it. |

## Tech Stack

| Layer | Tech | Why |
|-------|------|-----|
| Desktop | **Tauri 2.x** + React + TypeScript | Native performance, tiny bundle, not Electron |
| Gatekeeper | **Python/FastAPI** | The security boundary. Testable standalone. |
| Infrastructure | **SkyPilot** | One API for every cloud. You pick the provider. |
| Networking | **Tailscale** | Encrypted mesh. Zero config. No open ports. |
| VPS Runtime | **Docker Compose** | OpenClaw + Ollama + Gatekeeper in containers |
| Local AI | **Ollama** | Ships with a default model. Swap in whatever you want. |

## Project Status

**Phase 0 — Foundation.** See [`dna/product/ROADMAP.md`](dna/product/ROADMAP.md) for the full plan.

```
  Phase 0  ███░░░░░░░░░░░░░░░░░  Foundation
  Phase 1  ░░░░░░░░░░░░░░░░░░░░  Vertical Slice (MVP)
  Phase 2  ░░░░░░░░░░░░░░░░░░░░  Data Sovereignty
  Phase 3  ░░░░░░░░░░░░░░░░░░░░  Hardening & UX
  Phase 4  ░░░░░░░░░░░░░░░░░░░░  Polish & Distribution
```

## Project Structure

```
dna/
  product/
    PRD.md                  # Product requirements
    ROADMAP.md              # Phased development plan
.specify/                   # Spec-kit templates and scripts
  memory/
    constitution.md         # Project principles (v1.0.0)
.claude/
  commands/speckit.*.md     # Spec-driven dev workflow
```

## Philosophy

> The cloud is someone else's computer.
> Your data should never be on someone else's computer.
> Unless you put it there. And you can take it back. Instantly.

Carapace doesn't trust the cloud. It *uses* the cloud — for compute, for smart models, for scale — but it never *trusts* it with your private data. The Gatekeeper isn't a policy. It's a wall.

## License

TBD
