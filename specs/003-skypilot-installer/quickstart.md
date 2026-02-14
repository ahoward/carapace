# Quickstart: SkyPilot Automatic Installer

**Feature**: 003-skypilot-installer
**Date**: 2026-02-14

## Prerequisites

- macOS (arm64 or x86_64) or Linux (x86_64)
- Internet connection (for first-time download)
- Bun installed (via `script/setup`)
- ~200MB free disk space

## Scenario 1: First-Time User — Auto-Install on Launch

1. Ensure `~/.carapace/` does not exist: `rm -rf ~/.carapace`
2. Start gatekeeper: `bun run gatekeeper/src/index.ts`
3. Open the app or use curl:
   ```bash
   curl -X POST http://localhost:3001/cluster/launch -H "Content-Type: application/json" -d '{}'
   ```
4. Observe SSE events:
   ```bash
   curl -N http://localhost:3001/cluster/events
   ```
5. **Expected**: Progress events stream ("Downloading uv...", "Installing SkyPilot..."), then either launch proceeds (with credentials) or 424 error (no credentials).
6. **Verify**: `~/.carapace/tools/bin/sky` exists and is executable.

## Scenario 2: Developer Setup

1. Ensure `~/.carapace/` does not exist: `rm -rf ~/.carapace`
2. Run: `./script/setup`
3. **Expected**: Output includes uv and skypilot installation lines:
   ```
   ==> checking prerequisites
     xcode-cli    /Library/Developer/CommandLineTools
     bun          /Users/user/.bun/bin/bun
     rustc        /Users/user/.cargo/bin/rustc
     cargo        /Users/user/.cargo/bin/cargo
     uv           /Users/user/.carapace/uv/bin/uv
     skypilot     /Users/user/.carapace/tools/bin/sky
   ```
4. **Verify**: `~/.carapace/uv/bin/uv --version` returns a version string.
5. **Verify**: `~/.carapace/tools/bin/sky --help` shows SkyPilot help.

## Scenario 3: Idempotent Re-Install

1. Run `./script/setup` (installs uv + skypilot)
2. Run `./script/setup` again
3. **Expected**: uv and skypilot steps complete instantly (already installed)
4. Start gatekeeper, trigger launch
5. **Expected**: No installation phase — proceeds directly to credential check

## Scenario 4: Check Installation Status

1. With gatekeeper running:
   ```bash
   curl http://localhost:3001/cluster/install-status
   ```
2. **Expected** (when installed):
   ```json
   {
     "status": "success",
     "result": {
       "uv_installed": true,
       "uv_version": "0.10.2",
       "sky_installed": true,
       "sky_version": null,
       "carapace_home": "/home/user/.carapace"
     }
   }
   ```
3. **Expected** (when not installed):
   ```json
   {
     "status": "success",
     "result": {
       "uv_installed": false,
       "uv_version": null,
       "sky_installed": false,
       "sky_version": null,
       "carapace_home": "/home/user/.carapace"
     }
   }
   ```

## Scenario 5: Explicit Install Trigger

1. With gatekeeper running and no SkyPilot installed:
   ```bash
   curl -X POST http://localhost:3001/cluster/ensure-skypilot
   ```
2. **Expected**: Returns 202 with "installation started" message
3. Monitor SSE events in another terminal:
   ```bash
   curl -N http://localhost:3001/cluster/events
   ```
4. **Expected**: Progress events for download + install + verify phases
5. Call install-status after completion:
   ```bash
   curl http://localhost:3001/cluster/install-status
   ```
6. **Expected**: Both `uv_installed` and `sky_installed` are `true`

## Scenario 6: Global SkyPilot Fallback

1. Install SkyPilot globally: `pip install skypilot-nightly[aws]`
2. Ensure `~/.carapace/` does not exist: `rm -rf ~/.carapace`
3. Start gatekeeper, trigger cloud check:
   ```bash
   curl http://localhost:3001/cluster/check
   ```
4. **Expected**: `sky_installed: true` — detects global installation via PATH
5. **Note**: Auto-install is not triggered when global sky is available

## Scenario 7: Network Failure During Install

1. Ensure `~/.carapace/` does not exist
2. Block network access (disable wifi, iptables rule, etc.)
3. Trigger install:
   ```bash
   curl -X POST http://localhost:3001/cluster/ensure-skypilot
   ```
4. **Expected**: Error response with network-related message
5. Re-enable network, retry
6. **Expected**: Installation succeeds on retry

## QA Verification Checklist

- [ ] Auto-install on first `POST /cluster/launch` (clean machine)
- [ ] Auto-install on first `GET /cluster/check` (clean machine)
- [ ] Idempotent: second run completes in <2 seconds
- [ ] `GET /cluster/install-status` reports correct state
- [ ] `POST /cluster/ensure-skypilot` works as explicit trigger
- [ ] SSE events stream during installation
- [ ] `script/setup` installs uv + skypilot
- [ ] Global `sky` in PATH is detected as fallback
- [ ] Error message is clear when network fails
- [ ] Works on macOS arm64
- [ ] Works on Linux x86_64
