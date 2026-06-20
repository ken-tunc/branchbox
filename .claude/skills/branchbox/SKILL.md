---
name: branchbox
description: Deploy/manage a per-worktree local preview environment on apple/container, reachable at http://<branch-slug>.internal. Use when the user wants to spin up, view, list, or tear down a live preview for the current git worktree/branch.
---

# branchbox

Per-worktree local preview environments on [apple/container](https://github.com/apple/container).
Each git branch gets its own container with a dedicated IP, reachable at
`http://<branch-slug>.internal:<port>` — no port collisions across worktrees. The
target product needs no Dockerfile and no `container` config; its source is
bind-mounted into a generic runtime image and its dev command is auto-detected.

This skill is a thin wrapper around the `branchbox` CLI. It expects `branchbox`
on your PATH (e.g. `ln -s <repo>/branchbox /usr/local/bin/branchbox`); otherwise
run it as `<repo>/branchbox`.

## One-time setup (tell the user to run if missing)

```sh
sudo container system dns create internal           # *.internal resolution (admin)
# Containers register under the DEFAULT domain (config.toml [dns] domain), so set it:
mkdir -p ~/.config/container
printf '[dns]\ndomain = "internal"\n' >> ~/.config/container/config.toml
container system stop && container system start
container build -t branchbox-runtime runtime/       # generic runtime image
```

## Commands

Run from the worktree directory (or target one with `--dir DIR`):

- Deploy / redeploy this branch's preview: `branchbox up` (auto-detects the dev
  command) or `branchbox up <command...>` to run an explicit command.
- Print the URL: `branchbox url`
- List all previews + status: `branchbox list`
- Tear down this preview: `branchbox down`
- Reap previews whose worktree was deleted: `branchbox gc`

The directory is the `--dir` option; positional args are the dev command. For a
monorepo, give each preview a `--name LABEL` so one branch can host several
(`branchbox up --dir apps/web --name web pnpm --filter web dev` →
`http://<branch>-web.internal:<port>`). `down`/`url` take the same `--dir`/`--name`.

## Verifying a change (close the loop)

After deploying, fetch the preview to confirm the change renders, e.g.
`curl -s "$(branchbox url)"`. If `.internal` does not resolve, the DNS domain hasn't
been created yet (see setup) — fall back to the container IP from
`container ls --format json`.

## Knobs

`BRANCHBOX_PORT` (default 3000), `BRANCHBOX_CMD` (override auto-detection),
`BRANCHBOX_DOMAIN` (default `test`), `BRANCHBOX_PURGE=1` (also drop the
node_modules volume on `down`). See `README.md` for details and gotchas
(0.0.0.0 bind, file-watch polling, native-module isolation).
