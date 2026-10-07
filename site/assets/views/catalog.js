// Catalog: search, facets and dataset cards.

import { HEALTH_LABEL, HEALTH_ORDER } from '../lib/health.js';
import { debounce, fmtNumber, h, link, timeAgo } from '../lib/util.js';

const FACETS = [
  { key: 'tag', label: 'Tags', values: (d) => d.tags || [] },
  { key: 'domain', label: 'Domain', values: (d) => (d.domain ? [d.domain] : []) },
  { key: 'health', label: 'Freshness', values: (d) => [d.health || 'unmonitored'] },
  { key: 'source', label: 'Storage', values: (d) => [d.source] },
  { key: 'owner', label: 'Owner', values: (d) => [d.owner?.team || d.owner?.name || d.owner?.email].filter(Boolean) },
  { key: 'class', label: 'Classification', values: (d) => (d.classification ? [d.classification] : []) },
  { key: 'format', label: 'Format', values: (d) => [...new Set((d.resources || []).map((r) => r.format).filter(Boolean))] },
];

const SORTS = {
  relevance: 'Relevance',
  name: 'Name',
  quality: 'Metadata quality',
  updated: 'Recently updated',
};

export const SOURCE_LABEL = { git: 'Git', s3: 'S3', http: 'HTTP', local: 'Repository', inline: 'Inline' };

function searchText(d) {
  if (!d._search) {
    const fields = (d.resources || []).flatMap((r) => (r.fields || []).map((f) => f.name));
    d._search = {
      name: `${d.name} ${d.id}`.toLowerCase(),
      tags: (d.tags || []).join(' ').toLowerCase(),
      body: `${d.description} ${d.documentation} ${d.domain || ''} ${d.owner?.team || ''} ${d.owner?.name || ''}`.toLowerCase(),
      fields: fields.join(' ').toLowerCase(),
    };
  }
  return d._search;
}

export function score(d, terms) {
  if (!terms.length) return 1;
  const s = searchText(d);
  let total = 0;
  for (const t of terms) {
    const hit = (s.name.includes(t) ? 4 : 0) + (s.tags.includes(t) ? 3 : 0) + (s.fields.includes(t) ? 2 : 0) + (s.body.includes(t) ? 1 : 0);
    if (!hit) return 0;
    total += hit;
  }
  return total;
}

export function healthPill(health, reason) {
  if (!health) return null;
  return h(`span.pill.health-${health}`, { title: reason || HEALTH_LABEL[health] }, h('span.dot', { 'aria-hidden': 'true' }), HEALTH_LABEL[health]);
}

export function qualityBadge(q) {
  if (!q) return null;
  const level = q.score >= 80 ? 'good' : q.score >= 50 ? 'ok' : 'poor';
  return h(`span.quality.q-${level}`, { title: `Metadata quality ${q.score}/100` }, `${q.score}`);
}

function card(d) {
  const formats = [...new Set((d.resources || []).map((r) => r.format).filter(Boolean))];
  const owner = d.owner?.team || d.owner?.name || d.owner?.email;
  return h(
    'article.card',
    h(
      'div.card-head',
      h('h3', h('a', { href: link(['d', d.id]) }, d.name)),
      h('div.card-badges', healthPill(d.health), qualityBadge(d.quality)),
    ),
    d.error ? h('p.warn.small', 'Metadata could not be fetched at the last build.') : null,
    h('p.desc', d.description || h('span.muted', 'No description yet.')),
    d.tags?.length ? h('div.tags', d.tags.map((t) => h('a.tag', { href: link([], { tag: t }) }, t))) : null,
    h(
      'div.meta',
      h('span', SOURCE_LABEL[d.source] || d.source),
      h('span', `${d.resources.length} file${d.resources.length === 1 ? '' : 's'}`),
      formats.length ? h('span', formats.join(', ')) : null,
      owner ? h('span', owner) : null,
      d.updated_at ? h('span', { title: d.updated_at }, `updated ${timeAgo(d.updated_at)}`) : null,
    ),
  );
}

export function catalogView(state, query) {
  const all = state.catalog.datasets;
  const params = new URLSearchParams(query);
  const selected = Object.fromEntries(FACETS.map((f) => [f.key, new Set(params.getAll(f.key))]));
  let q = params.get('q') || '';
  let sort = params.get('sort') || 'relevance';

  const results = h('div.results');
  const facetsEl = h('aside.facets', { 'aria-label': 'Filters' });
  const countEl = h('span.muted');

  const sync = () => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    for (const f of FACETS) for (const v of selected[f.key]) p.append(f.key, v);
    if (sort !== 'relevance') p.set('sort', sort);
    const s = p.toString();
    history.replaceState(null, '', `#/${s ? `?${s}` : ''}`);
  };

  const filtered = (exceptKey) =>
    all.filter((d) =>
      FACETS.every((f) => f.key === exceptKey || !selected[f.key].size || f.values(d).some((v) => selected[f.key].has(v))),
    );

  const draw = () => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    let list = filtered(null)
      .map((d) => ({ d, s: score(d, terms) }))
      .filter((x) => x.s > 0);
    const by = {
      relevance: (a, b) => b.s - a.s || a.d.name.localeCompare(b.d.name),
      name: (a, b) => a.d.name.localeCompare(b.d.name),
      quality: (a, b) => (b.d.quality?.score ?? 0) - (a.d.quality?.score ?? 0),
      updated: (a, b) => String(b.d.updated_at || '').localeCompare(String(a.d.updated_at || '')),
    }[sort];
    list.sort(by);
    list = list.map((x) => x.d);
    countEl.textContent = `${list.length} of ${all.length} datasets`;
    results.replaceChildren(
      ...(list.length ? list.map(card) : [h('div.empty', h('p', 'No datasets match.'), h('button.btn', { onclick: clear }, 'Clear filters'))]),
    );

    // Facet counts reflect the other active filters.
    facetsEl.replaceChildren(
      ...FACETS.map((f) => {
        const counts = new Map();
        for (const d of filtered(f.key).filter((d) => score(d, terms) > 0)) for (const v of f.values(d)) counts.set(v, (counts.get(v) || 0) + 1);
        for (const v of selected[f.key]) if (!counts.has(v)) counts.set(v, 0);
        if (!counts.size) return null;
        let entries = [...counts.entries()];
        entries =
          f.key === 'health'
            ? entries.sort((a, b) => HEALTH_ORDER.indexOf(a[0]) - HEALTH_ORDER.indexOf(b[0]))
            : entries.sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
        return h(
          'fieldset.facet',
          h('legend', f.label),
          entries.slice(0, 12).map(([v, n]) =>
            h(
              'label.facet-row',
              h('input', {
                type: 'checkbox',
                checked: selected[f.key].has(v),
                onchange: (e) => {
                  if (e.target.checked) selected[f.key].add(v);
                  else selected[f.key].delete(v);
                  sync();
                  draw();
                },
              }),
              h('span.facet-label', f.key === 'health' ? HEALTH_LABEL[v] || 'Not monitored' : f.key === 'source' ? SOURCE_LABEL[v] || v : v),
              h('span.facet-count', n),
            ),
          ),
        );
      }).filter(Boolean),
    );
  };

  function clear() {
    q = '';
    search.value = '';
    for (const f of FACETS) selected[f.key].clear();
    sync();
    draw();
  }

  const search = h('input.search', {
    type: 'search',
    placeholder: 'Search datasets, tags, columns…  ( / )',
    value: q,
    'aria-label': 'Search datasets',
    oninput: debounce((e) => {
      q = e.target.value;
      sync();
      draw();
    }, 120),
  });
  const onKey = (e) => {
    if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      e.preventDefault();
      search.focus();
    }
  };
  document.addEventListener('keydown', onKey);

  const jobs = state.status.jobs;
  const unhealthy = jobs.filter((j) => ['failing', 'stuck', 'stale'].includes(j.health)).length;
  const files = all.reduce((n, d) => n + d.resources.length, 0);
  const errors = state.build?.errors || 0;

  const el = h(
    'div.page',
    h(
      'section.hero',
      h('h1', state.config.site.title),
      state.config.site.description ? h('p.lead', state.config.site.description) : null,
      search,
      h(
        'div.stats',
        h('div.stat', h('strong', fmtNumber(all.length)), h('span', 'datasets')),
        h('div.stat', h('strong', fmtNumber(files)), h('span', 'files')),
        h('div.stat', h('strong', fmtNumber(jobs.length)), h('span', 'monitored jobs')),
        h(
          'a.stat',
          { href: '#/status', class: unhealthy ? 'stat-alert' : '' },
          h('strong', fmtNumber(unhealthy)),
          h('span', unhealthy === 1 ? 'job needs attention' : 'jobs need attention'),
        ),
      ),
      errors ? h('p.warn.small', `${errors} problem(s) at the last build. `, h('a', { href: '#/status' }, 'See the build report')) : null,
    ),
    h(
      'div.catalog',
      facetsEl,
      h(
        'section',
        h(
          'div.toolbar',
          countEl,
          h(
            'label.sort',
            'Sort ',
            h(
              'select',
              {
                onchange: (e) => {
                  sort = e.target.value;
                  sync();
                  draw();
                },
              },
              Object.entries(SORTS).map(([k, v]) => h('option', { value: k, selected: k === sort }, v)),
            ),
          ),
        ),
        results,
      ),
    ),
  );
  draw();
  return { el, cleanup: () => document.removeEventListener('keydown', onKey) };
}
