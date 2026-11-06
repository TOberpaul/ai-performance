import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));
await build({
  entryPoints: [path('../site-src/site.jsx')],
  outfile: path('../site/assets/site.js'),
  alias: { '@': path('..') },
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
});
