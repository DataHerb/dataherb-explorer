// DOM and formatting helpers. No dependencies.

/** Create an element: h('div.card#id', {onclick}, child, 'text', [more]) */
export function h(tag, attrs, ...children) {
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(tag);
  const el = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g)) {
      if (part[0] === '.') el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') {
      for (const c of (Array.isArray(v) ? v : String(v).split(/\s+/)).filter(Boolean)) el.classList.add(c);
    }
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function mount(target, ...children) {
  target.replaceChildren();
  append(target, children);
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function fmtNumber(n, digits = 2) {
  if (n == null || n === '') return '';
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  if (Number.isInteger(x)) return x.toLocaleString();
  return x.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function fmtBytes(b) {
  if (b == null) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let x = Number(b);
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i++;
  }
  return `${x.toFixed(x < 10 && i ? 1 : 0)} ${units[i]}`;
}

export function fmtDuration(seconds) {
  if (seconds == null) return '';
  const s = Math.round(Number(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

export function timeAgo(iso, now = Date.now()) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = (now - t) / 1000;
  const fut = d < 0;
  const a = Math.abs(d);
  let s;
  if (a < 60) s = 'just now';
  else if (a < 3600) s = `${Math.floor(a / 60)} min`;
  else if (a < 86400) s = `${Math.floor(a / 3600)} h`;
  else if (a < 86400 * 60) s = `${Math.floor(a / 86400)} d`;
  else return new Date(t).toLocaleDateString();
  if (s === 'just now') return s;
  return fut ? `in ${s}` : `${s} ago`;
}

export function fmtTime(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? iso : t.toLocaleString();
}

export function debounce(fn, ms = 150) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    if (button) {
      const old = button.textContent;
      button.textContent = 'Copied';
      setTimeout(() => (button.textContent = old), 1200);
    }
  } catch {
    window.prompt('Copy:', text);
  }
}

export function absUrl(url) {
  try {
    return new URL(url, document.baseURI).href;
  } catch {
    return url;
  }
}

/** Parse "#/path?a=1&b=2" into { path: ['path'], query: URLSearchParams } */
export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#\/?/, '');
  const [p, q] = raw.split('?');
  return { path: p ? p.split('/').map(decodeURIComponent) : [], query: new URLSearchParams(q || '') };
}

export function link(path, query) {
  const q = query ? new URLSearchParams(query).toString() : '';
  return `#/${path.map(encodeURIComponent).join('/')}${q ? `?${q}` : ''}`;
}

/** Very small, safe Markdown subset: headings, lists, code, links, bold, italics, paragraphs. */
export function markdown(src) {
  if (!src) return '';
  const inline = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const out = [];
  let list = null;
  let code = null;
  for (const line of String(src).split('\n')) {
    if (code) {
      if (line.startsWith('```')) {
        out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
        code = null;
      } else code.push(line);
      continue;
    }
    if (line.startsWith('```')) {
      code = [];
      continue;
    }
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (li) {
      if (!list) {
        list = [];
        out.push(list);
      }
      list.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    list = null;
    const hd = /^(#{1,4})\s+(.*)$/.exec(line);
    if (hd) out.push(`<h${hd[1].length + 2}>${inline(hd[2])}</h${hd[1].length + 2}>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
    else out.push('');
  }
  if (code) out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
  return out.map((x) => (Array.isArray(x) ? `<ul>${x.join('')}</ul>` : x)).join('\n').replace(/<\/p>\n<p>/g, ' ');
}

export function sqlIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

export function sqlString(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}
