// Thin promise-based wrapper around the Stockfish (WASM, single-threaded) web worker.
const ENGINE_URL = 'vendor/stockfish/stockfish-18-lite-single.js';

let instance = null;

export function getEngine() {
  if (!instance) instance = new Engine();
  return instance.ready.then(() => instance);
}

export function engineLoaded() { return !!instance; }

class Engine {
  constructor() {
    this.worker = new Worker(ENGINE_URL);
    this.listeners = new Set();
    this.queue = Promise.resolve();
    this.worker.onmessage = e => {
      const line = typeof e.data === 'string' ? e.data : String(e.data);
      for (const fn of [...this.listeners]) fn(line);
    };
    this.ready = this.wait('uci', 'uciok')
      .then(() => this.wait('setoption name Hash value 32\nisready', 'readyok'))
      .then(() => this.wait('ucinewgame\nisready', 'readyok'));
  }

  send(cmd) { for (const c of cmd.split('\n')) this.worker.postMessage(c); }

  wait(cmd, token) {
    return new Promise(resolve => {
      const fn = line => { if (line.startsWith(token)) { this.listeners.delete(fn); resolve(line); } };
      this.listeners.add(fn);
      this.send(cmd);
    });
  }

  // Analyse a position. Scores are centipawns from the side to move's point of view.
  analyse(fen, { depth = 12, multipv = 1 } = {}) {
    const job = this.queue.then(() => new Promise(resolve => {
      const lines = [];
      const fn = line => {
        if (line.startsWith('info') && line.includes(' pv ') && line.includes(' score ')) {
          const mpv = +(line.match(/ multipv (\d+)/)?.[1] || 1);
          const cp = line.match(/ score cp (-?\d+)/);
          const mate = line.match(/ score mate (-?\d+)/);
          const pv = line.split(' pv ')[1].trim().split(' ');
          let score;
          if (mate) { const m = +mate[1]; score = m > 0 ? 10000 - m * 10 : -10000 - m * 10; }
          else score = +cp[1];
          lines[mpv - 1] = { uci: pv[0], score, mate: mate ? +mate[1] : null, pv };
        } else if (line.startsWith('bestmove')) {
          this.listeners.delete(fn);
          const best = line.split(' ')[1];
          if (!lines.length && best && best !== '(none)') lines.push({ uci: best, score: 0, mate: null, pv: [best] });
          resolve(lines.filter(Boolean));
        }
      };
      this.listeners.add(fn);
      this.send(`setoption name MultiPV value ${multipv}`);
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}`);
    }));
    this.queue = job.catch(() => {});
    return job;
  }

  stop() { this.send('stop'); }
}

// Win probability (0-100) for the side whose score this is (lichess formula).
export function winPct(cp) {
  const c = Math.max(-1500, Math.min(1500, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

export function lossKind(loss, isTop) {
  if (isTop || loss <= 0.7) return 'best';
  if (loss <= 2.5) return 'excellent';
  if (loss <= 6) return 'good';
  if (loss <= 12) return 'inaccuracy';
  if (loss <= 22) return 'mistake';
  return 'blunder';
}

export function fmtScore(cp, mate) {
  if (mate != null) return (mate > 0 ? '+' : '-') + 'M' + Math.abs(mate);
  const v = cp / 100;
  return (v > 0 ? '+' : '') + v.toFixed(1);
}
