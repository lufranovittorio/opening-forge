"""Validate every opening line in data/*.json with python-chess.

Checks: legal moves, canonical SAN spelling, unique ids / line names,
learner-side branching (two different 'book' replies in one position),
lines that are a prefix of another line, and that each line ends on a
learner move.  Usage:  python tools/validate.py [--fix]
"""
import json, re, sys, pathlib
import chess

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
TOKEN = re.compile(r"\{[^}]*\}|\S+")
NAG = re.compile(r"^(.*?)(!!|\?\?|!\?|\?!|!|\?)?$")
MOVENUM = re.compile(r"^\d+\.(\.\.)?")

def parse(moves):
    out = []
    for tok in TOKEN.findall(moves):
        if tok.startswith("{"):
            if out: out[-1]["comment"] = tok[1:-1].strip()
            continue
        tok = MOVENUM.sub("", tok)
        if not tok: continue
        m = NAG.match(tok)
        out.append({"san": m.group(1), "nag": m.group(2) or "", "comment": ""})
    return out

def main(fix=False):
    errors = warnings = 0
    ids = set()
    total_lines = 0
    for fname in json.loads((DATA / "index.json").read_text(encoding="utf-8")):
        path = DATA / fname
        raw = path.read_text(encoding="utf-8")
        openings = json.loads(raw)
        changed = False
        for op in openings:
            oid = op["id"]
            if oid in ids: print(f"ERROR duplicate id {oid}"); errors += 1
            ids.add(oid)
            names = set()
            tree = {}  # path tuple -> set of next sans
            leaves = []
            for line in op["lines"]:
                total_lines += 1
                if line["name"] in names: print(f"ERROR {oid}: duplicate line name {line['name']}"); errors += 1
                names.add(line["name"])
                board = chess.Board()
                path_sans = []
                for i, mv in enumerate(parse(line["moves"])):
                    try:
                        move = board.parse_san(mv["san"])
                    except Exception as e:
                        print(f"ERROR {oid} / {line['name']}: move {i+1} '{mv['san']}' illegal ({e})\n      after: {' '.join(path_sans)}")
                        errors += 1
                        break
                    canon = board.san(move)
                    if canon != mv["san"]:
                        print(f"FIXSAN {oid} / {line['name']}: '{mv['san']}' -> '{canon}'")
                        if fix:
                            line["moves"] = re.sub(r"(?<![A-Za-z0-9=+#-])" + re.escape(mv["san"]) + r"(?=[!?\s{]|$)", canon, line["moves"], count=1)
                            changed = True
                        else:
                            warnings += 1
                    tree.setdefault(tuple(path_sans), set()).add(canon)
                    path_sans.append(canon)
                    board.push(move)
                else:
                    leaves.append((line["name"], tuple(path_sans)))
                    learner_white = op["side"] == "w"
                    last_by_white = len(path_sans) % 2 == 1
                    if learner_white != last_by_white:
                        print(f"WARN {oid} / {line['name']}: line ends on an opponent move")
                        warnings += 1
            side_white = op["side"] == "w"
            for p, nxt in tree.items():
                white_to_move = len(p) % 2 == 0
                if white_to_move == side_white and len(nxt) > 1:
                    print(f"WARN {oid}: learner has multiple replies {sorted(nxt)} after {' '.join(p) or 'start'}")
                    warnings += 1
            for n1, p1 in leaves:
                for n2, p2 in leaves:
                    if n1 != n2 and len(p1) < len(p2) and p2[:len(p1)] == p1:
                        print(f"WARN {oid}: line '{n1}' is a prefix of '{n2}'")
                        warnings += 1
        if changed:
            path.write_text(json.dumps(openings, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n{len(ids)} openings, {total_lines} lines, {errors} errors, {warnings} warnings")
    return errors

if __name__ == "__main__":
    sys.exit(1 if main("--fix" in sys.argv) else 0)
