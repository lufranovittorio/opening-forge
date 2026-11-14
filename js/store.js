// Progress persistence in localStorage (per browser).
const KEY = 'openingforge.v1';

const defaults = () => ({
  lines: {},          // lineKey -> { status, seen, clean, fails, last }
  forced: null,       // { id, started } while a random challenge is active
  completedChallenges: 0,
  free: {},          // openingId -> { games, best, last } for free-play mode
  settings: { mode: 'auto', sound: true },
  last: null,
});

let state = defaults();

export function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw) state = { ...defaults(), ...raw, settings: { ...defaults().settings, ...(raw.settings || {}) } };
  } catch { state = defaults(); }
  return state;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

export const get = () => state;

export function lineStat(key) {
  return state.lines[key] || { status: 'new', seen: 0, clean: 0, fails: 0 };
}

// status: new -> studied -> learned, or review after a failed drill
export function recordLine(key, { studied, errors }) {
  const s = { ...lineStat(key) };
  s.seen++;
  s.last = Date.now();
  if (studied) {
    if (s.status === 'new') s.status = 'studied';
  } else if (errors === 0) {
    s.status = 'learned';
    s.clean++;
  } else {
    s.status = 'review';
    s.fails++;
  }
  state.lines[key] = s;
  save();
  return s;
}

export function openingProgress(op) {
  const learned = op.lines.filter(l => lineStat(l.key).status === 'learned').length;
  return { learned, total: op.lines.length, mastered: learned === op.lines.length };
}

export function resetOpening(op) {
  for (const l of op.lines) delete state.lines[l.key];
  save();
}

export function recordFree(id, acc) {
  state.free = state.free || {};
  const r = state.free[id] || { games: 0, best: 0, last: 0 };
  r.games++;
  r.last = acc;
  r.best = Math.max(r.best, acc);
  state.free[id] = r;
  save();
  return r;
}
