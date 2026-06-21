FROM node:22-slim

# branchbox generic dev runtime. This image only provides the toolchain — the
# orchestration (dev-entry.sh) is bind-mounted in at run time, so a custom
# Dockerfile passed via `branchbox up --dockerfile` needs no branchbox-specific
# lines (no dev-entry, no ENTRYPOINT).
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates git jq python3 \
    && rm -rf /var/lib/apt/lists/*

# corepack gives us pnpm/yarn without a global install.
RUN corepack enable

# mise provides per-branch toolchains (reads .tool-versions / .mise.toml / .nvmrc).
RUN curl -fsSL https://mise.run | MISE_INSTALL_PATH=/usr/local/bin/mise sh

WORKDIR /app
