import { context } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwind from 'tailwindcss';

const app = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const project = resolve(args.find((arg) => arg !== '--codex-history') ?? process.env.INIT_CWD ?? process.cwd());
const history = args.includes('--codex-history')
  ? join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'sessions') : undefined;
let assets, assetRevision, dataRevision, readAnalytics;
const revision = () => JSON.stringify([assetRevision, dataRevision]);
const dataBuild = await context({
  entryPoints: [join(app, 'data.mjs')], bundle: true, write: false,
  platform: 'node', format: 'esm',
  plugins: [{
    name: 'analytics-data-live-reload',
    setup(builder) {
      builder.onEnd(async ({ errors, outputFiles }) => {
        if (errors.length) return;
        const [output] = outputFiles;
        if (output.hash === dataRevision) return;
        try {
          const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(output.contents).toString('base64');
          const next = await import(moduleUrl);
          if (typeof next.readAnalytics !== 'function') throw new Error('Missing readAnalytics export.');
          readAnalytics = next.readAnalytics;
          dataRevision = output.hash;
        } catch (error) {
          return { errors: [{ text: error.message }] };
        }
      });
    },
  }],
});
const build = await context({
  entryPoints: [join(app, 'app.jsx'), join(app, 'styles.css')],
  outdir: join(app, 'build'), bundle: true, write: false, jsx: 'automatic',
  alias: { '@': app }, define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{
    name: 'analytics-live-reload',
    setup(builder) {
      builder.onLoad({ filter: /styles\.css$/ }, async ({ path }) => {
        const source = await readFile(path, 'utf8');
        const { css } = await postcss([tailwind()]).process(source, { from: path });
        return { contents: css, loader: 'css', watchFiles: [path, join(app, 'tailwind.config.cjs')] };
      });
      builder.onEnd(({ errors, outputFiles }) => {
        if (errors.length) return;
        const script = outputFiles.find((file) => file.path.endsWith('app.js'));
        const css = outputFiles.find((file) => file.path.endsWith('styles.css'));
        assetRevision = JSON.stringify([script.hash, css.hash]);
        assets = new Map([
          ['/styles.css', ['text/css', css.contents]],
          ['/app.js', ['text/javascript', script.contents]],
        ]);
      });
    },
  }],
});
await Promise.all([build.rebuild(), dataBuild.rebuild()]);
await Promise.all([build.watch(), dataBuild.watch()]);

function dashboardHtml() {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AI Analytics</title><link rel="stylesheet" href="/styles.css"><div id="root"></div><script defer src="/app.js"></script>
  <script>
    const revision = ${JSON.stringify(revision())};
    async function checkForUpdate() {
      try {
        const response = await fetch('/__version');
        if (response.ok && (await response.text()) !== revision) {
          location.reload();
          return;
        }
      } catch {}
      setTimeout(checkForUpdate, 1000);
    }
    setTimeout(checkForUpdate, 1000);
  </script></html>`;
}

const server = createServer(async (request, response) => {
  const address = server.address();
  if (request.method !== 'GET' || request.headers.host !== `127.0.0.1:${address.port}`) {
    response.writeHead(403).end();
    return;
  }
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.url === '/') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(dashboardHtml());
    return;
  }
  if (request.url === '/__version') {
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.end(revision());
    return;
  }
  if (request.url.split('?')[0] === '/api/analytics') {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      response.end(JSON.stringify(await readAnalytics(project, url.searchParams.get('epic'), history)));
    } catch (error) {
      response.statusCode = 500;
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  const asset = assets.get(request.url);
  if (!asset) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader('Content-Type', `${asset[0]}; charset=utf-8`);
  response.end(asset[1]);
});

server.listen(Number(process.env.PORT ?? 0), '127.0.0.1', () => {
  console.log(`AI Analytics · http://127.0.0.1:${server.address().port}\nProject · ${project}`);
});
