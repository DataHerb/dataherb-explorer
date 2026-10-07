// Loads the JSON files written by `dhx build`, and refreshes job status live.

import { assess, HEALTH_ORDER, worst } from './health.js';

const state = {
  config: null,
  catalog: null,
  status: null,
  build: null,
  live: { at: null, ok: 0, failed: 0 },
  listeners: new Set(),
};

async function getJSON(url, opts = {}) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

export async function loadAll() {
  const [config, catalog, status, build] = await Promise.all([
    getJSON('data/config.json'),
    getJSON('data/catalog.json'),
    getJSON('data/status.json').catch(() => ({ jobs: [] })),
    getJSON('data/build.json').catch(() => null),
  ]);
  Object.assign(state, { config, catalog, status, build });
  applyAccent(config.site.accent);
  linkDatasets();
  return state;
}

export const getState = () => state;

export function datasets() {
  return state.catalog.datasets;
}

export function dataset(id) {
  return state.catalog.datasets.find((d) => d.id === id);
}

export function jobs() {
  return state.status.jobs;
}

export function job(id) {
  return state.status.jobs.find((j) => j.id === id);
}

export function onChange(fn) {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

function applyAccent(color) {
  if (color) document.documentElement.style.setProperty('--accent', color);
}

/** Recompute dataset health from (possibly refreshed) jobs. */
function linkDatasets() {
  const byId = Object.fromEntries(state.status.jobs.map((j) => [j.id, j]));
  for (const d of state.catalog.datasets) {
    d.health = worst((d.status_jobs || []).map((id) => byId[id]?.health)) || null;
  }
}

/**
 * Fetch every job's latest.json straight from storage, so the page shows
 * status newer than the last site build. Failures fall back to the snapshot.
 */
export async function refreshLive() {
  const cfg = state.config.status || {};
  const grace = cfg.stale_grace ?? 0.5;
  let ok = 0;
  let failed = 0;
  await Promise.all(
    state.status.jobs.map(async (j) => {
      if (!cfg.live || !j.latest_url) {
        Object.assign(j, assess(j.state || {}, Date.now(), grace));
        return;
      }
      try {
        const doc = await getJSON(j.latest_url, { cache: 'no-store' });
        const changed = doc.run?.id !== j.state?.run?.id || doc.run?.status !== j.state?.run?.status;
        j.state = doc;
        if (changed && doc.run) {
          const summary = {
            id: doc.run.id,
            status: doc.run.status,
            started_at: doc.run.started_at,
            finished_at: doc.run.finished_at,
            duration_seconds: doc.run.duration_seconds,
            url: doc.run.url,
            message: doc.run.message,
          };
          j.history = [summary, ...(j.history || []).filter((r) => r.id !== doc.run.id)];
        }
        ok++;
      } catch {
        failed++;
      }
      Object.assign(j, assess(j.state || {}, Date.now(), grace));
    }),
  );
  state.status.jobs.sort(
    (a, b) => HEALTH_ORDER.indexOf(a.health) - HEALTH_ORDER.indexOf(b.health) || a.name.localeCompare(b.name),
  );
  state.live = { at: cfg.live ? new Date().toISOString() : null, ok, failed };
  linkDatasets();
  for (const fn of state.listeners) fn(state);
  return true;
}
