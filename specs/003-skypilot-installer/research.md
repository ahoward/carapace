# Research: SkyPilot Automatic Installer

**Feature**: 003-skypilot-installer
**Date**: 2026-02-14

## 1. uv Package Manager — Binary Distribution

**Decision**: Use astral-sh/uv standalone binary downloads from GitHub Releases.

**Rationale**: uv is a Rust-based Python package manager (~53MB installed) that can download its own Python runtime and install packages into isolated environments. No system Python required. Single binary, cross-platform, fast.

**Download URLs** (verified):

| Platform | Target Triple | URL |
|----------|---------------|-----|
| macOS arm64 | `aarch64-apple-darwin` | `https://github.com/astral-sh/uv/releases/latest/download/uv-aarch64-apple-darwin.tar.gz` |
| macOS x86_64 | `x86_64-apple-darwin` | `https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-apple-darwin.tar.gz` |
| Linux x86_64 | `x86_64-unknown-linux-gnu` | `https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-unknown-linux-gnu.tar.gz` |

**Tarball structure**: Files are inside a subdirectory named after the target triple. Extraction requires `--strip-components=1`:

```
uv-x86_64-unknown-linux-gnu/
  uv      (53 MB)
  uvx     (337 KB)
```

**Current version**: v0.10.2 (as of 2026-02-10). Using `/latest/` URL for auto-updates.

**Alternatives considered**:
- `pip install uv` — requires Python, defeats the purpose
- `curl -LsSf https://astral.sh/uv/install.sh | sh` — installs to user-global location, not app-managed
- Ship uv binary in repo — bloats repository, hard to update

## 2. uv Environment Variables

**Decision**: Use `UV_TOOL_BIN_DIR`, `UV_TOOL_DIR`, and `UV_PYTHON_INSTALL_DIR` to confine all installations to `~/.carapace/`.

| Variable | Purpose | Value |
|----------|---------|-------|
| `UV_TOOL_BIN_DIR` | Where tool binaries/symlinks go | `~/.carapace/tools/bin` |
| `UV_TOOL_DIR` | Where tool venvs are stored | `~/.carapace/tools/environments` |
| `UV_PYTHON_INSTALL_DIR` | Where managed Python is downloaded | `~/.carapace/python` |

**Rationale**: Confining to `~/.carapace/` prevents pollution of system directories, makes uninstall trivial (`rm -rf ~/.carapace/`), and provides predictable paths for binary resolution.

**Defaults avoided**: uv's defaults (`~/.local/bin`, `~/.local/share/uv/`) would conflict with other Python tools the user may have installed.

## 3. `uv tool install` Behavior

**Decision**: Use `uv tool install "skypilot-nightly[aws]"` for SkyPilot installation.

**What it does**:
1. Downloads Python 3.12 to `UV_PYTHON_INSTALL_DIR` (if no Python available)
2. Creates isolated venv at `UV_TOOL_DIR/skypilot-nightly/`
3. Installs skypilot-nightly + 105 transitive dependencies
4. Creates symlink at `UV_TOOL_BIN_DIR/sky` → venv's `bin/sky`

**Shim behavior**: The `sky` binary at `UV_TOOL_BIN_DIR` is a symlink to the venv's entry-point script. The entry-point script has a shebang (`#!/path/to/venv/bin/python`) that hardcodes the absolute path to the venv's Python. **No environment variables needed at runtime** — the shebang handles everything.

**Rationale**: `skypilot-nightly[aws]` is the recommended package for SkyPilot with AWS support (matches the existing error message pattern). The `[aws]` extra pulls in boto3/botocore for AWS cloud provider support.

**Alternatives considered**:
- `skypilot[aws]` (stable) — nightly has latest fixes, project was already using nightly package name
- `pip install` directly — requires managing venvs manually, uv handles this
- `pipx install` — another tool to install; uv is simpler and handles Python download

## 4. Size Estimates

| Component | Download | Installed |
|-----------|----------|-----------|
| uv binary (compressed) | 22 MB | 53 MB |
| Python 3.12 (managed) | 32 MB | 102 MB |
| skypilot-nightly[aws] + deps | ~90 MB | 375 MB |
| **Total** | **~144 MB** | **~530 MB** |

**Installation time**: ~30-90 seconds on broadband (25 Mbps+). Dominated by Python download and pip-style package installation.

**Rationale**: 530 MB on disk is acceptable for a desktop development tool. The alternative (requiring users to install Python + pip + skypilot manually) has far worse UX cost.

## 5. Platform Detection

**Decision**: Map `process.platform` + `process.arch` to uv target triples.

| Node/Bun | uv Triple |
|----------|-----------|
| `darwin` + `arm64` | `aarch64-apple-darwin` |
| `darwin` + `x64` | `x86_64-apple-darwin` |
| `linux` + `x64` | `x86_64-unknown-linux-gnu` |

For bash (`bin/setup`): `uname -m` gives `arm64`→`aarch64` or `x86_64`, `uname` gives `Darwin` or `Linux`.

## 6. Concurrency Control

**Decision**: Promise-based mutex in the TypeScript installer.

**Rationale**: Multiple HTTP requests can hit `ensure_skypilot()` simultaneously (e.g., user clicks Launch twice, or Launch + Check arrive at the same time). Without a mutex, two concurrent installs would corrupt each other. A module-level `Promise | null` variable acts as a lock: if non-null, subsequent callers await the existing promise.

**Alternatives considered**:
- File-based lock (`~/.carapace/.install-lock`) — more complex, must handle stale locks
- OS-level flock — not portable across macOS/Linux/Bun
- No guard — race condition, files corrupted

## 7. Integration with Existing Code

**Decision**: Modify `sky_binary()` to check `~/.carapace/tools/bin/sky` first, fall back to `Bun.which("sky")`.

**Rationale**: This preserves backward compatibility (users who installed sky globally still work) while preferring the app-managed installation. The resolution order is: managed → system PATH.

**Handler changes**: `handle_cluster_launch` and `handle_cluster_check` gain auto-install flow. When `sky_binary()` returns null, they call `ensure_skypilot()` with progress callbacks wired to `broadcast_event()`. Status refresh handlers do NOT auto-install (passive polling should not trigger downloads).

## 8. bin/setup Steel Thread Parity

**Decision**: `bin/setup` uses the same paths and `uv tool install` command as the TypeScript installer — parallel bash implementation.

**Rationale**: True steel thread means identical paths (`~/.carapace/uv/bin/uv`, `~/.carapace/tools/bin/sky`) and identical env vars (`UV_TOOL_BIN_DIR`, `UV_TOOL_DIR`). The bash implementation follows the same `ensure_X()` pattern as `ensure_bun()` and `ensure_rust()`. It's idempotent: if already installed, prints version and returns.

**Alternative rejected**: Having `bin/setup` call the gatekeeper's HTTP endpoint — fragile, requires gatekeeper to boot cleanly just to install a dependency.

## Sources

- [uv Installation docs](https://docs.astral.sh/uv/getting-started/installation/)
- [uv Environment Variables](https://docs.astral.sh/uv/reference/environment/)
- [uv Storage](https://docs.astral.sh/uv/reference/storage/)
- [uv Tools Concepts](https://docs.astral.sh/uv/concepts/tools/)
- [uv GitHub Releases](https://github.com/astral-sh/uv/releases)
- [skypilot-nightly on PyPI](https://pypi.org/project/skypilot-nightly/)
