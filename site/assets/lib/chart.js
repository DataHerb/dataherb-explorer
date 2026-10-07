// Dependency-free SVG charts: bar, line, scatter, histogram.
// Colours come from CSS custom properties (--series-1..8) so light/dark themes work.

import { fmtNumber, h } from './util.js';

const NS = 'http://www.w3.org/2000/svg';
const MAX_SERIES = 8;
const W = 860;
const H = 360;
const M = { top: 16, right: 20, bottom: 56, left: 64 };

function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of children.flat()) if (c != null) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

/** "Nice" tick values covering [lo, hi]. */
export function ticks(lo, hi, count = 5) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (lo === hi) {
    const pad = Math.abs(lo) || 1;
    lo -= pad;
    hi += pad;
  }
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw) || raw;
  const out = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(12));
  if (out[out.length - 1] < hi) out.push(out[out.length - 1] + step);
  return out;
}

const isNum = (v) => v !== null && v !== '' && Number.isFinite(Number(v));
const asTime = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? Date.parse(v) : NaN);

function shortLabel(v, max = 14) {
  const str = isNum(v) ? fmtNumber(v) : String(v ?? '∅');
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function fmtTimeTick(ms, span) {
  const d = new Date(ms);
  if (span > 86400e3 * 400) return d.toISOString().slice(0, 7);
  if (span > 86400e3 * 2) return d.toISOString().slice(0, 10);
  return d.toISOString().slice(11, 16);
}

/**
 * Render a chart into `target`.
 * spec: { type: 'bar'|'line'|'scatter'|'histogram', points: [{x, y, series}], xLabel, yLabel }
 */
export function renderChart(target, spec) {
  const { type, xLabel = '', yLabel = '' } = spec;
  let points = spec.points.filter((p) => isNum(p.y) && p.x !== undefined);
  if (!points.length) {
    target.replaceChildren(h('p.muted', 'Nothing to plot: no rows with a numeric value.'));
    return;
  }

  // Series: keep the 7 largest, fold the rest into "Other" (never invent a 9th hue).
  let seriesNames = [...new Set(points.map((p) => p.series ?? ''))];
  if (seriesNames.length > MAX_SERIES) {
    const totals = new Map();
    for (const p of points) totals.set(p.series, (totals.get(p.series) || 0) + Math.abs(Number(p.y)));
    const keep = new Set([...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_SERIES - 1).map((e) => e[0]));
    points = points.map((p) => (keep.has(p.series) ? p : { ...p, series: 'Other' }));
    if (type === 'bar' || type === 'line') {
      const agg = new Map();
      for (const p of points) {
        const k = `${p.series}\u0000${p.x}`;
        const prev = agg.get(k);
        agg.set(k, prev ? { ...prev, y: Number(prev.y) + Number(p.y) } : { ...p });
      }
      points = [...agg.values()];
    }
    seriesNames = [...keep, 'Other'];
  }
  const multi = seriesNames.length > 1;
  const color = (name) => `var(--series-${(seriesNames.indexOf(name ?? '') % MAX_SERIES) + 1})`;

  // X scale
  const band = type === 'bar' || type === 'histogram' || !points.every((p) => isNum(p.x) || !Number.isNaN(asTime(p.x)));
  const temporal = !band && points.every((p) => !isNum(p.x) && !Number.isNaN(asTime(p.x)));
  const xv = (p) => (temporal ? asTime(p.x) : Number(p.x));
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  let xScale;
  let xTicks;
  let bandWidth = 0;
  let categories = [];
  if (band) {
    categories = [...new Set(points.map((p) => p.x))];
    if (type !== 'histogram' && categories.every(isNum)) categories.sort((a, b) => a - b);
    bandWidth = iw / categories.length;
    const idx = new Map(categories.map((c, i) => [c, i]));
    xScale = (v) => M.left + idx.get(v) * bandWidth;
    const every = Math.ceil(categories.length / Math.floor(iw / 70));
    xTicks = categories.filter((_, i) => i % every === 0).map((c) => ({ pos: xScale(c) + bandWidth / 2, label: shortLabel(c) }));
  } else {
    const xs = points.map(xv);
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    const span = hi - lo || 1;
    xScale = (v) => M.left + ((v - lo) / span) * iw;
    xTicks = temporal
      ? Array.from({ length: 6 }, (_, i) => lo + (span * i) / 5).map((v) => ({ pos: xScale(v), label: fmtTimeTick(v, span) }))
      : ticks(lo, hi, 6).filter((v) => v >= lo && v <= hi).map((v) => ({ pos: xScale(v), label: fmtNumber(v) }));
  }

  // Y scale (bars and histograms always include zero)
  const ys = points.map((p) => Number(p.y));
  let ylo = Math.min(...ys);
  let yhi = Math.max(...ys);
  if (type !== 'scatter' || ylo > 0) ylo = Math.min(0, ylo);
  if (type !== 'scatter' || yhi < 0) yhi = Math.max(0, yhi);
  const yT = ticks(ylo, yhi, 5);
  ylo = yT[0];
  yhi = yT[yT.length - 1];
  const yScale = (v) => M.top + ih - ((v - ylo) / (yhi - ylo || 1)) * ih;

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `${type} chart of ${yLabel} by ${xLabel}` });
  // Grid and axes
  for (const v of yT) {
    svg.append(
      s('line', { x1: M.left, x2: W - M.right, y1: yScale(v), y2: yScale(v), class: v === 0 ? 'axis' : 'grid' }),
      s('text', { x: M.left - 8, y: yScale(v), class: 'tick', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, fmtNumber(v)),
    );
  }
  xTicks.forEach((t, i) => {
    const anchor = band ? 'middle' : i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle';
    svg.append(s('text', { x: t.pos, y: H - M.bottom + 18, class: 'tick', 'text-anchor': anchor }, t.label));
  });
  svg.append(
    s('line', { x1: M.left, x2: W - M.right, y1: M.top + ih, y2: M.top + ih, class: 'axis' }),
    s('text', { x: M.left + iw / 2, y: H - 12, class: 'axis-label', 'text-anchor': 'middle' }, xLabel),
    s('text', { x: 14, y: M.top + ih / 2, class: 'axis-label', 'text-anchor': 'middle', transform: `rotate(-90 14 ${M.top + ih / 2})` }, yLabel),
  );

  const tip = h('div.chart-tip', { hidden: true });
  const showTip = (evt, p) => {
    const lines = [`${xLabel}: ${shortLabel(p.x, 40)}`, `${yLabel}: ${fmtNumber(p.y)}`];
    if (multi) lines.unshift(String(p.series));
    tip.replaceChildren(...lines.map((l, i) => h(i === 0 ? 'strong' : 'div', l)));
    tip.hidden = false;
    const box = wrap.getBoundingClientRect();
    tip.style.left = `${Math.min(evt.clientX - box.left + 12, box.width - 180)}px`;
    tip.style.top = `${evt.clientY - box.top + 12}px`;
  };
  const hideTip = () => (tip.hidden = true);
  const hover = (el, p) => {
    el.addEventListener('mousemove', (e) => showTip(e, p));
    el.addEventListener('mouseleave', hideTip);
    return el;
  };

  const marks = s('g');
  if (type === 'bar' || type === 'histogram') {
    const n = type === 'histogram' ? 1 : seriesNames.length;
    const gap = type === 'histogram' ? 1 : Math.min(8, bandWidth * 0.2);
    const bw = Math.max(1, (bandWidth - gap * 2) / n);
    const zero = yScale(0);
    for (const p of points) {
      const i = type === 'histogram' ? 0 : seriesNames.indexOf(p.series ?? '');
      const x = xScale(p.x) + gap + i * bw;
      const y = yScale(Number(p.y));
      const rect = s('rect', {
        x: x + (n > 1 ? 1 : 0),
        y: Math.min(y, zero),
        width: Math.max(1, bw - (n > 1 ? 2 : 0)),
        height: Math.max(0.5, Math.abs(zero - y)),
        rx: Math.min(4, bw / 4),
        fill: color(p.series),
        class: 'mark',
      });
      marks.append(hover(rect, p));
    }
  } else if (type === 'line') {
    for (const name of seriesNames) {
      const pts = points.filter((p) => (p.series ?? '') === name).sort((a, b) => xv(a) - xv(b));
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${xScale(xv(p)).toFixed(1)},${yScale(Number(p.y)).toFixed(1)}`).join('');
      marks.append(s('path', { d, fill: 'none', stroke: color(name), 'stroke-width': 2, 'stroke-linejoin': 'round', class: 'line' }));
    }
    // Hover: nearest point along x
    const overlay = s('rect', { x: M.left, y: M.top, width: iw, height: ih, fill: 'transparent' });
    const cross = s('line', { y1: M.top, y2: M.top + ih, class: 'crosshair', visibility: 'hidden' });
    const dot = s('circle', { r: 4, class: 'hover-dot', visibility: 'hidden' });
    overlay.addEventListener('mousemove', (e) => {
      const box = svg.getBoundingClientRect();
      const mx = ((e.clientX - box.left) / box.width) * W;
      let best = null;
      for (const p of points) {
        const d = Math.abs(xScale(xv(p)) - mx);
        if (!best || d < best.d) best = { d, p };
      }
      if (!best) return;
      const px = xScale(xv(best.p));
      cross.setAttribute('x1', px);
      cross.setAttribute('x2', px);
      cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', px);
      dot.setAttribute('cy', yScale(Number(best.p.y)));
      dot.setAttribute('fill', color(best.p.series));
      dot.setAttribute('visibility', 'visible');
      showTip(e, best.p);
    });
    overlay.addEventListener('mouseleave', () => {
      hideTip();
      cross.setAttribute('visibility', 'hidden');
      dot.setAttribute('visibility', 'hidden');
    });
    marks.append(cross, dot, overlay);
  } else {
    for (const p of points.slice(0, 20000)) {
      const c = s('circle', { cx: xScale(xv(p)), cy: yScale(Number(p.y)), r: 4, fill: color(p.series), class: 'dot' });
      marks.append(hover(c, p));
    }
  }
  svg.append(marks);

  const legend = multi
    ? h('div.legend', seriesNames.map((n) => h('span.legend-item', h('span.swatch', { style: { background: color(n) } }), shortLabel(n, 24))))
    : null;
  const wrap = h('div.chart-wrap', legend, svg, tip);
  target.replaceChildren(wrap);
}
