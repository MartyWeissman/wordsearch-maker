# Wordsearch Maker

A free, browser-based tool for making custom word searches. Type your own words, pick a shape and difficulty, and get a printable puzzle in which **every word is hidden exactly once** and **no stray dictionary or rude words appear by accident**.

Everything runs in your browser. There is no server, no account, and nothing is uploaded anywhere.

## Features

- **Shapes:** square, rectangle, circle, diamond, heart, star, triangle and plus.
- **Sizes:** Small (10×10), Medium (14×14), Large (18×18) and Huge (24×24).
- **Directions:** Simple (→ ↓), Diagonals (→ ↓ ↘ ↗) or Everything (all 8, including backwards), with arrow buttons to fine-tune.
- **Smart filler letters:** the random letters imitate the letter frequencies of your own words, so the hidden words don't stand out.
- **Clean puzzles:** each word appears exactly once, and the grid is checked against a ~34,000-word English dictionary (so no accidental words) and a profanity list (checked in all 8 directions).
- **Kid-friendly themes:** Rainbow, Ocean, Space, Jungle, Candy, Dinosaurs and a plain printer-friendly one, with confetti, colorful tiles and a cross-off word list.
- **Printing:** always fits on one page, with an optional **Black & white** mode for printers without color ink. Optional Name / Date line for classroom use.
- **Extras:** show answers, click letters to highlight them, save as PNG, copy as text.

## How to use

1. Open `index.html` in any modern browser, or visit the published GitHub Pages site.
2. Choose a **shape**, a **size** and the **directions** words may run.
3. Type or paste **10–20 words** (one per line, or separated by commas or spaces). Words must be at least 3 letters. Click **Try an example** to see how it works.
4. Pick a **theme and style**, and optionally add the Name / Date line.
5. Press **Make my puzzle!**
6. Use the toolbar to **show answers**, **print**, **save an image** or **copy the text**. Tick **Black & white** first for an ink-saving version.

### Fine-tuning (optional)

- **Avoid accidental English words of 3+, 4+ or 5+ letters.** The default is 4+. The 3+ setting is strictest but can be slow, and in tight grids a few short words may survive (the page tells you if so).
- **Block rude words** (on by default).
- **Filler letters imitate my words:** a slider from 0% (ordinary English letter frequencies) to 100%.

### Tips

- If words won't fit, try a bigger size, a simpler shape, fewer or shorter words, or more directions.
- A word that is part of another word (like CAT in CATFISH) would appear twice, so the page asks you to remove one of them.
- Pressing **Make my puzzle!** again gives a fresh layout with the same words.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The page |
| `style.css` | Look and feel, themes, print layout |
| `app.js` | Puzzle generator and page logic |
| `dictionary.js` | Word lists used to avoid accidental words |
| `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` | Browser tab / home-screen icon |
| `LICENSE` | MIT license |

Keep all the files in the same folder.

## Publishing on GitHub Pages

Put the files in the root of a public repository, then go to **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, and save. The site appears at `https://YOUR-USERNAME.github.io/REPO-NAME/`.

## Credits

- **Word list:** [SCOWL (Spell Checker Oriented Word Lists)](http://wordlist.aspell.net/) by Kevin Atkinson and contributors, used via the [`wordlist-english`](https://www.npmjs.com/package/wordlist-english) package (levels 10, 20 and 35, 3–10 letter words). SCOWL is Copyright 2000–2016 by Kevin Atkinson, and permission is granted to use, copy, modify, distribute and sell the word lists for any purpose, provided the copyright notice appears in all copies and supporting documentation. The full SCOWL copyright notice, including the many other contributors, is available at the link above.
- **Profanity list:** [`badwords-list`](https://www.npmjs.com/package/badwords-list), Copyright (c) 2013 Maurice Butler, MIT License, plus a few additional terms.
- Built with help from [Claude](https://claude.ai).

## License

MIT License

Copyright (c) 2026 Marty Weissman

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

The word lists in `dictionary.js` are covered by their own licenses, described under Credits.
