// "Understand the opening" free-play mode: the opponent may play book moves, random moves or plain
// blunders, and the learner must always find a good move. Off-book moves are judged by Stockfish.
import { Chess } from '../vendor/chess.js';
import { Chessground } from '../vendor/chessground.min.js';
import { classify } from './tree.js';
import * as store from './store.js';
import { sound } from './sound.js';
import { getEngine, winPct, lossKind, fmtScore } from './engine.js';
import { moveConcepts, whyBad, uciToMove } from './concepts.js';
import { esc, badge, feedHTML, squareBadge, destsOf, askPromotion, showModal } from './ui.js';

const ACCEPT = {
  relaxed: ['best', 'excellent', 'good', 'inaccuracy'],
  normal: ['best', 'excellent', 'good'],
  strict: ['best', 'excellent'],
};
const RAND = {
  low: { book: 0.85, random: 0.05, top: 0.6 },
  mid: { book: 0.6, random: 0.2, top: 0.3 },
  high: { book: 0.35, random: 0.45, top: 0.2 },
};
const PRAISE = {
  book: 'Book move.', best: 'Best move!', brilliant: 'Brilliant!', excellent: 'Excellent!',
  good: 'Good move.', inaccuracy: 'Playable, but there was something better.', interesting: 'Interesting!',
};
const BAD = ['inaccuracy', 'mistake', 'blunder'];
const LENGTH = { 20: 20, 30: 30, 40: 40 };
const uciOf = m => m.from + m.to + (m.promotion || '');
const label = (m, ply) => { const n = Math.floor((ply - 1) / 2) + 1; return m.color === 'w' ? `${n}.${m.san}` : `${n}…${m.san}`; };

export class FreePlay {
  constructor(op, ctx) {
    this.op = op;
    this.ctx = ctx;
    this.learner = op.side;
    this.orientation = op.side === 'w' ? 'white' : 'black';
    this.gen = 0;
    this.timers = [];
    this.$ = id => document.getElementById(id);
    const s = store.get().settings;
    s.freeRandom = s.freeRandom || 'mid';
    s.freeStrict = s.freeStrict || 'normal';
    s.freeLength = s.freeLength || 30;

    this.$('board-controls').innerHTML = `
      <button class="btn btn-ghost" id="btn-hint" title="Show a good move (H)">💡 Hint</button>
      <button class="btn btn-ghost" id="btn-flip" title="Flip board (F)">⇅ Flip</button>
      <button class="btn btn-primary" id="btn-new" title="New game (N)">New game ↻</button>`;
    this.$('panel-body').innerHTML = `
      <div class="mode-row"><span class="muted lbl">Opponent</span>
        <div class="seg seg-sm" id="fp-rand">
          <button data-v="low" title="Mostly book moves, sometimes a strange one">Book-ish</button>
          <button data-v="mid" title="Book moves mixed with random and bad moves">Mixed</button>
          <button data-v="high" title="Lots of random and terrible moves to punish">Chaos</button>
        </div><button class="icon-btn" id="btn-sound" title="Toggle sound"></button></div>
      <div class="mode-row"><span class="muted lbl">Strictness</span>
        <div class="seg seg-sm" id="fp-strict">
          <button data-v="relaxed" title="Inaccuracies are accepted">Relaxed</button>
          <button data-v="normal" title="Good moves or better are accepted">Normal</button>
          <button data-v="strict" title="Only the best or excellent moves">Strict</button>
        </div></div>
      <div class="mode-row"><span class="muted lbl">Game length</span>
        <div class="seg seg-sm" id="fp-len">
          <button data-v="20">10 moves</button><button data-v="30">15 moves</button><button data-v="40">20 moves</button>
        </div></div>
      <label class="toggle-row"><input type="checkbox" id="fp-arrow"> <span>Always show a good move (learning wheels)</span></label>
      <p class="muted small mode-note">Your opponent may follow the book, wander off it, or blunder outright. Every move you make is checked by Stockfish: find a good move to continue, and punish the mistakes.</p>
      <div class="fp-status" id="fp-status"></div>
      <div class="evalrow"><div class="evalbar"><div id="eval-fill"></div></div><span id="eval-text" class="muted small">—</span></div>
      <div class="feed" id="feed"></div>
      <div class="moves" id="moves"></div>
      <div class="fp-score" id="fp-score"></div>`;

    this.cg = Chessground(this.$('board'), {
      orientation: this.orientation,
      coordinates: true,
      animation: { enabled: true, duration: 220 },
      highlight: { lastMove: true, check: true },
      movable: { free: false, showDests: true, events: { after: (o, d) => this.onUserMove(o, d) } },
      premovable: { enabled: false },
      drawable: { enabled: true, visible: true },
    });

    const seg = (id, key, after) => {
      const el = this.$(id);
      const draw = () => el.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(s[key]) === b.dataset.v));
      el.querySelectorAll('button').forEach(b => b.onclick = () => { s[key] = key === 'freeLength' ? +b.dataset.v : b.dataset.v; store.save(); draw(); after && after(); });
      draw();
    };
    seg('fp-rand', 'freeRandom');
    seg('fp-strict', 'freeStrict');
    seg('fp-len', 'freeLength', () => this.drawScore());
    const arrow = this.$('fp-arrow');
    arrow.checked = !!s.freeArrow;
    arrow.onchange = () => { s.freeArrow = arrow.checked; store.save(); if (arrow.checked) this.hint(false); else this.cg.setAutoShapes([]); };
    const drawSound = () => { this.$('btn-sound').textContent = s.sound ? '🔊' : '🔇'; };
    this.$('btn-sound').onclick = () => { s.sound = !s.sound; store.save(); drawSound(); };
    drawSound();
    this.$('btn-hint').onclick = () => this.hint(true);
    this.$('btn-flip').onclick = () => this.flip();
    this.$('btn-new').onclick = () => this.start();
    this.onKey = e => {
      if (e.target.matches('input, textarea') || e.ctrlKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === 'h') this.hint(true);
      else if (k === 'n') this.start();
      else if (k === 'f') this.flip();
    };
    document.addEventListener('keydown', this.onKey);

    this.setStatus('⏳ Loading the Stockfish engine (≈7 MB, only the first time)…');
    this.cg.set({ movable: { color: undefined } });
    getEngine().then(e => { if (this.dead) return; this.engine = e; this.start(); })
      .catch(err => { console.error(err); this.setStatus('⚠️ The engine could not be loaded in this browser. Use Book lines mode instead.'); });
  }

  destroy() {
    this.dead = true;
    this.gen++;
    this.timers.forEach(clearTimeout);
    document.removeEventListener('keydown', this.onKey);
    this.cg.destroy();
  }

  later(fn, ms) { this.timers.push(setTimeout(fn, ms)); }
  sleep(ms) { return new Promise(r => this.later(r, ms)); }
  settings() { return store.get().settings; }

  start() {
    if (!this.engine) return;
    this.gen++;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.chess = new Chess();
    this.node = this.op.root;
    this.leftBookAt = null;
    this.played = [];
    this.myLanding = [];
    this.oppLastKind = null;
    this.stats = { my: 0, first: 0, book: 0, punished: 0, oppErrors: 0, errors: 0 };
    this.feed = [{ kind: 'info', html: `<b>New game.</b> ${this.learner === 'b' ? 'Your opponent moves first.' : 'You have the white pieces — start the opening!'} Stay in the book if you can; when the opponent leaves it, play by principles.` }];
    this.cg.set({ fen: this.chess.fen(), orientation: this.orientation, lastMove: undefined, check: false, turnColor: 'white', movable: { color: undefined, dests: new Map() } });
    this.cg.setAutoShapes([]);
    squareBadge(this.$('badge-layer'), null);
    this.$('btn-new').classList.remove('pulse');
    this.drawEval(20, null);
    this.drawAll();
    this.next();
  }

  over() {
    return this.chess.isGameOver() || this.chess.history().length >= this.settings().freeLength;
  }

  next() {
    if (this.over()) return this.finish();
    if (this.chess.turn() === this.learner) this.learnerTurn();
    else this.opponentTurn();
  }

  // ------------------------------------------------------------------ opponent
  trunkPly() {
    if (this._trunk === undefined) {
      let n = this.op.root;
      while (n.children.length === 1) n = n.children[0];
      this._trunk = Math.max(n.ply, 2);
    }
    return this._trunk;
  }

  async opponentTurn() {
    const g = this.gen;
    this.lock();
    const fen = this.chess.fen();
    const cfg = RAND[this.settings().freeRandom];
    const kids = this.node ? this.node.children : [];
    const t0 = Date.now();
    let pick;
    // Always follow the opening's shared trunk (the moves every line has in common)
    // so the game actually reaches the opening before the opponent starts improvising.
    const inTrunk = this.node && this.node.ply < this.trunkPly();
    if (kids.length && (inTrunk || Math.random() < cfg.book)) {
      const c = kids[Math.floor(Math.random() * kids.length)];
      pick = { san: c.san, kind: classify(c, this.learner), comment: c.comment, node: c };
    } else {
      const lines = await this.engine.analyse(fen, { depth: 9, multipv: 4 });
      if (g !== this.gen) return;
      let uci;
      const r = Math.random();
      if (r < cfg.random || !lines.length) {
        const legal = this.chess.moves({ verbose: true });
        uci = uciOf(legal[Math.floor(Math.random() * legal.length)]);
      } else if (r < cfg.random + cfg.top) uci = lines[0].uci;
      else uci = lines[Math.floor(Math.random() * lines.length)].uci;
      const mv = uciToMove(fen, uci);
      const bookChild = kids.find(c => c.san === mv.san);
      if (bookChild) pick = { san: mv.san, kind: classify(bookChild, this.learner), comment: bookChild.comment, node: bookChild };
      else {
        const best = lines[0];
        let score = lines.find(l => l.uci === uci)?.score;
        if (score === undefined) score = await this.scoreAfter(fen, mv, 9);
        if (g !== this.gen) return;
        const loss = best ? winPct(best.score) - winPct(score) : 0;
        pick = { san: mv.san, kind: lossKind(loss, best && best.uci === uci), comment: '', node: null };
      }
    }
    const wait = 650 - (Date.now() - t0);
    if (wait > 0) await this.sleep(wait);
    if (g !== this.gen) return;

    const wasInBook = !!this.node;
    const m = this.chess.move(pick.san);
    this.node = pick.node;
    if (wasInBook && !this.node) this.leftBookAt = this.chess.history().length;
    this.played.push({ m, kind: pick.kind, mine: false, ply: this.chess.history().length });
    this.showMove(m, pick.kind);
    this.oppLastKind = pick.kind;
    const bad = BAD.includes(pick.kind);
    if (bad) this.stats.oppErrors++;
    let html = `Opponent played <b>${label(m, this.chess.history().length)}</b>`;
    if (this.node) html += ' <span class="tag-book">book</span>';
    else if (wasInBook) html += ' — <b>out of the book!</b> Now think for yourself.';
    if (bad && !this.over()) html += ` — <b>punish it!</b>`;
    this.feed = [...this.feed.filter(f => f.mine), { kind: pick.kind, html, comment: pick.comment }];
    this.drawAll();
    this.next();
  }

  async scoreAfter(fen, mv, depth) {
    const after = new Chess(fen);
    after.move(mv.san);
    if (after.isCheckmate()) return 10000;
    if (after.isDraw()) return 0;
    const a = await this.engine.analyse(after.fen(), { depth });
    this.lastAfter = { fen: after.fen(), lines: a };
    return a.length ? -a[0].score : 0;
  }

  // ------------------------------------------------------------------ learner
  learnerTurn() {
    const g = this.gen;
    this.attempts = 0;
    this.fen = this.chess.fen();
    this.bestLines = null;
    this.analysis = this.engine.analyse(this.fen, { depth: 12, multipv: 3 });
    this.analysis.then(lines => {
      if (g !== this.gen || this.chess.fen() !== this.fen) return;
      this.bestLines = lines;
      if (lines[0]) this.drawEval(this.learner === 'w' ? lines[0].score : -lines[0].score, lines[0].mate == null ? null : (this.learner === 'w' ? lines[0].mate : -lines[0].mate));
      if (this.settings().freeArrow) this.hint(false);
    });
    this.cg.set({
      turnColor: this.learner === 'w' ? 'white' : 'black',
      movable: { color: this.learner === 'w' ? 'white' : 'black', dests: destsOf(this.chess) },
    });
    if (this.settings().freeArrow) this.hint(false);
  }

  lock() { this.cg.set({ movable: { color: undefined, dests: new Map() } }); }

  bookReply() {
    return this.node ? this.node.children.find(c => c.color === this.learner) : null;
  }

  async hint(announce) {
    if (!this.chess || this.over() || this.chess.turn() !== this.learner) return;
    const g = this.gen;
    const book = this.bookReply();
    let from, to, san;
    if (book) ({ from, to, san } = book);
    else {
      const lines = this.bestLines || await this.analysis;
      if (g !== this.gen || !lines?.length) return;
      const m = uciToMove(this.fen, lines[0].uci);
      if (!m) return;
      ({ from, to, san } = m);
    }
    this.cg.setAutoShapes([{ orig: from, dest: to, brush: 'green' }]);
    if (announce) {
      if (!this.settings().freeArrow) this.usedHint = true;
      this.feed = this.feed.filter(f => f.kind !== 'hint');
      this.feed.push({ kind: 'hint', html: `${book ? 'Book move' : 'Engine suggestion'}: <b>${esc(san)}</b>.`, comment: book?.comment || '' });
      this.drawFeed();
    }
  }

  async onUserMove(orig, dest) {
    const g = this.gen;
    const piece = this.chess.get(orig);
    let promo;
    if (piece && piece.type === 'p' && (dest[1] === '8' || dest[1] === '1')) promo = await askPromotion(this.learner);
    if (g !== this.gen) return;
    this.lock();
    const fen = this.fen;
    const mv = uciToMove(fen, orig + dest + (promo || ''));
    if (!mv) { this.cg.set({ fen }); return this.learnerTurn(); }
    const bookChild = this.node?.children.find(c => c.san === mv.san && c.color === this.learner);
    let kind; let best = null; let score = null; let pvAfter = null;
    if (bookChild) {
      kind = classify(bookChild, this.learner);
    } else {
      this.setStatus('🤔 Checking your move…');
      const lines = await this.analysis;
      if (g !== this.gen) return;
      best = lines[0];
      const hit = lines.find(l => l.uci === uciOf(mv));
      if (hit) { score = hit.score; pvAfter = hit.pv.slice(1); }
      else {
        this.lastAfter = null;
        score = await this.scoreAfter(fen, mv, 11);
        if (g !== this.gen) return;
        pvAfter = this.lastAfter?.lines[0]?.pv || [];
      }
      const loss = best ? winPct(best.score) - winPct(score) : 0;
      kind = lossKind(loss, best && best.uci === uciOf(mv));
    }
    const ok = !!bookChild || ACCEPT[this.settings().freeStrict].includes(kind);
    if (ok) this.accept(mv, kind, bookChild, best, score);
    else this.reject(mv, kind, best, score, pvAfter);
  }

  accept(mv, kind, bookChild, best, score) {
    const fen = this.fen;
    const bookAlt = !bookChild ? this.bookReply() : null;
    const m = this.chess.move(mv.san);
    const wasInBook = !!this.node;
    this.node = bookChild || null;
    if (wasInBook && !this.node) this.leftBookAt = this.chess.history().length;
    this.myLanding = this.myLanding.filter(s => s !== m.from).concat(m.to);
    this.played.push({ m, kind, mine: true, ply: this.chess.history().length });
    this.showMove(m, kind);
    this.stats.my++;
    if (this.attempts === 0 && !this.usedHint) this.stats.first++;
    if (bookChild) this.stats.book++;
    if (BAD.includes(this.oppLastKind) && ['best', 'excellent', 'brilliant'].includes(kind)) this.stats.punished++;
    this.usedHint = false;
    if (this.attempts === 0) sound.good();
    let html = `<b>${label(m, this.chess.history().length)}</b> — ${PRAISE[kind] || 'Good.'}`;
    if (!bookChild && best && best.uci !== uciOf(m)) {
      const bm = uciToMove(fen, best.uci);
      if (bm && kind !== 'best') html += ` Stockfish slightly preferred <b>${esc(bm.san)}</b>.`;
    }
    if (bookChild) html += ' <span class="tag-book">book</span>';
    else if (bookAlt) html += ` <span class="reveal">You left the book: in the ${esc(this.op.name)} the main move here is <b>${esc(bookAlt.san)}</b>.</span>`;
    else if (wasInBook) html += ' <span class="muted">(your own path — out of book)</span>';
    if (score != null) this.drawEval(this.learner === 'w' ? score : -score, null);
    this.feed = [{ kind, html, comment: bookChild?.comment || '', mine: true, extra: this.conceptsHTML(moveConcepts(fen, m)) }];
    this.drawAll();
    this.next();
  }

  reject(mv, kind, best, score, pvAfter) {
    const g = this.gen;
    this.attempts++;
    this.stats.errors++;
    sound.wrong();
    squareBadge(this.$('badge-layer'), mv.to, kind, this.orientation);
    const after = new Chess(this.fen);
    after.move(mv.san);
    let reply = null, replyCaptured = null;
    if (pvAfter && pvAfter[0]) {
      const r = uciToMove(after.fen(), pvAfter[0]);
      if (r) { reply = r.san; replyCaptured = r.captured || null; }
    }
    const reasons = whyBad({
      beforeFen: this.fen, move: mv, reply, replyCaptured,
      mateAgainst: score != null && score <= -9000,
      myHistory: this.myLanding, oppLastKind: this.oppLastKind,
    });
    const bm = best ? uciToMove(this.fen, best.uci) : null;
    let html = `<b>${esc(mv.san)}</b> is ${kind === 'inaccuracy' ? 'an' : 'a'} <b>${kind}</b>. Take it back and find a better move.`;
    if (this.attempts >= 2 && bm) html += ` <span class="reveal">A good move here is <b>${esc(bm.san)}</b> (see the arrow).</span>`;
    const extra = `<ul class="reasons">${reasons.map(r => `<li>${r}</li>`).join('')}</ul>`;
    this.feed = [...this.feed.filter(f => f.kind !== 'hint' && !f.wrong), { kind, html, extra, wrong: true }];
    this.drawFeed();
    this.later(() => {
      if (g !== this.gen) return;
      const last = this.played[this.played.length - 1];
      this.cg.set({ fen: this.fen, lastMove: last ? [last.m.from, last.m.to] : undefined, check: this.chess.inCheck() });
      squareBadge(this.$('badge-layer'), null);
      this.cg.set({ turnColor: this.learner === 'w' ? 'white' : 'black', movable: { color: this.learner === 'w' ? 'white' : 'black', dests: destsOf(this.chess) } });
      if (this.attempts >= 2 && bm) this.cg.setAutoShapes([{ orig: bm.from, dest: bm.to, brush: 'green' }]);
      else if (this.settings().freeArrow) this.hint(false);
      this.drawStatus();
    }, 900);
  }

  finish() {
    this.lock();
    const st = this.stats;
    const acc = st.my ? Math.round((st.first / st.my) * 100) : 0;
    const rec = store.recordFree(this.op.id, acc);
    let end = '';
    if (this.chess.isCheckmate()) end = this.chess.turn() === this.learner ? ' You got checkmated!' : ' You delivered checkmate!';
    this.feed = [...this.feed, {
      kind: acc >= 80 ? 'best' : 'info',
      html: `<b>Game over — ${acc}% found on the first try.</b>${end} ${st.book} book moves, ${st.punished}/${st.oppErrors} opponent mistakes punished. Best score: ${rec.best}%.`,
    }];
    acc >= 80 ? sound.win() : sound.good();
    this.drawAll();
    this.$('btn-new').classList.add('pulse');
    if (acc === 100 && st.my >= 8) showModal(`<div class="dice">🧠</div><h2>Perfect understanding!</h2><p>Every move found on the first try in <b>${esc(this.op.name)}</b>.</p><button class="btn btn-primary" data-close>Nice</button>`);
  }

  // ------------------------------------------------------------------ rendering
  showMove(m, kind) {
    this.cg.set({
      fen: this.chess.fen(), lastMove: [m.from, m.to], check: this.chess.inCheck(),
      turnColor: this.chess.turn() === 'w' ? 'white' : 'black', movable: { color: undefined, dests: new Map() },
    });
    this.cg.setAutoShapes([]);
    squareBadge(this.$('badge-layer'), m.to, kind, this.orientation);
    m.captured ? sound.capture() : sound.move();
  }

  flip() {
    this.orientation = this.orientation === 'white' ? 'black' : 'white';
    this.cg.set({ orientation: this.orientation });
    squareBadge(this.$('badge-layer'), null);
  }

  conceptsHTML(list) {
    return `<div class="concepts">${list.map(c => `<span class="concept" title="${esc(c.text)}"><b>${c.icon} ${esc(c.title)}</b> ${esc(c.text)}</span>`).join('')}</div>`;
  }

  setStatus(html) { this.$('fp-status').innerHTML = html; }

  drawStatus() {
    if (!this.chess) return;
    if (this.node) {
      const names = [...new Set(this.node.lines.map(i => this.op.lines[i].name))];
      this.setStatus(`📖 <b>In book</b> — ${esc(names[0])}${names.length > 1 ? ` <span class="muted">(+${names.length - 1} more)</span>` : ''}`);
    } else {
      const mv = Math.ceil((this.leftBookAt || 0) / 2);
      this.setStatus(`🧭 <b>Out of book</b>${mv ? ` since move ${mv}` : ''} — play by principles: develop, castle, control the center, punish mistakes.`);
    }
  }

  drawEval(cpWhite, mateWhite) {
    const pct = winPct(cpWhite);
    this.$('eval-fill').style.width = `${pct}%`;
    this.$('eval-text').textContent = `Eval ${fmtScore(cpWhite, mateWhite)}`;
  }

  drawFeed() { this.$('feed').innerHTML = feedHTML(this.feed); }

  drawMoves() {
    const rows = [];
    this.played.forEach((p, i) => {
      const no = Math.floor((p.ply - 1) / 2) + 1;
      const cell = `<span class="mv ${p.mine ? 'mine' : 'theirs'}">${badge(p.kind)}${esc(p.m.san)}</span>`;
      if (p.m.color === 'w' || i === 0) rows.push({ no, w: p.m.color === 'w' ? cell : '<span class="mv">…</span>', b: p.m.color === 'b' ? cell : '' });
      else rows[rows.length - 1].b = cell;
    });
    this.$('moves').innerHTML = rows.length
      ? rows.map(r => `<div class="mv-row"><span class="mv-no">${r.no}.</span>${r.w}${r.b}</div>`).join('')
      : '<p class="muted small">Moves will appear here.</p>';
    this.$('moves').scrollTop = 1e6;
  }

  drawScore() {
    const st = this.stats;
    const rec = store.get().free?.[this.op.id];
    const total = Math.ceil(this.settings().freeLength / 2);
    this.$('fp-score').innerHTML = st ? `
      <div><b>${st.first}</b><span>first try</span></div>
      <div><b>${st.my}/${total}</b><span>your moves</span></div>
      <div><b>${st.punished}/${st.oppErrors}</b><span>mistakes punished</span></div>
      <div><b>${rec ? rec.best + '%' : '—'}</b><span>best score</span></div>` : '';
  }

  drawAll() { this.drawFeed(); this.drawMoves(); this.drawStatus(); this.drawScore(); }
}
