# branchbox

Spin up an **isolated preview environment per git worktree (branch)**, each on
its own branch-named domain, using [apple/container](https://github.com/apple/container).
When you develop branches in parallel (e.g. with `claude --worktree`), you can
bring up every branch's app at once and compare them side by side.

```
feat-login   -> http://feat-login.internal:3000
fix-cart     -> http://fix-cart.internal:3000    # same 3000, no collision (each container has its own IP)
```

## Why branchbox

- **Branch name = domain.** Using apple/container's local DNS (`*.internal`) and
  per-container IPs, each preview is reachable at `http://<branch-slug>.internal:<port>`
  with no port publishing (`-p`) and no port collisions. (`.internal` is the TLD
  ICANN reserved for internal use — safe. `.dev`/`.app` are real gTLDs that force
  HTTPS via HSTS, and `.local` collides with mDNS, so both are avoided.)
- **Non-invasive to the product.** The target repo needs **no `Dockerfile` and no
  mention of `container`**. Its source is bind-mounted into a generic runtime
  image and its dev command is auto-detected.
- **Independent of whether the product uses Docker.** Containerized or not, it works.
- **Hot reload.** Polling-based file-watch env vars are injected, and `node_modules`
  is kept in a **container-only volume** so native modules built for the container
  (linux) never clash with the host (macOS).

## Requirements

- macOS 26 (Tahoe) or later + [apple/container](https://github.com/apple/container)
  (for per-container IPs and local DNS).

## Setup (once)

```sh
# 1) Register the local DNS domain (*.internal) on the host (admin).
#    This points *.internal at apple/container's DNS via /etc/resolver.
sudo container system dns create internal

# 2) Make `internal` the container DEFAULT domain.
#    Containers register under this default domain as <name>.<domain> — NOT via
#    the --dns-domain flag. A service restart is required after setting it.
mkdir -p ~/.config/container
printf '[dns]\ndomain = "internal"\n' >> ~/.config/container/config.toml
container system stop && container system start

# 3) Put branchbox on your PATH (optional).
ln -s "$PWD/branchbox" /usr/local/bin/branchbox
```

> The generic runtime image is built automatically on first use. To build it
> ahead of time: `container build -t branchbox-runtime runtime/`.

> branchbox derives the domain in the URLs it prints from the config.toml default
> domain when possible (override with `BRANCHBOX_DOMAIN`). It matches what you set
> in step 2, so `http://<branch-slug>.internal:<port>` resolves directly in the browser.

## Usage

From a worktree directory:

```sh
branchbox up                 # deploy this branch's preview (auto-detect the dev command)
branchbox up pnpm dev        # ...or pass the dev command explicitly
branchbox url                # print the preview URL
branchbox list               # list all previews and their status
branchbox down               # stop/remove this preview
branchbox gc                 # reap previews whose worktree was deleted
```

The directory is an option (`--dir`, default cwd); the positional arguments are
the **dev command** to run. If you omit the command, branchbox auto-detects it
(see below).

### Monorepos: several previews per branch

Use `--name LABEL` to add a `-LABEL` suffix to the slug so one branch can host
multiple previews side by side:

```sh
branchbox up --dir apps/web --name web pnpm --filter web dev   # -> http://<branch>-web.internal:3000
branchbox up --dir apps/api --name api pnpm --filter api dev   # -> http://<branch>-api.internal:3000
```

`down`/`url` take the same `--dir`/`--name` (or a slug directly):

```sh
branchbox url  --name web
branchbox down --name api
branchbox down <branch>-web        # or target by slug
```

Options: `--dir DIR`, `--name LABEL`, `--port PORT`, `--dockerfile FILE`, `--context DIR`.

### Custom runtime (extra system deps)

If the generic runtime is missing something your app needs (system libraries, a
specific interpreter, build tools…), point `--dockerfile` at your own Dockerfile.
branchbox builds it (tagged by content, so an unchanged file is a cache hit) and
runs the preview in it. The orchestration (`dev-entry.sh`) is bind-mounted in at
run time, so **your Dockerfile needs no branchbox-specific lines** — just the
toolchain:

```dockerfile
# Dockerfile.preview
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      imagemagick libvips-dev
```

```sh
branchbox up --dockerfile ./Dockerfile.preview pnpm dev
```

`--context` sets the build context (default: the Dockerfile's directory). Source
mount, dependency install, and hot reload all work the same as with the default
runtime. (`BRANCHBOX_IMAGE=<name>` can point at a prebuilt image instead.)

## Use as a Claude Code skill

This repo ships a `/branchbox` skill at `.claude/skills/branchbox/`. To make it
available in Claude Code globally, symlink it into your user skills directory
(the `branchbox` CLI must also be on your PATH — see step 3 of Setup):

```sh
mkdir -p ~/.claude/skills
ln -s "$PWD/.claude/skills/branchbox" ~/.claude/skills/branchbox
```

Claude Code can then run `branchbox up`/`down`/`url`/`list`/`gc` for the current
worktree on your behalf. (The symlink points back into this repo, so it stays in
sync as the skill is updated.)

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `BRANCHBOX_DOMAIN` | container default domain, else `internal` | Local DNS domain |
| `BRANCHBOX_PORT` | `3000` | Dev server port (used in the URL and as `PORT`) |
| `BRANCHBOX_CMD` | (auto-detected) | Override the dev command |
| `BRANCHBOX_IMAGE` | `branchbox-runtime` | Runtime image to use |
| `BRANCHBOX_PURGE` | `0` | Also delete the node_modules volume on `down` |

## Dev command auto-detection

Used only when you don't pass a command to `up`:

1. `BRANCHBOX_CMD` if set.
2. `package.json` `scripts.dev` → `scripts.start` (package manager inferred from
   the lockfile: pnpm/yarn/npm).
3. `manage.py` (Django) / `bin/rails` (Rails).

## Gotchas (apple/container specific)

- **The dev server must bind `0.0.0.0`.** Binding `127.0.0.1` is unreachable via
  the container IP. `HOST=0.0.0.0` is injected, but some tools (e.g. Vite) need
  `--host` in their dev script.
- **File watching.** Host file-change events may not reach watchers inside the VM,
  so polling (`CHOKIDAR_USEPOLLING`, etc.) is enabled.
- **Native modules.** Sharing the host's `node_modules` breaks on ABI mismatch, so
  it lives in a container-only volume (deps are installed inside on first run).

## Layout

```
branchbox                       # the CLI
runtime/Dockerfile              # generic runtime image (toolchain only)
runtime/dev-entry.sh            # bind-mounted into the container at run time: prepares toolchain/deps, then starts dev
.claude/skills/branchbox/       # /branchbox skill for Claude Code
examples/hello-web/             # tiny Express app to try branchbox against
```
