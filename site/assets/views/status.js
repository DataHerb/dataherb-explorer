// Job status monitoring: overview, per-job history and the build report.

import { getState, job as getJob, onChange, refreshLive } from '../lib/data.js';
import { HEALTH_LABEL, HEALTH_ORDER } from '../lib/health.js';
import { fmtDuration, fmtNumber, fmtTime, h, link, timeAgo } from '../lib/util.js';
import { healthPill } from './catalog.js';

const RUN_LABEL = {
  success: 'Succeeded',
  failed: 'Failed',
  partial: 'Partial',
  running: 'Running',
  queued: 'Queued',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
};

function strip(history, n = 30) {
  const runs = (history || []).slice(0, n).reverse();
  return h(
    'div.strip',
    { 'aria-label': `Last ${runs.length} runs` },
    runs.map((r) =>
      h(r.url ? 'a' : 'span', {
        class: `run run-${r.status}`,
        href: r.url || null,
        target: r.url ? '_blank' : null,
        rel: 'noopener',
        title: `${RUN_LABEL[r.status] || r.status} · ${fmtTime(r.started_at)}${r.duration_seconds != null ? ` · ${fmtDuration(r.duration_seconds)}` : ''}`,
      }),
    ),
  );
}

function liveNote(state) {
  const live = state.live;
  if (!state.config.status?.live) return h('span.muted.small', `Snapshot from the site build, ${timeAgo(state.status.generated_at)}.`);
  if (!live.at) return h('span.muted.small', 'Fetching live status…');
  return h(
    'span.muted.small',
    `Live · checked ${new Date(live.at).toLocaleTimeString()}`,
    live.failed ? ` · ${live.failed} job(s) unreachable, showing the build snapshot for them` : '',
  );
}

function overview(state) {
  const jobs = state.status.jobs;
  const counts = Object.fromEntries(HEALTH_ORDER.map((k) => [k, 0]));
  for (const j of jobs) counts[j.health] = (counts[j.health] || 0) + 1;
  const filter = new URLSearchParams(location.hash.split('?')[1] || '').get('health');
  const shown = filter ? jobs.filter((j) => j.health === filter) : jobs;

  return h(
    'div',
    h(
      'div.health-summary',
      h('a', { href: '#/status', class: ['chip', !filter && 'active'] }, `All ${jobs.length}`),
      HEALTH_ORDER.filter((k) => counts[k]).map((k) =>
        h('a', { href: link(['status'], { health: k }), class: ['chip', `chip-${k}`, filter === k && 'active'] }, h('span.dot'), `${HEALTH_LABEL[k]} ${counts[k]}`),
      ),
    ),
    shown.length
      ? h(
          'div.table-scroll',
          h(
            'table.data.jobs',
            h(
              'thead',
              h('tr', h('th', 'Job'), h('th', 'Health'), h('th', 'Last run'), h('th', 'Last success'), h('th', 'Next expected'), h('th', 'Recent runs'), h('th', 'Owner')),
            ),
            h(
              'tbody',
              shown.map((j) => {
                const run = j.state?.run || {};
                return h(
                  'tr',
                  h('td', h('a', { href: link(['status', j.id]) }, j.name), h('div.muted.small', j.orchestrator || '', j.schedule ? ` · ${j.schedule}` : '')),
                  h('td', healthPill(j.health, j.reason), h('div.small.reason', j.reason)),
                  h('td', h('span', { title: fmtTime(run.started_at) }, RUN_LABEL[run.status] || run.status || ''), h('div.muted.small', timeAgo(run.finished_at || run.started_at), run.duration_seconds != null ? ` · ${fmtDuration(run.duration_seconds)}` : '')),
                  h('td', j.last_success_at ? h('span', { title: fmtTime(j.last_success_at) }, timeAgo(j.last_success_at)) : h('span.muted', 'never')),
                  h('td', j.next_expected_at ? h('span', { title: fmtTime(j.next_expected_at) }, Date.parse(j.next_expected_at) < Date.now() ? `overdue, due ${timeAgo(j.next_expected_at)}` : timeAgo(j.next_expected_at)) : h('span.muted', '–')),
                  h('td', strip(j.history)),
                  h('td.small', j.owner || ''),
                );
              }),
            ),
          ),
        )
      : h('div.empty', h('p', 'No jobs report status yet.'), h('p.small.muted', 'Jobs write status files that follow docs/job-status-spec.md; add their location under status.sources in dataherb.config.yml.')),
  );
}

function buildReport(state) {
  const b = state.build;
  if (!b) return null;
  return h(
    'details.panel.build-report',
    { open: b.errors > 0 },
    h('summary', h('strong', 'Last site build'), h('span.muted.small', ` ${timeAgo(b.generated_at)} · ${b.datasets} datasets · ${b.errors} errors · ${b.warnings} warnings · ${b.duration_seconds}s`)),
    b.issues.length
      ? h('ul.issues', b.issues.map((i) => h(`li.issue-${i.level}`, h('strong', `${i.level}`), i.dataset ? [' ', h('a', { href: link(['d', i.dataset]) }, i.dataset)] : null, `: ${i.message}`)))
      : h('p.small.muted', 'No problems.'),
  );
}

function jobDetail(state, id) {
  const j = getJob(id);
  if (!j) return h('div', h('p', `No job named ${id}.`), h('a', { href: '#/status' }, 'All jobs'));
  const st = j.state || {};
  const run = st.run || {};
  const datasets = (st.datasets || []).map((d) => ({ ...d, entry: state.catalog.datasets.find((x) => x.id === d.id) }));
  const linked = state.catalog.datasets.filter((d) => (d.status_jobs || []).includes(j.id) && !datasets.some((x) => x.id === d.id));
  return h(
    'div.job-detail',
    h('nav.crumbs', h('a', { href: '#/status' }, 'Status'), ' / ', h('span', j.name)),
    h('header.dataset-head', h('div', h('h1', j.name), h('div.badges', healthPill(j.health, j.reason))), h('p.lead', j.reason), j.description ? h('p', j.description) : null),
    h(
      'div.dataset-body',
      h(
        'div.dataset-main',
        run.error ? h('div.error-box', h('strong', `${run.error.type || 'Error'}: `), run.error.message) : null,
        h('h2', 'Recent runs'),
        strip(j.history, 60),
        h(
          'div.table-scroll',
          h(
            'table.data.compact',
            h('thead', h('tr', h('th', 'Run'), h('th', 'Status'), h('th', 'Started'), h('th', 'Duration'), h('th', 'Message'))),
            h(
              'tbody',
              (j.history || []).map((r) =>
                h(
                  'tr',
                  h('td', r.url ? h('a', { href: r.url, target: '_blank', rel: 'noopener' }, h('code.small', r.id)) : h('code.small', r.id)),
                  h('td', h(`span.run-label.run-${r.status}`, RUN_LABEL[r.status] || r.status)),
                  h('td', { title: fmtTime(r.started_at) }, timeAgo(r.started_at)),
                  h('td', fmtDuration(r.duration_seconds)),
                  h('td.small', r.message || ''),
                ),
              ),
            ),
          ),
        ),
        st.checks?.length
          ? [h('h2', 'Checks in the latest run'), h('ul.checks', st.checks.map((c) => h(`li.check-${c.status}`, h('strong', c.status.toUpperCase()), ` ${c.name}`, c.message ? h('span.muted', ` · ${c.message}`) : null, c.value != null ? h('span.muted', ` · ${c.value}`) : null)))]
          : null,
        st.metrics && Object.keys(st.metrics).length
          ? [h('h2', 'Metrics'), h('div.stats', Object.entries(st.metrics).map(([k, v]) => h('div.stat', h('strong', fmtNumber(v)), h('span', k.replace(/_/g, ' ')))))]
          : null,
        h('details', h('summary', 'Raw latest.json'), h('pre.raw', JSON.stringify(st, null, 2))),
      ),
      h(
        'aside.dataset-side',
        h(
          'div.panel',
          h('h4', 'Job'),
          h(
            'dl.details',
            [
              ['Id', h('code', j.id)],
              ['Owner', j.owner],
              ['Runs on', j.orchestrator],
              ['Schedule', j.schedule],
              ['Expected every', j.expected_interval],
              ['Max duration', j.max_duration],
              ['Last success', j.last_success_at ? `${timeAgo(j.last_success_at)} (${fmtTime(j.last_success_at)})` : 'never'],
              ['Definition', j.url ? h('a', { href: j.url, target: '_blank', rel: 'noopener' }, 'Open') : null],
              ['Status file', j.latest_url ? h('a', { href: j.latest_url, target: '_blank', rel: 'noopener' }, 'latest.json') : null],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => [h('dt', k), h('dd', v)]),
          ),
        ),
        datasets.length || linked.length
          ? h(
              'div.panel',
              h('h4', 'Datasets'),
              h(
                'ul.plain',
                datasets.map((d) =>
                  h('li', d.entry ? h('a', { href: link(['d', d.id]) }, d.entry.name) : h('code', d.id), d.rows != null ? h('span.muted.small', ` · ${fmtNumber(d.rows)} rows`) : null),
                ),
                linked.map((d) => h('li', h('a', { href: link(['d', d.id]) }, d.name))),
              ),
            )
          : null,
      ),
    ),
  );
}

export function statusView(state, jobId) {
  const body = h('div');
  const note = h('div.live-note');
  const draw = () => {
    const s = getState();
    note.replaceChildren(liveNote(s), ' ', h('button.btn.ghost.small', { onclick: () => refreshLive() }, 'Refresh'));
    body.replaceChildren(jobId ? jobDetail(s, jobId) : h('div', overview(s), buildReport(s)));
  };
  const off = onChange(draw);
  const timer = setInterval(draw, 30_000); // keep relative times honest
  draw();
  const el = h(
    'div.page.status',
    jobId ? null : h('div.explore-head', h('h1', 'Job status'), h('p.muted', 'Health of the jobs that produce the datasets in this catalog.')),
    note,
    body,
  );
  return {
    el,
    cleanup: () => {
      off();
      clearInterval(timer);
    },
  };
}
