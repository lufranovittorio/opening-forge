# ♞ Opening Forge — Chess Opening Trainer

An interactive website for learning chess openings, variation by variation.

**▶ Play it here: https://lufranovittorio.github.io/opening-forge/**

## Features

- **33 openings, 200+ book lines.** Italian, Ruy Lopez, Scotch, King's Gambit, Vienna, Evans, Danish, Queen's Gambit, London, English, Catalan, Sicilian (Najdorf, Dragon, Anti-Sicilians), French, Caro-Kann, Scandinavian, Alekhine, Pirc, King's Indian, Nimzo-Indian, Grünfeld, Dutch, QGD, Slav, Benko, Budapest, Albin, Stafford, Petrov, Two Knights and more.
- **The opponent tries everything.** Main lines, sidelines, gambits, and *bad* moves too: Damiano, Latvian, Blackburne Shilling, Legal's Mate, the Lasker Trap, the Budapest smothered mate and others.
- **Every move is flagged.** Brilliant `!!`, Best ★, Book 📖, Interesting `!?`, Inaccuracy `?!`, Mistake `?`, Blunder `??`. When your opponent goes wrong, you have to find the best punishment.
- **Learn an opening.** Pick an opening from the library. New lines start in study mode, with an arrow and an explanation for each move. After that you drill them from memory.
- **Random opening (forced).** Get a random opening and stay locked into it until you have learned every line.
- **Hint settings.** *Show next move*: Auto / Always / Off, plus *Explain the next move before I play it*. There's also a 💡 Hint button (key `H`).
- Wrong moves are taken back. After two misses the book move is revealed. A line only counts as learned after a clean run, and lines you got wrong come back for review.
- Progress is saved in your browser (localStorage).

Keyboard: `H` hint · `R` restart line · `N` next line · `F` flip board.

## Run locally

It's a static site with no build step. Serve the folder over HTTP (ES modules don't load from `file://`):

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

## Adding openings

Openings live in `data/*.json`. Each line is written in plain move notation, with optional annotation glyphs and `{comments}`:

```json
{ "name": "Legal's Mate trap",
  "moves": "1.e4 e5 2.Nf3 Nc6 3.Bc4 d6 4.Nc3 Bg4 5.h3 Bh5? 6.Nxe5! Bxd1?? 7.Bxf7+ Ke7 8.Nd5# {Checkmate!}" }
```

All lines of an opening are merged into one move tree. Opponent moves annotated `?!`, `?` or `??` show up as Inaccuracy, Mistake or Blunder, and your reply to them counts as Best. Validate the data with [python-chess](https://pypi.org/project/chess/):

```bash
pip install chess
python tools/validate.py
```

The validator checks that every move is legal and spelled in canonical SAN, that you (the learner) never have two different book replies in the same position, that every line ends on your move, and that no line is just a prefix of another.

## Credits

- Board: [chessground](https://github.com/lichess-org/chessground) (GPL-3.0) with the cburnett piece set
- Rules: [chess.js](https://github.com/jhlywa/chess.js) (BSD-2)

Because chessground is GPL-3.0, this project is released under the GPL-3.0 as well.
