const express = require('express');
const os = require('os');

const app = express();
const port = process.env.PORT || 3000;

// 👇 Edit this line and save: nodemon restarts and the page (which polls every
//    2s) reflects the change live — that's branchbox hot reload in action.
const GREETING = 'Hello from branchbox 👋';

app.get('/api/info', (_req, res) => {
  res.json({
    greeting: GREETING,
    branch: os.hostname(), // container hostname == branch slug
    time: new Date().toISOString(),
  });
});

app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>branchbox sample</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: system-ui, -apple-system, sans-serif; display: grid;
           place-items: center; min-height: 100vh; margin: 0; background: #0b1020; color: #e7ecff; }
    .card { padding: 2.5rem 3rem; border-radius: 16px; background: #161d3a;
            box-shadow: 0 10px 40px rgba(0,0,0,.4); text-align: center; }
    h1 { margin: 0 0 .25rem; font-size: 1.6rem; }
    .branch { display: inline-block; margin-top: .75rem; padding: .25rem .8rem;
              border-radius: 999px; background: #2b3a7a; font-family: ui-monospace, monospace; }
    .time { margin-top: 1rem; opacity: .55; font-size: .85rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1 id="greeting">…</h1>
    <div>branch preview: <span class="branch" id="branch">…</span></div>
    <div class="time" id="time"></div>
  </div>
  <script>
    async function refresh() {
      try {
        const d = await (await fetch('/api/info')).json();
        greeting.textContent = d.greeting;
        branch.textContent = d.branch;
        time.textContent = d.time;
      } catch (e) { /* server restarting (nodemon) — retry next tick */ }
    }
    refresh();
    setInterval(refresh, 2000);
  </script>
</body>
</html>`);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`hello-web listening on 0.0.0.0:${port}`);
});
