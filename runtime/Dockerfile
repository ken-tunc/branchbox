FROM node:22-slim

# branchbox generic dev runtime. The target product needs NO Dockerfile of its
# own — its source is bind-mounted at /app and its dev command is run here.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates git jq python3 \
    && rm -rf /var/lib/apt/lists/*

# corepack gives us pnpm/yarn without a global install.
RUN corepack enable

# mise provides per-branch toolchains (reads .tool-versions / .mise.toml / .nvmrc).
RUN curl -fsSL https://mise.run | MISE_INSTALL_PATH=/usr/local/bin/mise sh

COPY dev-entry.sh /usr/local/bin/dev-entry.sh
RUN chmod +x /usr/local/bin/dev-entry.sh

WORKDIR /app
ENTRYPOINT ["/usr/local/bin/dev-entry.sh"]
