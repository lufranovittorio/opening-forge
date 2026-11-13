import { Chess } from '../vendor/chess.js';
import { Chessground } from '../vendor/chessground.min.js';
import { buildOpening, classify, BADGES, moveLabel } from './tree.js';
import * as store from './store.js';
import { sound } from './sound.js';

const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');
let OPENINGS = [];
let BY_ID = {};
let currentTrainer = null;

const BOOK_SVG = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5a1.5 1.5 0 0 0 0 3H20v1H6.5A2.5 2.5 0 0 1 4 19.5z"/></svg>';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function badge(kind, withLabel = false) {
  const b = BADGES[kind];
  const glyph = kind === 'book' ? BOOK_SVG : esc(b.glyph);
  return `<span class="badge badge-${kind}" title="${b.label}"><span class="badge-glyph">${glyph}</span>${withLabel ? `<span class="badge-label">${b.label}</span>` : ''}</span>`;
}

const sideName = s => (s === 'w' ? 'White' : 'Black');
const sidePill = s => `<span class="pill pill-${s}">${s === 'w' ? '♔' : '♚'} as ${sideName(s)}</span>`;

// ---------------------------------------------------------------- data
async function loadData() {
  const files = await (await fetch('data/index.json')).json();
  const groups = await Promise.all(files.map(f => fetch(`data/${f}`).then(r => r.json())));
  OPENINGS = groups.flat().map(buildOpening);
  BY_ID = Object.fromEntries(OPENINGS.map(o => [o.id, o]));
}

// ---------------------------------------------------------------- router
function route() {
  if (currentTrainer) { currentTrainer.destroy(); currentTrainer = null; }
  closeModal();
  const hash = location.hash.replace(/^#\/?/, '');
  const [page, arg] = hash.split('/');
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === (page || 'home') || (page === 'train' && a.dataset.nav === 'openings')));
  window.scrollTo(0, 0);
  if (page === 'openings') return renderCatalog();
  if (page === 'random') return startRandom();
  if (page === 'train' && BY_ID[arg]) return renderTrainer(BY_ID[arg]);
  return renderHome();
}

function forcedOpening() {
  const f = store.get().forced;
  return f && BY_ID[f.id] ? BY_ID[f.id] : null;
}

// ---------------------------------------------------------------- home
function renderHome() {
  const totalLines = OPENINGS.reduce((n, o) => n + o.lines.length, 0);
  const learned = OPENINGS.reduce((n, o) => n + store.openingProgress(o).learned, 0);
  const mastered = OPENINGS.filter(o => store.openingProgress(o).mastered).length;
  const forced = forcedOpening();
  const last = store.get().last && BY_ID[store.get().last];
  app.innerHTML = `
    <section class="hero">
      <div class="hero-text">
        <h1>Master chess openings,<br><span class="accent">one variation at a time.</span></h1>
        <p class="lead">${OPENINGS.length} openings and ${totalLines} book lines — main lines, sidelines, gambits and traps.
        Your opponent will try <em>everything</em>, including the bad moves. Every move is flagged
        ${badge('best')} Best, ${badge('book')} Book, ${badge('inaccuracy')} Inaccuracy, ${badge('mistake')} Mistake or ${badge('blunder')} Blunder — and you must find the right reply.</p>
      </div>
      <div class="hero-board" aria-hidden="true"><div id="hero-board"></div></div>
    </section>
    ${forced ? challengeBanner(forced) : ''}
    <section class="actions">
      <a class="action-card" href="#/openings">
        <div class="action-icon">📚</div>
        <h2>Learn an opening</h2>
        <p>Pick any opening from the library. Study each variation with arrows and explanations, then drill it from memory until every line is learned.</p>
        <span class="btn btn-primary">Browse ${OPENINGS.length} openings →</span>
      </a>
      <a class="action-card action-random" href="#/random">
        <div class="action-icon">🎲</div>
        <h2>Random opening</h2>
        <p>Let fate decide. You get a random opening and you are <strong>locked in</strong> until you have learned every single line of it. No skipping.</p>
        <span class="btn btn-gold">${forced ? 'Continue challenge →' : 'Roll the dice →'}</span>
      </a>
    </section>
    <section class="stats">
      <div class="stat"><b>${learned}</b><span>lines learned</span></div>
      <div class="stat"><b>${totalLines}</b><span>lines in the book</span></div>
      <div class="stat"><b>${mastered}</b><span>openings mastered</span></div>
      <div class="stat"><b>${store.get().completedChallenges}</b><span>random challenges won</span></div>
    </section>
    ${last && !forced ? `<section class="continue"><a class="btn btn-ghost" href="#/train/${last.id}">↻ Continue with ${esc(last.name)}</a></section>` : ''}
    <section class="howto">
      <h2>How training works</h2>
      <ol>
        <li><b>Study.</b> The first time you see a line, a green arrow shows the book move and the panel explains the idea.</li>
        <li><b>Drill.</b> Next time, no help: play the moves from memory. The opponent picks among all the variations — good and bad.</li>
        <li><b>Punish mistakes.</b> When the opponent plays a ${badge('mistake')} or ${badge('blunder')}, find the ${badge('best')} refutation.</li>
        <li><b>Learn it all.</b> A line counts as learned after a clean drill. Wrong moves send the line back for review.</li>
      </ol>
    </section>`;
  const cg = Chessground(document.getElementById('hero-board'), {
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    viewOnly: true, coordinates: false,
    drawable: { enabled: false, autoShapes: [{ orig: 'f3', dest: 'g5', brush: 'green' }, { orig: 'c4', dest: 'f7', brush: 'red' }] },
  });
  cg.setAutoShapes([{ orig: 'f3', dest: 'g5', brush: 'green' }, { orig: 'c4', dest: 'f7', brush: 'red' }]);
}

function challengeBanner(op) {
  const p = store.openingProgress(op);
  return `<div class="challenge-banner">
    <div>🎲 <b>Random challenge active:</b> ${esc(op.name)} ${sidePill(op.side)} — ${p.learned}/${p.total} lines learned. You're locked in until it's done.</div>
    <a class="btn btn-gold btn-sm" href="#/train/${op.id}">Continue →</a>
  </div>`;
}

// ---------------------------------------------------------------- catalog
const catalogState = { side: 'all', q: '' };

function renderCatalog() {
  const forced = forcedOpening();
  app.innerHTML = `
    <section class="catalog-head">
      <h1>Opening library</h1>
      <p class="muted">Choose an opening to learn. You play the side shown on the card; your opponent will try every book variation against you.</p>
      ${forced ? challengeBanner(forced) : ''}
      <div class="filters">
        <input id="q" class="search" type="search" placeholder="Search openings, ECO codes, variations…" value="${esc(catalogState.q)}">
        <div class="seg" role="tablist">
          ${['all', 'w', 'b'].map(s => `<button data-side="${s}" class="${catalogState.side === s ? 'on' : ''}">${s === 'all' ? 'All' : 'As ' + sideName(s)}</button>`).join('')}
        </div>
      </div>
    </section>
    <section id="catalog-list"></section>`;
  const list = document.getElementById('catalog-list');
  const draw = () => {
    const q = catalogState.q.toLowerCase().trim();
    const items = OPENINGS.filter(o =>
      (catalogState.side === 'all' || o.side === catalogState.side) &&
      (!q || [o.name, o.eco, o.family, o.desc, ...o.lines.map(l => l.name)].join(' ').toLowerCase().includes(q)));
    const fams = [...new Set(items.map(o => o.family))];
    list.innerHTML = fams.length ? fams.map(f => `
      <h2 class="family">${esc(f)}</h2>
      <div class="grid">${items.filter(o => o.family === f).map(o => card(o, forced)).join('')}</div>`).join('')
      : '<p class="muted empty">No openings match your search.</p>';
  };
  draw();
  document.getElementById('q').addEventListener('input', e => { catalogState.q = e.target.value; draw(); });
  app.querySelectorAll('[data-side]').forEach(b => b.addEventListener('click', () => {
    catalogState.side = b.dataset.side;
    app.querySelectorAll('[data-side]').forEach(x => x.classList.toggle('on', x === b));
    draw();
  }));
}

function card(o, forced) {
  const p = store.openingProgress(o);
  const pct = Math.round((p.learned / p.total) * 100);
  const locked = forced && forced.id !== o.id;
  return `<a class="card ${locked ? 'locked' : ''} ${p.mastered ? 'mastered' : ''}" href="${locked ? '#/openings' : '#/train/' + o.id}" ${locked ? 'title="Finish your random challenge first" aria-disabled="true"' : ''}>
    <div class="card-top">${sidePill(o.side)}<span class="eco">${esc(o.eco)}</span></div>
    <h3>${esc(o.name)} ${p.mastered ? '<span class="crown" title="Mastered">👑</span>' : ''}</h3>
    <p>${esc(o.desc)}</p>
    <div class="card-foot">
      <span class="level level-${o.level.toLowerCase()}">${o.level}</span>
      <span class="muted">${o.lines.length} lines</span>
    </div>
    <div class="bar"><div style="width:${pct}%"></div></div>
    <div class="card-progress muted">${p.learned}/${p.total} learned${locked ? ' · 🔒 locked by challenge' : ''}</div>
  </a>`;
}

// ---------------------------------------------------------------- random challenge
function startRandom() {
  let forced = forcedOpening();
  if (!forced) {
    const pool = OPENINGS.filter(o => !store.openingProgress(o).mastered);
    const pick = (pool.length ? pool : OPENINGS)[Math.floor(Math.random() * (pool.length || OPENINGS.length))];
    store.get().forced = { id: pick.id, started: Date.now() };
    store.save();
    forced = pick;
    history.replaceState(null, '', `#/train/${pick.id}`);
    renderTrainer(pick);
    showModal(`
      <div class="dice">🎲</div>
      <h2>Your random opening is…</h2>
      <h1 class="accent">${esc(pick.name)}</h1>
      <p>${sidePill(pick.side)} <span class="eco">${esc(pick.eco)}</span></p>
      <p class="muted">${esc(pick.desc)}</p>
      <p><b>You're locked in</b> until you've learned all ${pick.lines.length} lines. Good luck!</p>
      <button class="btn btn-gold" data-close>Let's go</button>`);
    return;
  }
  history.replaceState(null, '', `#/train/${forced.id}`);
  renderTrainer(forced);
}

// ---------------------------------------------------------------- modal
function showModal(html) {
  modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal">${html}</div></div>`;
  modalRoot.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));
}
function closeModal() { modalRoot.innerHTML = ''; }

// ---------------------------------------------------------------- trainer page
function renderTrainer(op) {
  const forced = forcedOpening();
  if (forced && forced.id !== op.id) {
    app.innerHTML = `<section class="blocked">
      <h1>🔒 Locked by your random challenge</h1>
      <p>You must finish <b>${esc(forced.name)}</b> before learning other openings.</p>
      <div class="row"><a class="btn btn-gold" href="#/train/${forced.id}">Continue challenge</a>
      <button class="btn btn-ghost" id="giveup">Give up challenge</button></div></section>`;
    document.getElementById('giveup').onclick = () => giveUp();
    return;
  }
  store.get().last = op.id; store.save();
  const isForced = forced && forced.id === op.id;
  app.innerHTML = `
    <section class="trainer">
      <div class="board-col">
        <div class="board-wrap"><div id="board" class="board"></div><div class="badge-layer" id="badge-layer"></div></div>
        <div class="board-controls">
          <button class="btn btn-ghost" id="btn-hint" title="Show the book move (H)">💡 Hint</button>
          <button class="btn btn-ghost" id="btn-restart" title="Restart this line (R)">↺ Restart</button>
          <button class="btn btn-ghost" id="btn-flip" title="Flip board (F)">⇅ Flip</button>
          <button class="btn btn-primary" id="btn-next" title="Next line (N)">Next line →</button>
        </div>
      </div>
      <aside class="panel">
        ${isForced ? `<div class="forced-tag">🎲 Random challenge — locked in <button class="link" id="giveup">give up</button></div>` : ''}
        <div class="panel-head">
          <div class="crumbs">${isForced ? '' : '<a href="#/openings">← Library</a>'}</div>
          <h1>${esc(op.name)}</h1>
          <div class="meta">${sidePill(op.side)} <span class="eco">${esc(op.eco)}</span> <span class="level level-${op.level.toLowerCase()}">${op.level}</span></div>
        </div>
        <div class="progress-row">
          <div class="bar big"><div id="op-bar"></div></div>
          <span id="op-progress" class="muted"></span>
        </div>
        <div class="mode-row">
          <span class="muted">Show next move</span>
          <div class="seg seg-sm" id="mode-seg">
            <button data-mode="auto" title="Arrow on new lines (study), no arrow on lines you've seen (drill)">Auto</button>
            <button data-mode="study" title="Always show an arrow with the next book move">Always</button>
            <button data-mode="drill" title="Never show the next move: pure memory drill">Off</button>
          </div>
          <button class="icon-btn" id="btn-sound" title="Toggle sound"></button>
        </div>
        <label class="toggle-row" title="Show the explanation of your next move before you play it">
          <input type="checkbox" id="opt-preview"> <span>Explain the next move before I play it</span>
        </label>
        <p class="muted small mode-note" id="mode-note"></p>
        <div class="line-title" id="line-title"></div>
        <div class="feed" id="feed"></div>
        <div class="moves" id="moves"></div>
        <details class="lines-box" id="lines-box">
          <summary>All variations (<span id="lines-count"></span>)</summary>
          <ul id="lines-list"></ul>
        </details>
      </aside>
    </section>`;
  if (isForced) document.getElementById('giveup').onclick = () => giveUp();
  currentTrainer = new Trainer(op, isForced);
  window.__trainer = currentTrainer; // handy for debugging in the console
}

function giveUp() {
  if (!confirm('Give up the random challenge? Your progress on its lines is kept, but the challenge ends unfinished.')) return;
  store.get().forced = null;
  store.save();
  location.hash = '#/openings';
}

// ---------------------------------------------------------------- trainer logic
const STATUS_RANK = { review: 0, studied: 1, new: 2, learned: 3 };
const STATUS_ICON = { new: '○', studied: '◐', review: '⟲', learned: '✓' };

class Trainer {
  constructor(op, forced) {
    this.op = op;
    this.forced = forced;
    this.learner = op.side;
    this.orientation = op.side === 'w' ? 'white' : 'black';
    this.timers = [];
    this.$ = id => document.getElementById(id);
    this.cg = Chessground(this.$('board'), {
      orientation: this.orientation,
      coordinates: true,
      animation: { enabled: true, duration: 220 },
      highlight: { lastMove: true, check: true },
      movable: { free: false, showDests: true, events: { after: (o, d) => this.onUserMove(o, d) } },
      premovable: { enabled: false },
      draggable: { showGhost: true },
      drawable: { enabled: true, visible: true },
    });
    this.onKey = e => {
      if (e.target.matches('input, textarea') || e.ctrlKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === 'h') this.hint();
      else if (k === 'r') this.startLine(this.line.index);
      else if (k === 'n') this.nextLine();
      else if (k === 'f') this.flip();
    };
    document.addEventListener('keydown', this.onKey);
    this.onResize = () => document.body.dispatchEvent(new Event('chessground.resize'));
    window.addEventListener('resize', this.onResize);

    this.$('btn-hint').onclick = () => this.hint();
    this.$('btn-restart').onclick = () => this.startLine(this.line.index);
    this.$('btn-next').onclick = () => this.nextLine();
    this.$('btn-flip').onclick = () => this.flip();
    this.$('btn-sound').onclick = () => { const s = store.get().settings; s.sound = !s.sound; store.save(); this.drawSoundBtn(); };
    this.$('mode-seg').querySelectorAll('button').forEach(b => b.onclick = () => {
      store.get().settings.mode = b.dataset.mode; store.save(); this.drawMode(); this.startLine(this.line.index);
    });
    const pv = this.$('opt-preview');
    pv.checked = store.get().settings.preview !== false;
    pv.onchange = () => {
      store.get().settings.preview = pv.checked; store.save();
      const exp = this.expected();
      if (!this.done && exp && this.chess.turn() === this.learner && (this.study || this.hinted)) this.showHintArrow(exp, true);
    };
    this.drawSoundBtn();
    this.drawMode();
    this.startLine(this.pickLine(-1));
  }

  destroy() {
    this.timers.forEach(clearTimeout);
    document.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    this.cg.destroy();
  }

  later(fn, ms) { this.timers.push(setTimeout(fn, ms)); }

  drawSoundBtn() { this.$('btn-sound').textContent = store.get().settings.sound ? '🔊' : '🔇'; }
  drawMode() {
    const m = store.get().settings.mode;
    this.$('mode-seg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    this.$('mode-note').textContent = {
      auto: 'New lines show the next move with an arrow; lines you have already seen are drilled from memory.',
      study: 'The next book move is always shown. Great for learning — switch to Auto or Off to get lines marked as learned.',
      drill: 'No arrows. Use 💡 Hint (H) if you are stuck; it counts as an error.',
    }[m];
  }

  pickLine(current) {
    const lines = this.op.lines;
    const ranked = lines.map(l => ({ l, r: STATUS_RANK[store.lineStat(l.key).status] }));
    const min = Math.min(...ranked.map(x => x.r));
    let cands = ranked.filter(x => x.r === min).map(x => x.l);
    if (cands.length > 1) cands = cands.filter(l => l.index !== current);
    if (min === 3) return cands[Math.floor(Math.random() * cands.length)].index; // all learned: random review
    return cands[0].index;
  }

  startLine(index) {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.line = this.op.lines[index];
    this.chess = new Chess();
    this.node = this.op.root;
    this.played = [];
    this.errors = 0;
    this.attempts = 0;
    this.usedHint = false;
    this.done = false;
    const mode = store.get().settings.mode;
    const status = store.lineStat(this.line.key).status;
    this.study = mode === 'study' || (mode === 'auto' && status === 'new');
    this.cg.set({ fen: this.chess.fen(), lastMove: undefined, check: false, turnColor: 'white', movable: { color: undefined, dests: new Map() } });
    this.cg.setAutoShapes([]);
    this.clearBadge();
    this.feed = [];
    this.addFeed('info', this.study
      ? `<b>Study mode.</b> Follow the green arrows and read why each move is played. ${this.learner === 'b' ? 'Your opponent moves first.' : ''}`
      : `<b>Drill mode.</b> Play the book moves from memory. Your opponent can choose <em>any</em> variation — including bad ones.`);
    this.drawLineTitle();
    this.drawMoves();
    this.drawProgress();
    this.drawLines();
    this.$('btn-next').classList.remove('pulse');
    this.advance();
  }

  nextLine() {
    // Right after studying a line, drill that same line.
    if (this.done && this.study && store.get().settings.mode === 'auto') return this.startLine(this.line.index);
    this.$('btn-next').textContent = 'Next line →';
    this.startLine(this.pickLine(this.line.index));
  }

  flip() {
    this.orientation = this.orientation === 'white' ? 'black' : 'white';
    this.cg.set({ orientation: this.orientation });
    if (this.badgeSq) this.placeBadge(this.badgeSq, this.badgeKind);
  }

  // path node the current line expects next
  expected() { return this.line.path[this.node.ply + 1]; }

  advance() {
    const next = this.expected();
    if (!next) return this.finish();
    if (this.chess.turn() === this.learner) {
      this.attempts = 0;
      this.hinted = false;
      this.enableMoves();
      if (this.study) this.showHintArrow(next, false);
    } else {
      this.cg.set({ movable: { color: undefined, dests: new Map() } });
      this.later(() => this.playOpponent(next), this.node.ply === 0 ? 500 : 650);
    }
  }

  enableMoves() {
    const dests = new Map();
    for (const m of this.chess.moves({ verbose: true })) {
      if (!dests.has(m.from)) dests.set(m.from, []);
      dests.get(m.from).push(m.to);
    }
    this.cg.set({
      turnColor: this.learner === 'w' ? 'white' : 'black',
      movable: { color: this.learner === 'w' ? 'white' : 'black', dests },
    });
  }

  applyNode(node) {
    this.chess.move(node.san);
    this.node = node;
    this.played.push(node);
    this.cg.set({
      fen: this.chess.fen(),
      lastMove: [node.from, node.to],
      check: this.chess.inCheck(),
      turnColor: this.chess.turn() === 'w' ? 'white' : 'black',
      movable: { color: undefined, dests: new Map() },
    });
    this.cg.setAutoShapes([]);
    node.captured ? sound.capture() : sound.move();
  }

  playOpponent(node) {
    if (this.done) return;
    this.applyNode(node);
    const kind = classify(node, this.learner);
    this.placeBadge(node.to, kind);
    const bad = ['inaccuracy', 'mistake', 'blunder'].includes(kind);
    const nextMine = this.expected();
    let text = `Opponent played <b>${moveLabel(node)}</b>`;
    if (node.mate) text += ' — checkmate.';
    if (bad && nextMine) text += ` — <b>punish it!</b> Find the best reply.`;
    this.addFeed(kind, text, node.comment);
    this.drawMoves();
    this.advance();
  }

  onUserMove(orig, dest) {
    if (this.done) return;
    const piece = this.chess.get(orig);
    const isPromo = piece && piece.type === 'p' && (dest[1] === '8' || dest[1] === '1');
    if (isPromo) return this.askPromotion(orig, dest);
    this.tryMove(orig, dest);
  }

  askPromotion(orig, dest) {
    const color = this.learner;
    const names = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' };
    showModal(`<h2>Promote to…</h2><div class="promo">${Object.entries(names).map(([k, n]) =>
      `<button data-p="${k}" class="promo-btn"><span class="cg-wrap promo-piece"><piece class="${n} ${color === 'w' ? 'white' : 'black'}"></piece></span>${n}</button>`).join('')}</div>`);
    modalRoot.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { closeModal(); this.tryMove(orig, dest, b.dataset.p); });
  }

  tryMove(orig, dest, promotion) {
    const node = this.node;
    const match = node.children.find(c => c.from === orig && c.to === dest && (c.promotion || undefined) === (promotion || undefined))
      || (!promotion && node.children.find(c => c.from === orig && c.to === dest && !c.promotion));
    if (match) {
      // If the learner took a different book branch, follow a line that contains it.
      if (!match.lines.includes(this.line.index)) {
        const best = match.lines.map(i => this.op.lines[i]).sort((a, b) =>
          STATUS_RANK[store.lineStat(a.key).status] - STATUS_RANK[store.lineStat(b.key).status])[0];
        this.line = best;
        this.drawLineTitle();
      }
      this.applyNode(match);
      const kind = classify(match, this.learner);
      this.placeBadge(match.to, kind);
      const explained = this.feed.some(f => f.kind === 'hint' && f.comment);
      this.feed = [];
      const praise = kind === 'best' ? 'Best move!' : kind === 'brilliant' ? 'Brilliant!' : 'Book move.';
      this.addFeed(kind, `<b>${moveLabel(match)}</b> — ${praise}${match.mate ? ' Checkmate!' : ''}`, explained ? '' : match.comment);
      if (this.attempts === 0) sound.good();
      this.drawMoves();
      this.advance();
      return;
    }
    // Wrong move: show it briefly, then take it back.
    let san = `${orig}-${dest}`;
    try {
      const probe = new Chess(this.chess.fen());
      san = probe.move({ from: orig, to: dest, promotion: promotion || 'q' }).san;
    } catch { /* keep coordinate notation */ }
    this.errors++;
    this.attempts++;
    sound.wrong();
    this.placeBadge(dest, 'wrong');
    const exp = this.expected();
    let msg = `<b>${esc(san)}</b> is not the book move here. Take it back and try again.`;
    if (this.attempts >= 2 && exp) msg += ` <span class="reveal">The book move is <b>${moveLabel(exp)}</b> (see the arrow).</span>`;
    this.feed = this.feed.filter(f => f.kind !== 'wrong');
    this.addFeed('wrong', msg);
    this.cg.set({ movable: { color: undefined, dests: new Map() } });
    this.later(() => {
      this.cg.set({ fen: this.chess.fen(), lastMove: this.node.from ? [this.node.from, this.node.to] : undefined, check: this.chess.inCheck() });
      this.clearBadge();
      this.enableMoves();
      if (this.attempts >= 2 && exp) this.showHintArrow(exp, true);
      else if (this.study && exp) this.showHintArrow(exp, false);
    }, 700);
  }

  hint() {
    if (this.done) return;
    const exp = this.expected();
    if (!exp || this.chess.turn() !== this.learner) return;
    if (!this.study) this.usedHint = true;
    this.hinted = true;
    this.showHintArrow(exp, true);
  }

  showHintArrow(node, announce) {
    const shapes = [{ orig: node.from, dest: node.to, brush: 'green' }];
    this.cg.setAutoShapes(shapes);
    if (announce || this.study) {
      const why = store.get().settings.preview !== false && node.comment ? node.comment : '';
      this.feed = this.feed.filter(f => f.kind !== 'hint');
      this.addFeed('hint', `Your move: play <b>${moveLabel(node)}</b>.`, why ? `Why: ${why}` : '');
    }
  }

  finish() {
    this.done = true;
    this.cg.set({ movable: { color: undefined, dests: new Map() } });
    const errors = this.errors + (this.usedHint ? 1 : 0);
    const before = store.openingProgress(this.op).mastered;
    const stat = store.recordLine(this.line.key, { studied: this.study, errors });
    const prog = store.openingProgress(this.op);
    this.drawProgress();
    this.drawLines();
    this.drawLineTitle(true);
    let html;
    if (this.study) {
      html = `<b>Line studied!</b> Now drill it from memory to mark it as learned.`;
      sound.good();
    } else if (errors === 0) {
      html = `<b>Perfect — line learned!</b> ${prog.learned}/${prog.total} lines of this opening learned.`;
      sound.win();
    } else {
      html = `<b>Line finished with ${errors} error${errors > 1 ? 's' : ''}.</b> It goes back into review — you'll see it again soon.`;
      sound.good();
    }
    this.addFeed(stat.status === 'learned' ? 'best' : 'info', html);
    this.$('btn-next').classList.add('pulse');
    this.$('btn-next').textContent = this.study ? 'Drill this line →' : 'Next line →';
    if (prog.mastered && !before) this.celebrate();
  }

  celebrate() {
    if (this.forced) {
      store.get().forced = null;
      store.get().completedChallenges++;
      store.save();
      showModal(`<div class="dice">🏆</div><h2>Challenge complete!</h2>
        <p>You learned every line of <b>${esc(this.op.name)}</b>. The lock is lifted.</p>
        <div class="row center"><a class="btn btn-gold" href="#/random">🎲 Next random opening</a><a class="btn btn-ghost" href="#/openings">Library</a></div>`);
    } else {
      showModal(`<div class="dice">👑</div><h2>Opening mastered!</h2>
        <p>All ${this.op.lines.length} lines of <b>${esc(this.op.name)}</b> are learned. Keep drilling to stay sharp.</p>
        <div class="row center"><button class="btn btn-primary" data-close>Keep drilling</button><a class="btn btn-ghost" href="#/openings">Library</a></div>`);
    }
  }

  // ------------------------------------------------ rendering helpers
  addFeed(kind, html, comment) {
    this.feed.push({ kind, html, comment });
    const box = this.$('feed');
    box.innerHTML = this.feed.map(f => `
      <div class="feed-item feed-${f.kind}">
        ${BADGES[f.kind] ? badge(f.kind, true) : f.kind === 'hint' ? '<span class="badge badge-hint"><span class="badge-glyph">➜</span></span>' : '<span class="badge badge-info"><span class="badge-glyph">i</span></span>'}
        <div class="feed-body"><div>${f.html}</div>${f.comment ? `<div class="comment">${esc(f.comment)}</div>` : ''}</div>
      </div>`).join('');
  }

  drawLineTitle(reveal) {
    const show = this.study || reveal || this.done;
    const st = store.lineStat(this.line.key).status;
    this.$('line-title').innerHTML = `<span class="muted">Variation ${this.line.index + 1}/${this.op.lines.length}:</span> ${show ? `<b>${esc(this.line.name)}</b>` : '<b class="hidden-name">hidden until you finish</b>'} <span class="status status-${st}">${STATUS_ICON[st]} ${st}</span>`;
  }

  drawMoves() {
    const rows = [];
    const list = this.played;
    const startBlack = list.length && list[0].color === 'b';
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      const no = Math.floor((n.ply - 1) / 2) + 1;
      const kind = classify(n, this.learner);
      const cell = `<span class="mv ${n.color === this.learner ? 'mine' : 'theirs'}">${badge(kind)}${esc(n.san)}${n.nag ? `<sup>${esc(n.nag)}</sup>` : ''}</span>`;
      if (n.color === 'w' || (i === 0 && startBlack)) rows.push({ no, w: n.color === 'w' ? cell : '<span class="mv">…</span>', b: n.color === 'b' ? cell : '' });
      else rows[rows.length - 1].b = cell;
    }
    this.$('moves').innerHTML = rows.length
      ? rows.map(r => `<div class="mv-row"><span class="mv-no">${r.no}.</span>${r.w}${r.b}</div>`).join('')
      : '<p class="muted small">Moves will appear here.</p>';
    this.$('moves').scrollTop = 1e6;
  }

  drawProgress() {
    const p = store.openingProgress(this.op);
    this.$('op-bar').style.width = `${(p.learned / p.total) * 100}%`;
    this.$('op-progress').textContent = `${p.learned}/${p.total} lines learned`;
  }

  drawLines() {
    this.$('lines-count').textContent = this.op.lines.length;
    this.$('lines-list').innerHTML = this.op.lines.map(l => {
      const st = store.lineStat(l.key).status;
      const reveal = st !== 'new' || this.study;
      return `<li><button data-line="${l.index}" class="${l === this.line ? 'current' : ''}">
        <span class="status status-${st}">${STATUS_ICON[st]}</span>
        <span>${reveal ? esc(l.name) : `Variation ${l.index + 1} <span class="muted">(not seen yet)</span>`}</span></button></li>`;
    }).join('');
    this.$('lines-list').querySelectorAll('[data-line]').forEach(b => b.onclick = () => this.startLine(+b.dataset.line));
  }

  placeBadge(square, kind) {
    this.badgeSq = square;
    this.badgeKind = kind;
    const f = square.charCodeAt(0) - 97;
    const r = +square[1] - 1;
    const x = this.orientation === 'white' ? f : 7 - f;
    const y = this.orientation === 'white' ? 7 - r : r;
    this.$('badge-layer').innerHTML = `<div class="sq-badge" style="left:${(x + 1) * 12.5}%;top:${y * 12.5}%">${badge(kind)}</div>`;
  }
  clearBadge() { this.badgeSq = null; this.$('badge-layer').innerHTML = ''; }
}

// ---------------------------------------------------------------- boot
store.load();
loadData().then(() => {
  window.addEventListener('hashchange', route);
  route();
}).catch(err => {
  console.error(err);
  app.innerHTML = `<div class="loading">Could not load the opening book. If you opened the file directly, serve the folder over HTTP (e.g. <code>python -m http.server</code>).</div>`;
});
