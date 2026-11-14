// Plain-language "why" explanations for moves, based on simple chess principles.
import { Chess } from '../vendor/chess.js';

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
export const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const CENTER = ['d4', 'e4', 'd5', 'e5'];
const FLANK_CENTER = ['c4', 'c5', 'f4', 'f5'];

function threatsBy(after, sq, color) {
  const them = color === 'w' ? 'b' : 'w';
  const piece = after.get(sq);
  const out = [];
  for (const row of after.board()) for (const cell of row) {
    if (!cell || cell.color !== them || cell.type === 'k') continue;
    if (!after.attackers(cell.square, color).includes(sq)) continue;
    const defended = after.attackers(cell.square, them).length > 0;
    if (!defended || VAL[cell.type] > VAL[piece.type]) out.push(cell);
  }
  return out;
}

function undevelopedMinors(chess, color) {
  const home = color === 'w' ? { b1: 'n', g1: 'n', c1: 'b', f1: 'b' } : { b8: 'n', g8: 'n', c8: 'b', f8: 'b' };
  return Object.entries(home).filter(([sq, t]) => { const p = chess.get(sq); return p && p.type === t && p.color === color; }).length;
}

// Positive concepts for a played move. Returns [{icon, title, text}]
export function moveConcepts(beforeFen, move) {
  const after = new Chess(beforeFen);
  after.move(move.san);
  const me = move.color;
  const out = [];
  const add = (icon, title, text) => out.push({ icon, title, text });
  if (move.flags.includes('k') || move.flags.includes('q')) add('🏰', 'King safety', 'Castling tucks the king away and connects the rooks.');
  if (after.isCheckmate()) add('#', 'Checkmate', 'The king has no escape — game over!');
  else if (after.inCheck()) add('+', 'Check', 'A forcing move: the opponent must deal with the check.');
  if (move.captured) add('⚔', 'Capture', `Takes the ${NAME[move.captured]} on ${move.to}.`);
  if (move.promotion) add('♛', 'Promotion', `The pawn becomes a ${NAME[move.promotion]}.`);
  const backRank = me === 'w' ? '1' : '8';
  if ('nb'.includes(move.piece) && move.from[1] === backRank) add('♞', 'Development', `Brings the ${NAME[move.piece]} into the game — every piece should join the fight.`);
  if (move.piece === 'b' && ['g2', 'b2', 'g7', 'b7'].includes(move.to)) add('↗', 'Fianchetto', 'The bishop controls the long diagonal.');
  if (move.piece === 'p' && CENTER.includes(move.to)) add('⊕', 'Center', 'Occupies the center: more space and control of key squares.');
  else if (move.piece === 'p' && FLANK_CENTER.includes(move.to)) add('⊕', 'Center', 'Fights for the center from the side.');
  if (move.piece === 'r' && !after.board().some(r => r.some(c => c && c.type === 'p' && c.square[0] === move.to[0]))) add('⇕', 'Open file', 'The rook takes an open file.');
  const threats = threatsBy(after, move.to, me);
  if (threats.length >= 2) add('🎯', 'Double attack', `Attacks the ${threats.map(t => `${NAME[t.type]} on ${t.square}`).join(' and the ')} at once.`);
  else if (threats.length === 1) add('🎯', 'Threat', `Attacks the ${NAME[threats[0].type]} on ${threats[0].square}.`);
  if (!out.length) add('♟', 'Improvement', 'A useful quiet move that improves the position.');
  return out;
}

// Why a rejected move is bad. `reply` is the engine's best answer (SAN) after the move, `afterLine` its analysis.
export function whyBad({ beforeFen, move, reply, replyCaptured, mateAgainst, myHistory, oppLastKind }) {
  const before = new Chess(beforeFen);
  const reasons = [];
  if (mateAgainst) reasons.push(`It allows a forced checkmate${reply ? `, starting with ${reply}` : ''}.`);
  else if (reply && replyCaptured) reasons.push(`It allows <b>${reply}</b>, winning a ${NAME[replyCaptured]}.`);
  const ply = before.history().length;
  if (['inaccuracy', 'mistake', 'blunder'].includes(oppLastKind) && !move.captured) reasons.push('Your opponent just made a mistake — look for a way to punish it (a capture, a fork or a direct attack).');
  if (move.piece === 'q' && ply < 16 && !move.captured) reasons.push('Bringing the queen out early lets the opponent gain time by attacking it.');
  if (move.piece === 'k' && !move.flags.includes('k') && !move.flags.includes('q')) reasons.push('Moving the king gives up castling and leaves it exposed.');
  if (myHistory.includes(move.from) && ply < 20 && !move.captured && move.piece !== 'p') reasons.push('Moving the same piece twice in the opening wastes time.');
  if (move.piece === 'p' && 'abgh'.includes(move.from[0]) && undevelopedMinors(before, move.color) >= 2 && !move.captured) reasons.push('Neglects development: get the knights and bishops out first.');
  if (!reasons.length) reasons.push('There is a clearly stronger idea in this position.');
  return reasons;
}

export function uciToMove(fen, uci) {
  try {
    const c = new Chess(fen);
    return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
  } catch { return null; }
}
