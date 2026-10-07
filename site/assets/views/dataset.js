// Dataset page: metadata, freshness, files, schema, preview and profile.

import * as duck from '../lib/duck.js';
import { dataset as getDataset, job as getJob } from '../lib/data.js';
import { resultTable } from '../lib/table.js';
import { absUrl, copyText, fmtBytes, fmtNumber, fmtTime, h, link, markdown, sqlIdent, timeAgo } from '../lib/util.js';
import { healthPill, qualityBadge, SOURCE_LABEL } from './catalog.js';

function ownerText(o) {
  if (!o) return null;
  const parts = [o.team, o.name].filter(Boolean).join(' · ');
  return h('span', parts || null, o.email ? h('a', { href: `mailto:${o.email}` }, parts ? ` <${o.email}>` : o.email) : null);
}

function dl(rows) {
  return h(
    'dl.details',
    rows.filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => [h('dt', k), h('dd', v)]),
  );
}

function snippet(tmpl, r) {
  const fmt = { tsv: 'csv', ndjson: 'json', geojson: 'json' }[r.format] || r.format || 'csv';
  return tmpl.template.replaceAll('{url}', absUrl(r.url)).replaceAll('{format}', fmt).replaceAll('{name}', r.name).trim();
}

export async function confirmSize(state, r) {
  const max = state.config.explorer?.max_browser_bytes;
  if (max && r.bytes && r.bytes > max) {
    return window.confirm(`${r.name} is ${fmtBytes(r.bytes)}. Loading it in the browser may be slow. Continue?`);
  }
  return true;
}

export async function runInto(out, task) {
  out.replaceChildren(h('p.muted', h('span.spinner'), ' Loading DuckDB and data…'));
  try {
    out.replaceChildren(await task());
  } catch (e) {
    out.replaceChildren(
      h(
        'div.error-box',
        h('strong', 'Could not query this file. '),
        String(e.message || e),
        h('p.small.muted', 'Remote files must allow cross-origin requests (CORS) from this site. See docs/s3.md.'),
      ),
    );
  }
}

function resourceBlock(state, d, r) {
  const cfg = state.config;
  const out = h('div.resource-out');
  const queryable = cfg.explorer?.enabled !== false && duck.canQuery(r);
  const act = (fn) => async () => {
    if (!(await confirmSize(state, r))) return;
    runInto(out, fn);
  };
  const preview = act(async () => {
    const name = await duck.register(cfg, d, r);
    const res = await duck.query(cfg, `SELECT * FROM ${sqlIdent(name)} LIMIT ${cfg.explorer?.preview_rows || 200}`);
    const count = await duck.query(cfg, `SELECT count(*) AS n FROM ${sqlIdent(name)}`);
    return h('div', h('p.small.muted', `${fmtNumber(count.rows[0][0])} rows · first ${res.rows.length} shown · ${res.elapsed.toFixed(0)} ms`), resultTable(res));
  });
  const profile = act(async () => {
    const name = await duck.register(cfg, d, r);
    const res = await duck.query(cfg, `SUMMARIZE ${sqlIdent(name)}`);
    return h('div', h('p.small.muted', 'Column profile (DuckDB SUMMARIZE)'), resultTable(res));
  });

  const fields = r.fields || [];
  const snippets = (cfg.snippets || []).filter(() => r.url);
  return h(
    'section.resource',
    { id: `r-${r.name}` },
    h(
      'div.resource-head',
      h('h3', r.title || r.name),
      h('div.meta', r.format ? h('span.fmt', r.format) : null, r.bytes ? h('span', fmtBytes(r.bytes)) : null, r.rows ? h('span', `${fmtNumber(r.rows)} rows`) : null, r.path ? h('code.small', r.path) : null),
    ),
    r.description ? h('p', r.description) : null,
    h(
      'div.actions',
      queryable ? h('button.btn.primary', { onclick: preview }, 'Preview') : null,
      queryable ? h('button.btn', { onclick: profile }, 'Profile columns') : null,
      queryable ? h('a.btn', { href: link(['explore'], { t: `${d.id}/${r.name}` }) }, 'Open in explorer') : null,
      r.url ? h('a.btn', { href: r.url, download: '', target: '_blank', rel: 'noopener' }, 'Download') : null,
      r.url ? h('button.btn.ghost', { onclick: (e) => copyText(absUrl(r.url), e.currentTarget) }, 'Copy URL') : null,
      !r.url ? h('span.muted.small', 'No URL could be resolved for this file.') : null,
      r.url && !queryable && cfg.explorer?.enabled !== false ? h('span.muted.small', `In-browser preview supports ${duck.SUPPORTED_FORMATS.join(', ')}.`) : null,
    ),
    out,
    fields.length
      ? h(
          'details.schema',
          { open: fields.length <= 12 },
          h('summary', `Schema · ${fields.length} column${fields.length === 1 ? '' : 's'}`),
          h(
            'div.table-scroll',
            h(
              'table.data.compact',
              h('thead', h('tr', h('th', 'Column'), h('th', 'Type'), h('th', 'Description'))),
              h(
                'tbody',
                fields.map((f) =>
                  h(
                    'tr',
                    h('td', h('code', f.name), [r.primary_key].flat().includes(f.name) ? h('span.pk', { title: 'Primary key' }, ' key') : null),
                    h('td.muted', f.type || ''),
                    h('td', f.description || '', f.unit ? h('span.muted', ` (${f.unit})`) : null),
                  ),
                ),
              ),
            ),
          ),
        )
      : h('p.muted.small', 'No schema declared for this file.'),
    snippets.length
      ? h(
          'details.snippets',
          h('summary', 'Use it in code'),
          snippets.map((sn) => {
            const code = snippet(sn, r);
            return h('div.snippet', h('div.snippet-head', h('span', sn.label), h('button.btn.ghost.small', { onclick: (e) => copyText(code, e.currentTarget) }, 'Copy')), h('pre', h('code', code)));
          }),
        )
      : null,
  );
}

function freshness(state, d) {
  const jobs = (d.status_jobs || []).map((id) => getJob(id) || { id, missing: true });
  if (!jobs.length) return h('div.panel', h('h4', 'Freshness'), h('p.muted.small', 'No job is linked to this dataset. Add status_job to its metadata to monitor it.'));
  return h(
    'div.panel',
    h('h4', 'Freshness'),
    jobs.map((j) =>
      j.missing
        ? h('p.small.muted', `Job ${j.id}: no status files found.`)
        : h(
            'div.job-mini',
            h('div', h('a', { href: link(['status', j.id]) }, j.name), ' ', healthPill(j.health, j.reason)),
            h('p.small.muted', j.reason),
            dl([
              ['Last success', j.last_success_at ? h('span', { title: fmtTime(j.last_success_at) }, timeAgo(j.last_success_at)) : 'never'],
              ['Next expected', j.next_expected_at ? h('span', { title: fmtTime(j.next_expected_at) }, timeAgo(j.next_expected_at)) : null],
            ]),
          ),
    ),
  );
}

export function datasetView(state, id) {
  const d = getDataset(id);
  if (!d) return h('div.page', h('h1', 'Dataset not found'), h('p', h('a', { href: '#/' }, 'Back to the catalog')));
  const queryable = d.resources.filter((r) => duck.canQuery(r));
  const related = (d.related || [])
    .map((rel) => ({ ...rel, d: getDataset(rel.id) }))
    .filter((rel) => rel.d);

  const tc = d.temporal_coverage;
  const details = dl([
    ['Id', h('code', d.id)],
    ['Owner', ownerText(d.owner)],
    ['Domain', d.domain],
    ['License', d.license],
    ['Classification', d.classification],
    ['Updates', d.update_frequency],
    ['Coverage', tc ? `${tc.start || '…'} to ${tc.end || '…'}` : null],
    ['Storage', SOURCE_LABEL[d.source] || d.source],
    ['Location', d.web_url ? h('a', { href: d.web_url, target: '_blank', rel: 'noopener' }, d.location || d.web_url) : d.location ? h('code.small', d.location) : null],
    ['Last update', d.updated_at ? h('span', { title: fmtTime(d.updated_at) }, timeAgo(d.updated_at)) : null],
    ['Catalog entry', d.edit_url ? h('a', { href: d.edit_url, target: '_blank', rel: 'noopener' }, d.catalog_file) : d.catalog_file],
  ]);

  return h(
    'div.page.dataset',
    h('nav.crumbs', h('a', { href: '#/' }, 'Catalog'), ' / ', h('span', d.name)),
    h(
      'header.dataset-head',
      h('div', h('h1', d.name), h('div.badges', healthPill(d.health), d.classification ? h('span.pill', d.classification) : null, qualityBadge(d.quality))),
      d.description ? h('p.lead', d.description) : null,
      d.tags?.length ? h('div.tags', d.tags.map((t) => h('a.tag', { href: link([], { tag: t }) }, t))) : null,
      h(
        'div.actions',
        queryable.length
          ? h('a.btn.primary', { href: link(['explore'], { t: queryable.map((r) => `${d.id}/${r.name}`).join(',') }) }, 'Explore all files')
          : null,
        d.web_url ? h('a.btn', { href: d.web_url, target: '_blank', rel: 'noopener' }, 'View source') : null,
        d.edit_url ? h('a.btn.ghost', { href: d.edit_url, target: '_blank', rel: 'noopener' }, 'Edit catalog entry') : null,
      ),
      d.error ? h('div.error-box', h('strong', 'Metadata unavailable at the last build: '), d.error) : null,
    ),
    h(
      'div.dataset-body',
      h(
        'div.dataset-main',
        d.documentation ? h('section.doc', { html: markdown(d.documentation) }) : null,
        h('h2', `Files (${d.resources.length})`),
        d.resources.length ? d.resources.map((r) => resourceBlock(state, d, r)) : h('p.muted', 'No files listed in the metadata.'),
      ),
      h(
        'aside.dataset-side',
        h('div.panel', h('h4', 'Details'), details),
        freshness(state, d),
        related.length
          ? h(
              'div.panel',
              h('h4', 'Often joined with'),
              related.map((rel) => {
                const tables = [...queryable.map((r) => `${d.id}/${r.name}`), ...rel.d.resources.filter((r) => duck.canQuery(r)).map((r) => `${rel.d.id}/${r.name}`)];
                return h(
                  'div.related',
                  h('a', { href: link(['d', rel.d.id]) }, rel.d.name),
                  rel.on ? h('p.small', h('code', rel.on)) : null,
                  h('a.btn.small', { href: link(['explore'], { t: tables.join(','), join: rel.on || '' }) }, 'Explore the join'),
                );
              }),
            )
          : null,
        d.quality?.findings?.length
          ? h(
              'details.panel',
              h('summary', h('strong', `Metadata quality ${d.quality.score}/100`)),
              h('ul.findings', d.quality.findings.map((f) => h('li', f.message))),
            )
          : null,
      ),
    ),
  );
}
