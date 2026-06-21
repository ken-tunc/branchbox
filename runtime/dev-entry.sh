#!/bin/sh
# Runs inside the dev-runtime container. Prepares the toolchain + deps, then
# execs the dev command passed as arguments. The mounted product knows nothing
# about this.
set -e
cd /app

# Per-branch toolchain: if the worktree pins versions, install + activate them.
if command -v mise >/dev/null 2>&1 && { [ -f .tool-versions ] || [ -f .mise.toml ] || [ -f .nvmrc ]; }; then
  echo "[dev-entry] installing pinned toolchain via mise..."
  mise install || true
  eval "$(mise activate sh 2>/dev/null || true)"
fi

# Install node deps into the container's OWN node_modules volume (NOT the host's),
# so native modules are built for linux/arm64 here and never clash with the host.
# A marker file lets us re-install when package.json / the lockfile changes.
# (The volume is ext4, so node_modules always contains lost+found — don't treat
#  that as "already installed".)
if [ -f package.json ]; then
  if [ -f pnpm-lock.yaml ]; then PM=pnpm; LOCK=pnpm-lock.yaml
  elif [ -f yarn.lock ]; then PM=yarn; LOCK=yarn.lock
  else PM=npm; LOCK=package-lock.json; fi

  MARKER=node_modules/.branchbox-installed
  need=0
  if [ ! -f "$MARKER" ]; then need=1; fi
  if [ package.json -nt "$MARKER" ]; then need=1; fi
  if [ -f "$LOCK" ] && [ "$LOCK" -nt "$MARKER" ]; then need=1; fi

  if [ "$need" = 1 ]; then
    echo "[dev-entry] installing dependencies with $PM..."
    $PM install
    mkdir -p node_modules && touch "$MARKER"
  fi
fi

echo "[dev-entry] starting: $*"
exec "$@"
