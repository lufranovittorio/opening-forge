// Tiny synthesized sound effects (no audio files needed).
import { get } from './store.js';

let ctx;
function tone(freq, dur, type = 'sine', gain = 0.08, when = 0) {
  if (!get().settings.sound) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur);
  } catch { /* audio unavailable */ }
}

export const sound = {
  move: () => tone(420, 0.07, 'triangle', 0.12),
  capture: () => { tone(300, 0.08, 'square', 0.05); tone(220, 0.1, 'triangle', 0.1, 0.03); },
  wrong: () => { tone(220, 0.12, 'sawtooth', 0.05); tone(160, 0.18, 'sawtooth', 0.05, 0.1); },
  good: () => { tone(660, 0.08, 'sine', 0.07); tone(880, 0.12, 'sine', 0.07, 0.07); },
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'sine', 0.08, i * 0.11)),
};
