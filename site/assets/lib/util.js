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

/**
 * Small, safe Markdown renderer for catalog entry bodies and dataset docs.
 * Everything is escaped first. Supports headings, paragraphs, bullet and
 * numbered lists, tables, block quotes, fenced code, rules, and inline code,
 * bold, italics, links (http(s), mailto, relative) and images (http(s)).
 */
export function markdown(src) {
  if (!src) return '';
  const url = (u) => (/^(https?:|mailto:|#|\.{0,2}\/|[\w.-]+(\/|$))/i.test(u) && !/^javascript:/i.test(u) ? u : '#');
  const inline = (s) => {
    const codes = [];
    let t = esc(s).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
    t = t
      .replace(/!\[([^\]]*)\]\((https?:[^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => `<a href="${url(href)}" target="_blank" rel="noopener">${label}</a>`)
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/(^|[^\w])_([^_\s][^_]*)_(?!\w)/g, '$1<em>$2</em>');
    return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
  };
  const cells = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const code = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]);
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      i++;
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const hd = /^(#{1,6})\s+(.*?)\s*#*$/.exec(line);
    if (hd) {
      const n = Math.min(hd[1].length + 2, 6);
      out.push(`<h${n}>${inline(hd[2])}</h${n}>`);
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || '')) {
      const align = cells(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : ''));
      const td = (tag, c, j) => `<${tag}${align[j] ? ` style="text-align:${align[j]}"` : ''}>${inline(c)}</${tag}>`;
      const head = cells(line).map((c, j) => td('th', c, j)).join('');
      const body = [];
      for (i += 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) body.push(`<tr>${cells(lines[i]).map((c, j) => td('td', c, j)).join('')}</tr>`);
      out.push(`<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body.join('')}</tbody></table></div>`);
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) quote.push(lines[i].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${markdown(quote.join('\n'))}</blockquote>`);
      continue;
    }
    const item = /^\s*([-*+]|\d+[.)])\s+(.*)$/;
    const li = item.exec(line);
    if (li) {
      const ordered = /\d/.test(li[1]);
      const items = [];
      while (i < lines.length) {
        const m = item.exec(lines[i]);
        if (m && /\d/.test(m[1]) === ordered) items.push(m[2]);
        else if (items.length && /^\s{2,}\S/.test(lines[i])) items[items.length - 1] += ` ${lines[i].trim()}`;
        else break;
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      const start = ordered && parseInt(li[1], 10) !== 1 ? ` start="${parseInt(li[1], 10)}"` : '';
      out.push(`<${tag}${start}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`);
      continue;
    }
    const para = [];
    for (; i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*>|\s*([-*+]|\d+[.)])\s|\s*\|.*\|\s*$|\s*([-*_])(\s*\3){2,}\s*$)/.test(lines[i]); i++) para.push(lines[i].trim());
    if (!para.length) para.push(lines[i++].trim());
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

export function sqlIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

export function sqlString(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}
