// Entry point: loads data, draws the shell and routes between views.

import { getState, loadAll, onChange, refreshLive } from './lib/data.js';
import { h, mount, parseHash, timeAgo } from './lib/util.js';
import { catalogView } from './views/catalog.js';
import { datasetView } from './views/dataset.js';
import { exploreView } from './views/explore.js';
import { statusView } from './views/status.js';

const main = document.getElementById('main');
let cleanup = null;

const THEME_KEY = 'dataherb-theme';

function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch {}
  if (saved) document.documentElement.dataset.theme = saved;
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const dark =
      document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
  });
}

function shell(state) {
  const { site } = state.config;
  document.title = site.title;
  document.getElementById('site-title').textContent = site.title;
  if (site.logo) {
    const img = document.getElementById('logo');
    img.src = site.logo;
    img.hidden = false;
  }
  const ext = document.getElementById('ext-links');
  mount(ext, (site.links || []).map((l) => h('a', { href: l.url, target: '_blank', rel: 'noopener' }, l.label)));
  const build = state.build;
  document.getElementById('footer-build').textContent = `Catalog built ${timeAgo(state.catalog.generated_at)}${
    build ? ` · ${build.datasets} datasets · ${build.jobs} jobs` : ''
  }`;
  updateBadge(state);
}

function updateBadge(state) {
  const bad = state.status.jobs.filter((j) => ['failing', 'stuck', 'stale'].includes(j.health)).length;
  const badge = document.getElementById('status-badge');
  badge.hidden = !bad;
  badge.textContent = bad;
  badge.title = `${bad} job(s) need attention`;
}

function route() {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  const { path, query } = parseHash();
  const section = path[0] || 'catalog';
  for (const a of document.querySelectorAll('[data-nav]')) {
    a.classList.toggle('active', a.dataset.nav === (section === 'd' ? 'catalog' : section));
  }
  const state = getState();
  let view;
  if (section === 'd' && path[1]) view = datasetView(state, path[1]);
  else if (section === 'explore') view = exploreView(state, query);
  else if (section === 'status') view = statusView(state, path[1]);
  else view = catalogView(state, query);
  mount(main, view.el || view);
  cleanup = view.cleanup || null;
  if (!location.hash.includes('?') || section !== 'catalog') window.scrollTo(0, 0);
}

async function start() {
  initTheme();
  let state;
  try {
    state = await loadAll();
  } catch (e) {
    mount(
      main,
      h('div.panel.error', h('h2', 'Could not load the catalog'), h('p', String(e.message || e)), h('p.muted', 'Run `dataherb catalog build` and serve the dist/ folder.')),
    );
    return;
  }
  shell(state);
  window.addEventListener('hashchange', route);
  route();
  onChange(updateBadge);
  // Pull live status once at start and every 2 minutes.
  refreshLive();
  setInterval(refreshLive, 120_000);
}

start();
