# Quickstart: SkyPilot Provisioning

**Feature**: 002-skypilot-provisioning
**Date**: 2026-02-14

## Prerequisites

1. SkyPilot installed: `pip install skypilot[aws]` (or gcp, azure, etc.)
2. Cloud credentials configured: `sky check` shows at least one enabled cloud
3. Carapace built and running: `bin/try` or `bin/dev --browser`

## Scenario 1: Launch a Server

1. Open the Carapace app in browser (localhost:1420)
2. Click "Launch Server"
3. Observe status transitions: `no_server` → `provisioning` → `running`
4. Observe progress streaming in the debug panel
5. After ~5-10 minutes, status shows "running" with IP address

**What to verify:**
- Status badge shows green "running"
- IP address is displayed
- Progress events appeared in debug/op log
- Files are still listed (gatekeeper still works)

## Scenario 2: Monitor Status

1. With a running server, observe the status polling
2. Status should update at least every 30 seconds
3. Check that status badge reflects actual cloud state

**What to verify:**
- Status badge accurately reflects cloud state
- No stale status (matches `sky status` output in terminal)

## Scenario 3: Stop Server

1. With a running server, click "Stop Server"
2. Observe status transition: `running` → `stopping` → `stopped`
3. Within 2 minutes, status should show "stopped"

**What to verify:**
- Status shows "stopped" (not "running" or "error")
- "Launch Server" button is disabled (server exists in stopped state)
- "Destroy Server" button is enabled

## Scenario 4: Destroy Server

1. With a stopped (or running) server, click "Destroy Server"
2. Observe status transition: `stopped` → `destroying` → `no_server`
3. Within 3 minutes, status should show "no_server"

**What to verify:**
- Status shows "no_server"
- "Launch Server" button is re-enabled
- `sky status` in terminal shows no clusters

## Scenario 5: Vault File Mounts

1. Add a test file to `data/public/test.txt`
2. Launch a server
3. After provisioning, SSH into the VPS: `ssh carapace-node`
4. Verify: `cat /opt/carapace/data/public/test.txt` shows your file
5. Verify: `ls /opt/carapace/data/private/` shows private vault contents

**What to verify:**
- Public vault files present on VPS at expected paths
- Private vault files present on VPS at expected paths

## Scenario 6: Error Cases

### Missing SkyPilot
1. Ensure `sky` is not in PATH
2. Click "Launch Server"
3. Should show error: "SkyPilot not installed" with installation instructions

### Missing Credentials
1. Remove cloud credentials (e.g., `mv ~/.aws ~/.aws.bak`)
2. Click "Launch Server"
3. Should show error about missing credentials

### Duplicate Launch Prevention
1. Launch a server (wait for provisioning or running)
2. Try to click "Launch Server" again
3. Button should be disabled / action should be prevented

## QA Playbook Integration

When this feature is implemented, the `src/lib/playbook.ts` MUST be updated with new QA steps covering:
- Launch server and verify running
- Check status polling accuracy
- Stop and verify stopped
- Destroy and verify no_server
- Error case: missing SkyPilot
