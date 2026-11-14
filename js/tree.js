// Parses the opening line notation and merges all lines of an opening into a move tree.
import { Chess } from '../vendor/chess.js';

const TOKEN = /\{[^}]*\}|\S+/g;
const NAG = /^(.*?)(!!|\?\?|!\?|\?!|!|\?)?$/;
const MOVENUM = /^\d+\.(\.\.)?/;

export function parseLine(text) {
  const out = [];
  for (const tok of text.match(TOKEN) || []) {
    if (tok.startsWith('{')) {
      if (out.length) out[out.length - 1].comment = tok.slice(1, -1).trim();
      continue;
    }
    const t = tok.replace(MOVENUM, '');
    if (!t) continue;
    const m = t.match(NAG);
    out.push({ san: m[1], nag: m[2] || '', comment: '' });
  }
  return out;
}

export function buildOpening(op) {
  const start = new Chess();
  const root = { san: null, ply: 0, fen: start.fen(), children: [], lines: [], parent: null, nag: '', comment: '' };
  op.lines.forEach((line, li) => {
    const chess = new Chess();
    let node = root;
    root.lines.push(li);
    const path = [root];
    for (const mv of parseLine(line.moves)) {
      const m = chess.move(mv.san);
      let child = node.children.find(c => c.san === m.san);
      if (!child) {
        child = {
          san: m.san, from: m.from, to: m.to, promotion: m.promotion, color: m.color,
          captured: !!m.captured, nag: mv.nag, comment: mv.comment, fen: chess.fen(),
          check: chess.inCheck(), mate: chess.isCheckmate(),
          ply: node.ply + 1, children: [], lines: [], parent: node,
        };
        node.children.push(child);
      } else {
        if (!child.nag && mv.nag) child.nag = mv.nag;
        if (!child.comment && mv.comment) child.comment = mv.comment;
      }
      child.lines.push(li);
      node = child;
      path.push(node);
    }
    line.path = path;
    line.key = `${op.id}::${line.name}`;
    line.index = li;
  });
  op.root = root;
  return op;
}

const OPP = { '??': 'blunder', '?': 'mistake', '?!': 'inaccuracy', '!?': 'interesting', '!': 'best', '!!': 'brilliant' };

// Classify a book move from the point of view of the learner.
export function classify(node, learner) {
  if (node.color === learner) {
    if (node.nag === '!!') return 'brilliant';
    if (node.nag === '!') return 'best';
    if (node.nag === '!?') return 'interesting';
    const prev = node.parent;
    if (prev && ['?', '??', '?!'].includes(prev.nag)) return 'best';
    return 'book';
  }
  return OPP[node.nag] || 'book';
}

export const BADGES = {
  brilliant:   { glyph: '!!', label: 'Brilliant' },
  best:        { glyph: '★',  label: 'Best' },
  excellent:   { glyph: '👍', label: 'Excellent' },
  good:        { glyph: '✓',  label: 'Good' },
  book:        { glyph: '📖', label: 'Book' },
  interesting: { glyph: '!?', label: 'Interesting' },
  inaccuracy:  { glyph: '?!', label: 'Inaccuracy' },
  mistake:     { glyph: '?',  label: 'Mistake' },
  blunder:     { glyph: '??', label: 'Blunder' },
  wrong:       { glyph: '✕',  label: 'Not book' },
};

export function moveLabel(node) {
  const n = Math.floor((node.ply - 1) / 2) + 1;
  return node.color === 'w' ? `${n}.${node.san}` : `${n}…${node.san}`;
}
