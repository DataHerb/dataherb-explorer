// DuckDB-WASM wrapper. Loaded lazily the first time anything is queried.

import { absUrl, sqlIdent, sqlString } from './util.js';

let dbPromise = null;
let conn = null;
const views = new Map(); // view name -> { dataset, resource, url }

export const SUPPORTED_FORMATS = ['csv', 'tsv', 'parquet', 'json', 'ndjson', 'geojson'];

export function canQuery(resource) {
  return Boolean(resource?.url) && SUPPORTED_FORMATS.includes(resource.format);
}

function bundles(cfg) {
  const d = cfg.explorer?.duckdb || {};
  if (d.mode === 'vendored') {
    const base = absUrl('vendor/duckdb/');
    return {
      module: `${base}duckdb-browser.mjs`,
      base,
    };
  }
  const cdn = (d.cdn_base || 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@{version}').replace('{version}', d.version || '1.29.0');
  return { module: `${cdn}/+esm`, base: `${cdn}/dist/` };
}

export function init(cfg) {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const { module, base } = bundles(cfg);
    const duckdb = await import(/* @vite-ignore */ module);
    const bundle = await duckdb.selectBundle({
      mvp: { mainModule: `${base}duckdb-mvp.wasm`, mainWorker: `${base}duckdb-browser-mvp.worker.js` },
      eh: { mainModule: `${base}duckdb-eh.wasm`, mainWorker: `${base}duckdb-browser-eh.worker.js` },
    });
    // Workers must be same-origin; wrap the (possibly CDN) script in a blob.
    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts(${JSON.stringify(bundle.mainWorker)});`], { type: 'text/javascript' }),
    );
    const worker = new Worker(workerUrl);
    const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(workerUrl);
    conn = await db.connect();
    return db;
  })();
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

export function reader(format, url) {
  const u = sqlString(absUrl(url));
  switch (format) {
    case 'parquet':
      return `read_parquet(${u})`;
    case 'json':
    case 'geojson':
      return `read_json_auto(${u})`;
    case 'ndjson':
      return `read_json_auto(${u}, format='newline_delimited')`;
    case 'tsv':
      return `read_csv_auto(${u}, delim='\t', sample_size=-1)`;
    default:
      return `read_csv_auto(${u}, sample_size=-1)`;
  }
}

/** A safe, readable view name for a resource, unique within this session. */
export function viewName(dataset, resource) {
  const clean = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  let name = clean(resource.name) || clean(dataset.id);
  if (/^[0-9]/.test(name)) name = `t_${name}`;
  const existing = views.get(name);
  if (existing && (existing.dataset !== dataset.id || existing.resource !== resource.name)) {
    name = `${clean(dataset.id)}__${name}`;
  }
  return name;
}

/** Register a resource as a view and return its name. Views are lazy: data loads on first query. */
export async function register(cfg, dataset, resource) {
  await init(cfg);
  const name = viewName(dataset, resource);
  if (!views.has(name)) {
    // Materialize CSV/JSON once (they cannot be range-read); Parquet stays remote.
    const src = reader(resource.format, resource.url);
    const kind = resource.format === 'parquet' ? 'VIEW' : 'TABLE';
    await conn.query(`CREATE OR REPLACE ${kind} ${sqlIdent(name)} AS SELECT * FROM ${src}`);
    views.set(name, { dataset: dataset.id, resource: resource.name, url: resource.url, kind });
  }
  return name;
}

export function registered() {
  return [...views.entries()].map(([name, v]) => ({ name, ...v }));
}

export async function drop(name) {
  const v = views.get(name);
  if (!v) return;
  await conn.query(`DROP ${v.kind} IF EXISTS ${sqlIdent(name)}`);
  views.delete(name);
}

function toJS(v) {
  if (v == null) return null;
  if (typeof v === 'bigint') return Number.isSafeInteger(Number(v)) ? Number(v) : v.toString();
  if (v instanceof Date) return v.toISOString();
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) return Array.from(v, toJS);
  if (typeof v === 'object' && typeof v.toJSON === 'function') return v.toJSON();
  return v;
}

function convertCell(v, type) {
  const x = toJS(v);
  if (x == null) return null;
  if (/^Date/.test(type) && typeof x === 'number') return new Date(x).toISOString().slice(0, 10);
  if (/^Timestamp/.test(type) && typeof x === 'number') return new Date(x).toISOString().replace('.000Z', 'Z');
  if (/^Decimal/.test(type) && typeof x !== 'number') return Number(x);
  return x;
}

/** Run SQL. Returns { columns: [{name, type, numeric, temporal}], rows: [[...]], elapsed }. */
export async function query(cfg, sql) {
  await init(cfg);
  const t0 = performance.now();
  const table = await conn.query(sql);
  const fields = table.schema.fields.map((f) => {
    const type = String(f.type);
    return {
      name: f.name,
      type,
      numeric: /^(Int|Uint|Float|Decimal)/i.test(type),
      temporal: /^(Date|Timestamp|Time)/i.test(type),
    };
  });
  const rows = [];
  const cols = fields.map((_, j) => table.getChildAt(j));
  for (let i = 0; i < table.numRows; i++) {
    rows.push(cols.map((c, j) => convertCell(c.get(i), fields[j].type)));
  }
  return { columns: fields, rows, elapsed: performance.now() - t0 };
}

export async function columns(cfg, name) {
  const r = await query(cfg, `DESCRIBE ${sqlIdent(name)}`);
  return r.rows.map((row) => ({ name: row[0], type: row[1] }));
}
