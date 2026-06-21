# hello-web — branchbox example

A minimal Express app for trying branchbox.

- `GET /` … a single page showing the branch name (= the container hostname) and a greeting
- `GET /api/info` … JSON API returning `{ greeting, branch, time }`
- the page polls `/api/info` every 2s, so **hot reload is visible in the browser**

> This app contains no `Dockerfile` and no mention of `container`.
> branchbox bind-mounts the source and detects `npm run dev` (= `nodemon server.js`) to run it.

## Preview it with branchbox

```sh
# Preview this directory itself (named after the repo's current branch)
branchbox up  --dir examples/hello-web
branchbox url --dir examples/hello-web      # e.g. http://main.internal:3000
```

To try a preview per branch, make the sample its own repo and add a worktree:

```sh
cp -r examples/hello-web /tmp/hello-web && cd /tmp/hello-web
git init -q && git add -A && git commit -qm init
git worktree add ../hello-web-feat -b feat-hero
branchbox up --dir /tmp/hello-web        # -> http://main.internal:3000 (or the current branch)
branchbox up --dir /tmp/hello-web-feat   # -> http://feat-hero.internal:3000
```

## Check hot reload

Edit `GREETING` in `server.js` and save: nodemon restarts the server and the open
page updates automatically (via polling).
