// Explorer: load files as DuckDB tables, write SQL, join, chart and profile results.

import { renderChart } from '../lib/chart.js';
import { dataset as getDataset } from '../lib/data.js';
import * as duck from '../lib/duck.js';
import { downloadCSV, resultTable } from '../lib/table.js';
import { copyText, fmtNumber, h, link, sqlIdent } from '../lib/util.js';
import { confirmSize } from './dataset.js';

const DISPLAY_LIMIT = 10000;
const CHART_LIMIT = 5000;

const isSelect = (sql) => /^\s*(?:--[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*(select|with|from|values|table)\b/i.test(sql);
const stripSql = (sql) => sql.trim().replace(/;+\s*$/, '');

function parseJoinHint(hint) {
  const m = /(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/.exec(hint || '');
  return m ? { lt: m[1], lk: m[2], rt: m[3], rk: m[4] } : null;
}

export function joinSql(lt, lk, rt, rk, kind = 'LEFT') {
  const same = lk === rk;
  return [
    `SELECT l.*, r.*${same ? ` EXCLUDE (${sqlIdent(rk)})` : ''}`,
    `FROM ${sqlIdent(lt)} AS l`,
    `${kind} JOIN ${sqlIdent(rt)} AS r ON l.${sqlIdent(lk)} = r.${sqlIdent(rk)}`,
  ].join('\n');
}

export function exploreView(state, query) {
  const cfg = state.config;
  if (cfg.explorer?.enabled === false) return h('div.page', h('h1', 'Explorer'), h('p', 'The explorer is disabled in this catalog.'));

  const tablesEl = h('div.tables');
  const editor = h('textarea.sql', {
    spellcheck: false,
    'aria-label': 'SQL query',
    placeholder: 'SELECT * FROM my_table LIMIT 100',
    rows: 8,
  });
  const runInfo = h('span.muted.small');
  const tabs = h('div.tabs', { role: 'tablist' });
  const panel = h('div.tab-panel');
  const joinBox = h('div.join-box', { hidden: true });
  let result = null;
  let lastSql = '';
  let activeTab = 'table';

  // ---- tables -------------------------------------------------------------

  const choices = state.catalog.datasets.flatMap((d) => d.resources.filter((r) => duck.canQuery(r)).map((r) => ({ d, r, key: `${d.id}/${r.name}` })));
  const picker = h(
    'select.picker',
    { 'aria-label': 'Add a table' },
    h('option', { value: '' }, 'Add a file…'),
    Object.entries(Object.groupBy ? Object.groupBy(choices, (c) => c.d.name) : groupBy(choices, (c) => c.d.name)).map(([name, items]) =>
      h('optgroup', { label: name }, items.map((c) => h('option', { value: c.key }, `${c.r.name} (${c.r.format})`))),
    ),
  );

  async function addTable(key, { quiet = false } = {}) {
    const c = choices.find((x) => x.key === key);
    if (!c) return null;
    if (!(await confirmSize(state, c.r))) return null;
    const pending = h('div.table-item.pending', h('span.spinner'), ` Loading ${c.r.name}…`);
    tablesEl.append(pending);
    try {
      const name = await duck.register(cfg, c.d, c.r);
      pending.remove();
      await drawTables();
      if (!quiet && !editor.value.trim()) {
        editor.value = `SELECT *\nFROM ${sqlIdent(name)}\nLIMIT 100`;
      }
      syncUrl();
      return name;
    } catch (e) {
      pending.replaceChildren(h('span.error-text', `${c.r.name}: ${e.message || e}`));
      return null;
    }
  }

  async function drawTables() {
    const items = [];
    for (const t of duck.registered()) {
      const cols = await duck.columns(cfg, t.name).catch(() => []);
      const d = getDataset(t.dataset);
      items.push(
        h(
          'details.table-item',
          { open: duck.registered().length <= 3 },
          h('summary', h('code', t.name), h('span.muted.small', ` ${cols.length} cols`)),
          d ? h('a.small', { href: link(['d', d.id]) }, d.name) : null,
          h(
            'ul.cols',
            cols.map((c) =>
              h(
                'li',
                h('button.col', { title: 'Insert into query', onclick: () => insert(sqlIdent(c.name)) }, c.name),
                h('span.muted.small', ` ${c.type.toLowerCase()}`),
              ),
            ),
          ),
          h('div.table-actions',
            h('button.btn.small', { onclick: () => { editor.value = `SELECT *\nFROM ${sqlIdent(t.name)}\nLIMIT 100`; run(); } }, 'Query'),
            h('button.btn.ghost.small', { onclick: async () => { await duck.drop(t.name); drawTables(); syncUrl(); } }, 'Remove'),
          ),
        ),
      );
    }
    tablesEl.replaceChildren(...(items.length ? items : [h('p.muted.small', 'No tables yet. Add a file above, or open one from a dataset page.')]));
  }

  function insert(text) {
    const { selectionStart: a, selectionEnd: b, value } = editor;
    editor.value = value.slice(0, a) + text + value.slice(b);
    editor.focus();
    editor.selectionStart = editor.selectionEnd = a + text.length;
  }

  function syncUrl() {
    const p = new URLSearchParams();
    const keys = duck.registered().map((t) => `${t.dataset}/${t.resource}`);
    if (keys.length) p.set('t', keys.join(','));
    if (editor.value.trim()) p.set('q', editor.value.trim());
    history.replaceState(null, '', `#/explore${p.toString() ? `?${p}` : ''}`);
  }

  // ---- running ------------------------------------------------------------

  async function run() {
    const sql = stripSql(editor.value);
    if (!sql) return;
    lastSql = sql;
    syncUrl();
    runInfo.textContent = 'Running…';
    panel.replaceChildren(h('p.muted', h('span.spinner'), ' Running query…'));
    try {
      if (isSelect(sql)) {
        result = await duck.query(cfg, `SELECT * FROM (\n${sql}\n) LIMIT ${DISPLAY_LIMIT + 1}`);
        let total = result.rows.length;
        if (total > DISPLAY_LIMIT) {
          const c = await duck.query(cfg, `SELECT count(*) FROM (\n${sql}\n)`);
          total = c.rows[0][0];
          result.rows.length = DISPLAY_LIMIT;
        }
        result.total = total;
        result.chartable = true;
      } else {
        result = await duck.query(cfg, sql);
        result.total = result.rows.length;
        result.chartable = false;
        await drawTables(); // statements may create tables
      }
      runInfo.textContent = `${fmtNumber(result.total)} rows · ${result.elapsed.toFixed(0)} ms`;
      drawTab();
    } catch (e) {
      result = null;
      runInfo.textContent = '';
      panel.replaceChildren(h('div.error-box', h('strong', 'Query failed. '), String(e.message || e)));
    }
  }

  editor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      run();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      insert('  ');
    }
  });

  // ---- result tabs --------------------------------------------------------

  const TABS = { table: 'Table', chart: 'Chart', stats: 'Statistics' };
  function drawTabs() {
    tabs.replaceChildren(
      ...Object.entries(TABS).map(([k, v]) =>
        h('button.tab', { role: 'tab', 'aria-selected': String(k === activeTab), onclick: () => { activeTab = k; drawTabs(); drawTab(); } }, v),
      ),
    );
  }

  function drawTab() {
    if (!result) return;
    if (activeTab === 'table') panel.replaceChildren(resultTable(result, { limit: 500 }));
    else if (activeTab === 'chart') panel.replaceChildren(chartPanel());
    else panel.replaceChildren(statsPanel());
  }

  function chartPanel() {
    if (!result.chartable) return h('p.muted', 'Charts work on SELECT queries.');
    const cols = result.columns;
    const numeric = cols.filter((c) => c.numeric);
    if (!numeric.length) return h('p.muted', 'Charts need at least one numeric column in the result.');
    const firstNonNumeric = cols.find((c) => !c.numeric) || cols[0];
    const opts = {
      type: firstNonNumeric.temporal ? 'line' : 'bar',
      x: firstNonNumeric.name,
      y: numeric.find((c) => c.name !== firstNonNumeric.name)?.name || numeric[0].name,
      agg: 'sum',
      series: '',
    };
    const out = h('div.chart-out');
    const sel = (key, options, label) =>
      h(
        'label.ctl',
        h('span', label),
        h(
          'select',
          { onchange: (e) => { opts[key] = e.target.value; sync(); draw(); } },
          options.map(([v, l]) => h('option', { value: v, selected: v === opts[key] }, l)),
        ),
      );
    const colOpts = (list) => list.map((c) => [c.name, c.name]);
    const controls = h('div.controls');
    const sync = () => {
      const hist = opts.type === 'histogram';
      controls.replaceChildren(
        ...[
        sel('type', [['bar', 'Bar'], ['line', 'Line'], ['scatter', 'Scatter'], ['histogram', 'Histogram']], 'Chart'),
        hist ? null : sel('x', colOpts(cols), 'X'),
        sel('y', colOpts(numeric), hist ? 'Column' : 'Y'),
        hist || opts.type === 'scatter' ? null : sel('agg', [['sum', 'Sum'], ['avg', 'Average'], ['count', 'Count rows'], ['min', 'Min'], ['max', 'Max'], ['none', 'No aggregation']], 'Aggregate'),
        hist ? null : sel('series', [['', 'None'], ...colOpts(cols.filter((c) => !c.numeric || c.name === opts.series))], 'Split by'),
        ].filter(Boolean),
      );
    };
    async function draw() {
      out.replaceChildren(h('p.muted', h('span.spinner'), ' Drawing…'));
      const X = sqlIdent(opts.x);
      const Y = sqlIdent(opts.y);
      const S = opts.series ? sqlIdent(opts.series) : null;
      let sql;
      let yLabel = opts.y;
      if (opts.type === 'histogram') {
        sql = `WITH r AS (\n${lastSql}\n), b AS (SELECT min(${Y})::DOUBLE lo, max(${Y})::DOUBLE hi FROM r)
          SELECT least(floor((${Y} - lo) / nullif((hi - lo) / 30, 0)), 29) AS bin, any_value(lo) lo, any_value(hi) hi, count(*) AS n
          FROM r, b WHERE ${Y} IS NOT NULL GROUP BY bin ORDER BY bin`;
      } else if (opts.type === 'scatter' || opts.agg === 'none') {
        sql = `WITH r AS (\n${lastSql}\n) SELECT ${X} AS x, ${Y} AS y${S ? `, ${S} AS s` : ''} FROM r WHERE ${Y} IS NOT NULL LIMIT ${CHART_LIMIT}`;
      } else {
        const agg = opts.agg === 'count' ? 'count(*)' : `${opts.agg}(${Y})`;
        yLabel = opts.agg === 'count' ? 'rows' : `${opts.agg} of ${opts.y}`;
        sql = `WITH r AS (\n${lastSql}\n) SELECT ${X} AS x${S ? `, ${S} AS s` : ''}, ${agg} AS y FROM r GROUP BY ALL ORDER BY x LIMIT ${CHART_LIMIT}`;
      }
      try {
        const res = await duck.query(cfg, sql);
        let points;
        if (opts.type === 'histogram') {
          const valid = res.rows.filter((r) => r[0] != null);
          const counts = new Map(valid.map((r) => [Number(r[0]), r[3]]));
          const [lo, hi] = valid.length ? [valid[0][1], valid[0][2]] : [0, 0];
          const w = (hi - lo) / 30;
          const nb = w ? 30 : 1;
          points = Array.from({ length: nb }, (_, b) => ({ x: fmtNumber(lo + b * w, 3), y: counts.get(b) || 0 }));
          yLabel = 'rows';
        } else {
          const iy = res.columns.findIndex((c) => c.name === 'y');
          const is = res.columns.findIndex((c) => c.name === 's');
          points = res.rows.map((r) => ({ x: r[0], y: r[iy], series: is >= 0 ? String(r[is] ?? '∅') : '' }));
        }
        const chartType = opts.type === 'histogram' ? 'histogram' : opts.type;
        renderChart(out, { type: chartType, points, xLabel: opts.type === 'histogram' ? opts.y : opts.x, yLabel });
        if (res.rows.length >= CHART_LIMIT) out.append(h('p.muted.small', `Showing the first ${fmtNumber(CHART_LIMIT)} points.`));
      } catch (e) {
        out.replaceChildren(h('div.error-box', String(e.message || e)));
      }
    }
    sync();
    draw();
    return h('div', controls, out);
  }

  function statsPanel() {
    if (!result.chartable) return h('p.muted', 'Statistics work on SELECT queries.');
    const out = h('div', h('p.muted', h('span.spinner'), ' Profiling…'));
    (async () => {
      try {
        const summary = await duck.query(cfg, `SUMMARIZE SELECT * FROM (\n${lastSql}\n)`);
        const numeric = result.columns.filter((c) => c.numeric).slice(0, 8);
        let corr = null;
        if (numeric.length >= 2) {
          const pairs = [];
          numeric.forEach((a, i) => numeric.forEach((b, j) => { if (j > i) pairs.push([a.name, b.name]); }));
          const res = await duck.query(cfg, `SELECT ${pairs.map(([a, b], i) => `corr(${sqlIdent(a)}, ${sqlIdent(b)}) AS c${i}`).join(', ')} FROM (\n${lastSql}\n)`);
          const val = Object.fromEntries(pairs.map(([a, b], i) => [`${a}\u0000${b}`, res.rows[0][i]]));
          const get = (a, b) => (a === b ? 1 : val[`${a}\u0000${b}`] ?? val[`${b}\u0000${a}`]);
          corr = h(
            'div',
            h('h4', 'Correlation (Pearson)'),
            h(
              'div.table-scroll',
              h(
                'table.data.corr',
                h('thead', h('tr', h('th', ''), numeric.map((c) => h('th.num', c.name)))),
                h(
                  'tbody',
                  numeric.map((a) =>
                    h(
                      'tr',
                      h('th', a.name),
                      numeric.map((b) => {
                        const v = get(a.name, b.name);
                        const pct = v == null ? 0 : Math.round(Math.abs(v) * 70);
                        const hue = v >= 0 ? 'var(--div-pos)' : 'var(--div-neg)';
                        return h('td.num', { style: { background: `color-mix(in oklab, ${hue} ${pct}%, transparent)` } }, v == null ? '' : v.toFixed(2));
                      }),
                    ),
                  ),
                ),
              ),
            ),
          );
        }
        out.replaceChildren(...[h('h4', 'Column summary'), resultTable(summary), corr].filter(Boolean));
      } catch (e) {
        out.replaceChildren(h('div.error-box', String(e.message || e)));
      }
    })();
    return out;
  }

  // ---- join helper --------------------------------------------------------

  async function openJoin(hint) {
    const tables = duck.registered();
    if (tables.length < 2) {
      joinBox.hidden = false;
      joinBox.replaceChildren(h('p.small', 'Add at least two tables to build a join.'), h('button.btn.ghost.small', { onclick: () => (joinBox.hidden = true) }, 'Close'));
      return;
    }
    const colsOf = Object.fromEntries(await Promise.all(tables.map(async (t) => [t.name, (await duck.columns(cfg, t.name)).map((c) => c.name)])));
    const h0 = parseJoinHint(hint);
    const pick = { lt: tables[0].name, rt: tables[1].name, lk: '', rk: '', kind: 'LEFT' };
    if (h0 && colsOf[h0.lt] && colsOf[h0.rt]) Object.assign(pick, h0);
    const suggest = () => {
      if (pick.lk && colsOf[pick.lt].includes(pick.lk) && pick.rk && colsOf[pick.rt].includes(pick.rk)) return;
      const common = colsOf[pick.lt].filter((c) => colsOf[pick.rt].includes(c));
      const best = common.find((c) => /(_id|_code|_key|^id|^code|^key)$/i.test(c)) || common[0];
      pick.lk = best || colsOf[pick.lt][0];
      pick.rk = best || colsOf[pick.rt][0];
    };
    const draw = () => {
      suggest();
      const s = (key, values) =>
        h('select', { onchange: (e) => { pick[key] = e.target.value; if (key === 'lt' || key === 'rt') { pick.lk = ''; pick.rk = ''; } draw(); } }, values.map((v) => h('option', { value: v, selected: v === pick[key] }, v)));
      joinBox.replaceChildren(
        h('strong', 'Join helper'),
        h(
          'div.join-row',
          s('lt', tables.map((t) => t.name)), h('span', '.'), s('lk', colsOf[pick.lt]),
          s('kind', ['LEFT', 'INNER', 'FULL']), h('span', 'JOIN'),
          s('rt', tables.map((t) => t.name)), h('span', '.'), s('rk', colsOf[pick.rt]),
        ),
        h(
          'div.actions',
          h('button.btn.primary.small', { onclick: () => { editor.value = joinSql(pick.lt, pick.lk, pick.rt, pick.rk, pick.kind); joinBox.hidden = true; run(); } }, 'Write query and run'),
          h('button.btn.ghost.small', { onclick: () => (joinBox.hidden = true) }, 'Close'),
        ),
      );
    };
    draw();
    joinBox.hidden = false;
  }

  // ---- layout and startup -------------------------------------------------

  const el = h(
    'div.page.explore',
    h('div.explore-head', h('h1', 'Explore'), h('p.muted', 'Query any file in the catalog with SQL, right in your browser (DuckDB). Nothing is uploaded anywhere.')),
    h(
      'div.explore-grid',
      h(
        'aside.explore-side',
        h('div.picker-row', picker, h('button.btn.small', { onclick: () => picker.value && addTable(picker.value).then(() => (picker.value = '')) }, 'Add')),
        tablesEl,
      ),
      h(
        'section.explore-main',
        editor,
        h(
          'div.toolbar',
          h('button.btn.primary', { onclick: run, title: 'Ctrl/Cmd + Enter' }, 'Run'),
          h('button.btn', { onclick: () => openJoin() }, 'Join helper'),
          h('button.btn.ghost', { onclick: (e) => { syncUrl(); copyText(location.href, e.currentTarget); } }, 'Copy link'),
          h('button.btn.ghost', { onclick: () => result && downloadCSV(result, 'query-result.csv') }, 'Download CSV'),
          runInfo,
        ),
        joinBox,
        tabs,
        panel,
      ),
    ),
  );

  drawTabs();
  drawTables();
  panel.replaceChildren(h('p.muted', 'Run a query to see results. Ctrl/Cmd + Enter runs it.'));

  (async () => {
    const keys = (query.get('t') || '').split(',').filter(Boolean);
    const q = query.get('q');
    if (q) editor.value = q;
    for (const k of keys) await addTable(k, { quiet: Boolean(q) || keys.length > 1 });
    const hint = parseJoinHint(query.get('join'));
    const names = duck.registered().map((t) => t.name);
    if (!q && hint && names.includes(hint.lt) && names.includes(hint.rt)) {
      editor.value = joinSql(hint.lt, hint.lk, hint.rt, hint.rk);
    } else if (!q && keys.length > 1 && names.length) {
      editor.value = `SELECT *\nFROM ${sqlIdent(names[0])}\nLIMIT 100`;
    }
    if (editor.value.trim() && keys.length) run();
  })();

  return { el };
}

function groupBy(list, fn) {
  const out = {};
  for (const x of list) (out[fn(x)] ||= []).push(x);
  return out;
}
