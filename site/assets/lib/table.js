// Result table with client-side sort, CSV download and row count.

import { fmtNumber, h } from './util.js';

function csvCell(v) {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(result) {
  const head = result.columns.map((c) => csvCell(c.name)).join(',');
  return [head, ...result.rows.map((r) => r.map(csvCell).join(','))].join('\n');
}

export function downloadCSV(result, filename = 'result.csv') {
  const blob = new Blob([toCSV(result)], { type: 'text/csv' });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

function cell(v, col) {
  if (v == null) return h('td.null', 'null');
  if (col.numeric && typeof v === 'number') return h('td.num', fmtNumber(v, 4));
  if (typeof v === 'object') return h('td', JSON.stringify(v));
  if (typeof v === 'string' && /^-?\d+\.\d{5,}$/.test(v)) return h('td.num', fmtNumber(Number(v), 4));
  return h('td', String(v));
}

/** Render rows (up to `limit`) into a scrollable table element. */
export function resultTable(result, { limit = 200 } = {}) {
  let sortCol = -1;
  let dir = 1;
  const tbody = h('tbody');
  const draw = () => {
    let rows = result.rows;
    if (sortCol >= 0) {
      rows = [...rows].sort((a, b) => {
        const x = a[sortCol];
        const y = b[sortCol];
        if (x == null) return 1;
        if (y == null) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * dir;
      });
    }
    tbody.replaceChildren(...rows.slice(0, limit).map((r) => h('tr', r.map((v, i) => cell(v, result.columns[i])))));
  };
  const head = h(
    'tr',
    result.columns.map((c, i) =>
      h(
        'th',
        {
          class: c.numeric ? 'num' : '',
          title: `${c.type}. Click to sort the rows shown.`,
          onclick: (e) => {
            dir = sortCol === i ? -dir : 1;
            sortCol = i;
            for (const th of e.currentTarget.parentNode.children) th.removeAttribute('aria-sort');
            e.currentTarget.setAttribute('aria-sort', dir > 0 ? 'ascending' : 'descending');
            draw();
          },
        },
        c.name,
        h('span.coltype', c.type.replace(/<.*>/, '')),
      ),
    ),
  );
  draw();
  const total = result.total ?? result.rows.length;
  const note =
    total > limit
      ? h(
          'p.muted.small',
          `Showing ${fmtNumber(Math.min(limit, result.rows.length))} of ${fmtNumber(total)} rows.`,
          total > result.rows.length ? ` Download CSV includes the first ${fmtNumber(result.rows.length)}; aggregate or filter in SQL for the rest.` : '',
        )
      : null;
  return h('div', h('div.table-scroll', h('table.data', h('thead', head), tbody)), note);
}
