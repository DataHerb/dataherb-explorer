// Copies DuckDB-WASM into site/vendor/duckdb so the explorer works without a CDN.
// Usage: npm ci && npm run vendor   (then set explorer.duckdb.mode: vendored)
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const dist = dirname(require.resolve('@duckdb/duckdb-wasm/dist/duckdb-browser.mjs'));
const out = join(root, 'site', 'vendor', 'duckdb');
mkdirSync(out, { recursive: true });

// The ESM entry imports apache-arrow; bundle it into one self-contained file.
await build({
  entryPoints: [join(dist, 'duckdb-browser.mjs')],
  bundle: true,
  format: 'esm',
  minify: true,
  outfile: join(out, 'duckdb-browser.mjs'),
  logLevel: 'warning',
});

for (const f of ['duckdb-mvp.wasm', 'duckdb-eh.wasm', 'duckdb-browser-mvp.worker.js', 'duckdb-browser-eh.worker.js']) {
  copyFileSync(join(dist, f), join(out, f));
}
console.log(`DuckDB-WASM vendored into ${out}`);
