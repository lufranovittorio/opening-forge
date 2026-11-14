// Shared UI helpers.
import { BADGES } from './tree.js';

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const BOOK_SVG = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5a1.5 1.5 0 0 0 0 3H20v1H6.5A2.5 2.5 0 0 1 4 19.5z"/></svg>';

export function badge(kind, withLabel = false) {
  const b = BADGES[kind];
  if (!b) {
    const g = kind === 'hint' ? '➜' : 'i';
    return `<span class="badge badge-${kind}"><span class="badge-glyph">${g}</span></span>`;
  }
  const glyph = kind === 'book' ? BOOK_SVG : esc(b.glyph);
  return `<span class="badge badge-${kind}" title="${b.label}"><span class="badge-glyph">${glyph}</span>${withLabel ? `<span class="badge-label">${b.label}</span>` : ''}</span>`;
}

export const sideName = s => (s === 'w' ? 'White' : 'Black');
export const sidePill = s => `<span class="pill pill-${s}">${s === 'w' ? '♔' : '♚'} as ${sideName(s)}</span>`;

const modalRoot = () => document.getElementById('modal-root');
export function showModal(html) {
  modalRoot().innerHTML = `<div class="modal-backdrop"><div class="modal">${html}</div></div>`;
  modalRoot().querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));
}
export function closeModal() { modalRoot().innerHTML = ''; }

export function askPromotion(color) {
  const names = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' };
  return new Promise(resolve => {
    showModal(`<h2>Promote to…</h2><div class="promo">${Object.entries(names).map(([k, n]) =>
      `<button data-p="${k}" class="promo-btn"><span class="cg-wrap promo-piece"><piece class="${n} ${color === 'w' ? 'white' : 'black'}"></piece></span>${n}</button>`).join('')}</div>`);
    modalRoot().querySelectorAll('[data-p]').forEach(b => b.onclick = () => { closeModal(); resolve(b.dataset.p); });
  });
}

export function feedHTML(items) {
  return items.map(f => `
    <div class="feed-item feed-${f.kind}">
      ${badge(f.kind, !!BADGES[f.kind])}
      <div class="feed-body"><div>${f.html}</div>${f.comment ? `<div class="comment">${esc(f.comment)}</div>` : ''}${f.extra || ''}</div>
    </div>`).join('');
}

export function squareBadge(layer, square, kind, orientation) {
  if (!square) { layer.innerHTML = ''; return; }
  const f = square.charCodeAt(0) - 97;
  const r = +square[1] - 1;
  const x = orientation === 'white' ? f : 7 - f;
  const y = orientation === 'white' ? 7 - r : r;
  layer.innerHTML = `<div class="sq-badge" style="left:${(x + 1) * 12.5}%;top:${y * 12.5}%">${badge(kind)}</div>`;
}

export function destsOf(chess) {
  const dests = new Map();
  for (const m of chess.moves({ verbose: true })) {
    if (!dests.has(m.from)) dests.set(m.from, []);
    dests.get(m.from).push(m.to);
  }
  return dests;
}
