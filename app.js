/* Custom Wordsearch Maker — app.js
 * Two parts: (1) the puzzle generator (pure logic, no DOM), (2) the page UI.
 * Needs dictionary.js (window.WS_DICT) loaded first.
 */
(function (root) {
  'use strict';

  /* =====================================================================
   * 1. CONSTANTS
   * ===================================================================== */
  // direction name -> [rowStep, colStep]
  const DIR_VECTORS = {
    E: [0, 1], SE: [1, 1], S: [1, 0], SW: [1, -1],
    W: [0, -1], NW: [-1, -1], N: [-1, 0], NE: [-1, 1],
  };
  const ALL_DIRS = Object.keys(DIR_VECTORS);
  const OPPOSITE = { E: 'W', W: 'E', N: 'S', S: 'N', NE: 'SW', SW: 'NE', NW: 'SE', SE: 'NW' };

  // Rough English letter frequencies (percent)
  const EN_FREQ = {
    E: 12.0, T: 9.1, A: 8.2, O: 7.5, I: 7.0, N: 6.7, S: 6.3, H: 6.1, R: 6.0, D: 4.3,
    L: 4.0, C: 2.8, U: 2.8, M: 2.4, W: 2.4, F: 2.2, G: 2.0, Y: 2.0, P: 1.9, B: 1.5,
    V: 1.0, K: 0.8, J: 0.15, X: 0.15, Q: 0.1, Z: 0.07,
  };
  const LETTERS = Object.keys(EN_FREQ);
  const DICT_MAX_LEN = 10; // dictionary.js only holds words up to this length

  /* =====================================================================
   * 2. GRID SHAPES  (a "mask": which cells of a rows x cols box are usable)
   * ===================================================================== */
  const SHAPES = ['square', 'rectangle', 'circle', 'diamond', 'heart', 'star', 'triangle', 'plus'];

  function pointInPolygon(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function makeMask(shape, n) {
    let rows = n, cols = n;
    if (shape === 'rectangle') { rows = Math.round(n * 0.7); cols = Math.round(n * 1.35); }
    if (shape === 'triangle') { cols = Math.round(n * 1.5) | 1; } // odd width
    const active = new Uint8Array(rows * cols);
    const cr = (rows - 1) / 2, cc = (cols - 1) / 2;

    const star = [];
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? 1.0 : 0.56;
      star.push([Math.cos(ang) * rad, Math.sin(ang) * rad + 0.05]);
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c - cc) / (cols / 2); // roughly -1 .. 1
        const y = (r - cr) / (rows / 2);
        let on = true;
        switch (shape) {
          case 'circle': on = x * x + y * y <= 1.0; break;
          case 'diamond': on = Math.abs(x) + Math.abs(y) <= 1.0; break;
          case 'heart': {
            const hx = x * 1.3, hy = -y * 1.25 + 0.15;
            const a = hx * hx + hy * hy - 1;
            on = a * a * a - hx * hx * hy * hy * hy <= 0;
            break;
          }
          case 'star': on = pointInPolygon(x * 0.92, y * 0.92, star); break;
          case 'triangle': {
            const half = (cols - 1) / 2;
            const w = Math.max(0.5, (half * r) / (rows - 1));
            on = Math.abs(c - cc) <= w + 0.01;
            break;
          }
          case 'plus': on = Math.abs(x) <= 0.4 || Math.abs(y) <= 0.4; break;
          default: on = true;
        }
        active[r * cols + c] = on ? 1 : 0;
      }
    }
    return { rows, cols, active, shape };
  }

  /* =====================================================================
   * 3. WORD INPUT HELPERS
   * ===================================================================== */
  function normalizeWord(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
  }

  function reverseStr(s) { return s.split('').reverse().join(''); }

  /** Turn the textarea contents into a clean word list + messages. */
  function parseWords(text, dirs) {
    const words = [], seen = new Set(), warnings = [], errors = [];
    for (const tok of text.split(/[\s,;]+/)) {
      if (!tok) continue;
      const w = normalizeWord(tok);
      if (!w) continue;
      if (w.length < 3) { warnings.push(`“${tok}” is too short (3+ letters) and was skipped.`); continue; }
      if (seen.has(w)) { warnings.push(`“${tok}” was entered twice.`); continue; }
      seen.add(w); words.push(w);
    }
    // A word hiding inside another word would be found twice.
    const everyDirHasOpposite = dirs && dirs.length > 0 && dirs.every((d) => dirs.includes(OPPOSITE[d]));
    for (const a of words) {
      for (const b of words) {
        if (a === b) continue;
        if (b.includes(a)) errors.push(`“${a}” is part of “${b}”, so it would appear twice. Remove one of them.`);
        else if (everyDirHasOpposite && b.includes(reverseStr(a))) {
          errors.push(`“${a}” would read backwards inside “${b}”. Remove one, or turn off a backwards direction.`);
        }
      }
    }
    return { words, warnings, errors };
  }

  /* =====================================================================
   * 4. THE GENERATOR
   * ===================================================================== */
  function buildDict(raw) {
    const toSet = (s) => new Set(s.toUpperCase().split(' ').filter(Boolean));
    return { common: toSet(raw.common || ''), bad: toSet(raw.bad || '') };
  }

  /**
   * opts: {
   *   mask, words[], dirs[] (names), dict {common:Set, bad:Set},
   *   minLen: shortest accidental dictionary word to avoid (0 = don't check),
   *   blockBad: avoid rude words (checked in all 8 directions),
   *   matchStrength: 0..1 how strongly filler letters imitate the hidden words,
   *   maxMs: time budget
   * }
   * returns { ok, grid[], placements[], left, attempts, reason }
   */
  function generate(opts) {
    const { mask, words, dirs, dict } = opts;
    const minLen = opts.minLen || 0;
    const blockBad = opts.blockBad !== false;
    const m = opts.matchStrength == null ? 0.6 : opts.matchStrength;
    const maxMs = opts.maxMs || 5000;

    const rows = mask.rows, cols = mask.cols, active = mask.active, N = rows * cols;
    const dirIdx = ALL_DIRS.map((d) => DIR_VECTORS[d]);
    const enabled = ALL_DIRS.map((d) => dirs.indexOf(d) >= 0);
    const steps = dirIdx.map(([dr, dc]) => dr * cols + dc);
    const targets = new Set(words);
    const maxWalk = Math.max(DICT_MAX_LEN, ...words.map((w) => w.length));
    const common = minLen > 0 ? dict.common : null;
    const bad = blockBad ? dict.bad : null;

    /* ---- filler letter distribution: blend English with the user's words ---- */
    const eng = {}, mine = {};
    let engSum = 0, mineSum = 0;
    for (const L of LETTERS) { eng[L] = EN_FREQ[L]; engSum += eng[L]; mine[L] = 0; }
    for (const w of words) for (const ch of w) { mine[ch]++; mineSum++; }
    const weights = LETTERS.map((L) => (1 - m) * (eng[L] / engSum) + m * (mine[L] / (mineSum || 1)) + 0.002);
    const wTotal = weights.reduce((a, b) => a + b, 0);
    const pickLetter = () => {
      let x = Math.random() * wTotal;
      for (let i = 0; i < LETTERS.length; i++) { x -= weights[i]; if (x <= 0) return LETTERS[i]; }
      return 'E';
    };

    /* ---- scanning: find every word-like thing readable in the grid ---- */
    // Calls cb(string, startIdx, dirIndex, length) for every prefix (len>=2)
    // of the line starting at `start`, heading in direction k.
    function walk(grid, start, k, minLenIncl, cb) {
      let s = '';
      let r = (start / cols) | 0, c = start % cols;
      const [dr, dc] = dirIdx[k];
      for (let L = 1; L <= maxWalk; L++) {
        const idx = r * cols + c;
        if (r < 0 || c < 0 || r >= rows || c >= cols || !active[idx]) return;
        s += grid[idx];
        if (L >= 3 && L >= minLenIncl) cb(s, start, k, L);
        r += dr; c += dc;
      }
    }

    // Returns violations: [{cells[], type:'target'|'dict'|'bad', word}]
    // If `focus` is given, only things passing through that cell are considered.
    function scan(grid, placements, intendedKeys, focus) {
      const viol = [];
      const seenTargetKeys = new Map(); // word -> Set(keys)
      const handle = (s, start, k, L) => {
        const step = steps[k];
        let type = null;
        if (enabled[k] && targets.has(s)) type = 'target';
        else if (bad && L >= 3 && bad.has(s)) type = 'bad';
        else if (common && enabled[k] && L >= minLen && L <= DICT_MAX_LEN && common.has(s)) type = 'dict';
        if (!type) return;
        const cells = new Array(L);
        for (let j = 0; j < L; j++) cells[j] = start + j * step;
        if (focus !== undefined && cells.indexOf(focus) < 0) return;
        if (type === 'target') {
          const key = cells.slice().sort((a, b) => a - b).join(',');
          if (key !== intendedKeys.get(s)) viol.push({ cells, type, word: s });
          else {
            if (!seenTargetKeys.has(s)) seenTargetKeys.set(s, true);
          }
          return;
        }
        // accidental word: fine if it lies entirely inside a placed word
        for (const p of placements) {
          if (cells.every((i) => p.set.has(i))) return;
        }
        viol.push({ cells, type, word: s });
      };

      if (focus === undefined) {
        for (let idx = 0; idx < N; idx++) {
          if (!active[idx]) continue;
          for (let k = 0; k < 8; k++) walk(grid, idx, k, 3, (s, st, kk, L) => handle(s, st, kk, L));
        }
      } else {
        const fr = (focus / cols) | 0, fc = focus % cols;
        for (let k = 0; k < 8; k++) {
          const [dr, dc] = dirIdx[k];
          for (let back = 0; back < maxWalk; back++) {
            const r = fr - back * dr, c = fc - back * dc;
            if (r < 0 || c < 0 || r >= rows || c >= cols) break;
            const start = r * cols + c;
            if (!active[start]) break;
            walk(grid, start, k, back + 1, (s, st, kk, L) => handle(s, st, kk, L));
          }
        }
      }
      return viol;
    }

    /* ---- placing the hidden words ---- */
    function placeWords() {
      const grid = new Array(N).fill('');
      const fixed = new Uint8Array(N);
      const placements = [];
      const order = words.slice().sort((a, b) => b.length - a.length || Math.random() - 0.5);

      for (const w of order) {
        const L = w.length;
        const byDir = [];
        for (let k = 0; k < 8; k++) {
          if (!enabled[k]) continue;
          const [dr, dc] = dirIdx[k];
          const list = [];
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const er = r + dr * (L - 1), ec = c + dc * (L - 1);
              if (er < 0 || ec < 0 || er >= rows || ec >= cols) continue;
              let ok = true, overlap = 0;
              for (let j = 0; j < L; j++) {
                const idx = (r + dr * j) * cols + (c + dc * j);
                if (!active[idx]) { ok = false; break; }
                if (grid[idx] === '') continue;
                if (grid[idx] === w[j]) overlap++; else { ok = false; break; }
              }
              if (ok) list.push({ r, c, overlap });
            }
          }
          if (list.length) byDir.push({ k, list });
        }
        if (!byDir.length) return null;
        // pick a direction evenly, then a position (mild preference for crossings)
        const pick = byDir[(Math.random() * byDir.length) | 0];
        let tot = 0;
        for (const p of pick.list) tot += 1 + p.overlap;
        let x = Math.random() * tot, chosen = pick.list[0];
        for (const p of pick.list) { x -= 1 + p.overlap; if (x <= 0) { chosen = p; break; } }
        const [dr, dc] = dirIdx[pick.k];
        const cells = [];
        for (let j = 0; j < L; j++) {
          const idx = (chosen.r + dr * j) * cols + (chosen.c + dc * j);
          grid[idx] = w[j]; fixed[idx] = 1; cells.push(idx);
        }
        placements.push({
          word: w, r: chosen.r, c: chosen.c, dir: ALL_DIRS[pick.k],
          er: chosen.r + dr * (L - 1), ec: chosen.c + dc * (L - 1),
          cells, set: new Set(cells),
        });
      }
      const intendedKeys = new Map();
      for (const p of placements) intendedKeys.set(p.word, p.cells.slice().sort((a, b) => a - b).join(','));
      return { grid, fixed, placements, intendedKeys };
    }

    /* ---- fill + repair ---- */
    function fillAndRepair(st) {
      const { grid, fixed, placements, intendedKeys } = st;
      for (let i = 0; i < N; i++) if (active[i] && !fixed[i]) grid[i] = pickLetter();

      const rerollCell = (idx) => {
        let bestCh = grid[idx], bestScore = Infinity;
        for (let t = 0; t < 14; t++) {
          const ch = pickLetter();
          if (ch === grid[idx] && t < 13) continue;
          grid[idx] = ch;
          const sc = scan(grid, placements, intendedKeys, idx).length;
          if (sc < bestScore) { bestScore = sc; bestCh = ch; if (sc === 0) break; }
        }
        grid[idx] = bestCh;
      };

      let left = 0;
      for (let iter = 0; iter < 200; iter++) {
        const viol = scan(grid, placements, intendedKeys);
        if (!viol.length) return { ok: true, left: 0 };
        const toFix = new Set();
        let unfixable = 0;
        for (const v of viol) {
          const free = v.cells.filter((i) => !fixed[i]);
          if (!free.length) {
            if (v.type !== 'dict') return { ok: false, reason: v.type }; // placement itself is bad
            unfixable++;
          } else toFix.add(free[(Math.random() * free.length) | 0]);
        }
        left = unfixable;
        if (!toFix.size) return { ok: true, left };
        for (const idx of toFix) rerollCell(idx);
      }
      left = scan(grid, placements, intendedKeys).length;
      return { ok: true, left };
    }

    /* ---- main loop ---- */
    const t0 = Date.now();
    let best = null, attempts = 0, failReason = 'fit';
    while (Date.now() - t0 < maxMs && attempts < 400) {
      attempts++;
      const st = placeWords();
      if (!st) { failReason = 'fit'; continue; }
      const res = fillAndRepair(st);
      if (!res.ok) { failReason = 'clash'; continue; }
      if (!best || res.left < best.left) best = { grid: st.grid.slice(), placements: st.placements, left: res.left };
      if (res.left === 0) break;
    }
    if (!best) return { ok: false, reason: failReason, attempts };
    return {
      ok: true, grid: best.grid, placements: best.placements.map(({ set, ...rest }) => rest),
      left: best.left, attempts,
    };
  }

  const api = { makeMask, generate, buildDict, parseWords, normalizeWord, SHAPES, ALL_DIRS, DIR_VECTORS, OPPOSITE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  /* =====================================================================
   * 5. THE PAGE  (controls, themes, rendering, little celebrations)
   * ===================================================================== */
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const calm = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const SHAPE_LABELS = {
    square: 'Square', rectangle: 'Rectangle', circle: 'Circle', diamond: 'Diamond',
    heart: 'Heart', star: 'Star', triangle: 'Triangle', plus: 'Plus',
  };
  const SIZES = { 10: 'Small', 14: 'Medium', 18: 'Large', 24: 'Huge' };
  const ARROWS = { NW: '↖', N: '↑', NE: '↗', W: '←', E: '→', SW: '↙', S: '↓', SE: '↘' };
  const COMPASS = ['NW', 'N', 'NE', 'W', null, 'E', 'SW', 'S', 'SE'];
  const PRESETS = {
    simple: ['E', 'S'],
    diagonals: ['E', 'S', 'SE', 'NE'],
    all: ALL_DIRS.slice(),
  };
  const EXAMPLES = [
    { theme: 'ocean', title: 'Ocean Life', words: 'dolphin whale octopus seahorse jellyfish starfish coral turtle shark lobster crab anemone urchin walrus' },
    { theme: 'space', title: 'Out of This World', words: 'planet comet galaxy rocket orbit meteor asteroid nebula saturn jupiter eclipse satellite cosmos telescope' },
    { theme: 'candy', title: 'Sweet Treats', words: 'cupcake lollipop cookie brownie caramel sprinkles gumdrop fudge donut pretzel marshmallow toffee candy sundae' },
    { theme: 'jungle', title: 'Jungle Friends', words: 'monkey parrot jaguar toucan python gorilla chameleon sloth tiger vine river canopy frog banana' },
    { theme: 'dino', title: 'Dino Dig', words: 'tyrannosaurus triceratops fossil volcano raptor stegosaurus egg bones extinct meteor herbivore swamp claws' },
  ];

  /* Themes: page colours, puzzle tile colours, word-pill colours, and emoji decorations. */
  const THEMES = {
    rainbow: { label: 'Rainbow', icon: '🌈', deco: ['🌈', '⭐', '🎈', '✏️', '🍎'], bg: ['#fff6d9', '#ffe3f1'], accent: '#ff6b6b', dark: '#d44a4a', ink: '#2b2d42', tiles: ['#ffe9e6', '#fff6cc'], pills: ['#ffd6d6', '#ffe8b8', '#d9f2b4', '#c5e8ff', '#e3d4ff'] },
    ocean: { label: 'Ocean', icon: '🐠', deco: ['🐠', '🐙', '🐚', '🌊', '🐳'], bg: ['#d8f3ff', '#c9f1e6'], accent: '#0e9fbc', dark: '#0a7589', ink: '#0b3a53', tiles: ['#e3f6ff', '#d6f3ee'], pills: ['#bde9f7', '#c8f2e3', '#ffe3c2', '#ffd1d9'] },
    space: { label: 'Space', icon: '🚀', deco: ['🚀', '🪐', '⭐', '🌙', '👽'], bg: ['#e8e4ff', '#d4e6ff'], accent: '#6c5ce7', dark: '#4a3dbd', ink: '#231f4f', tiles: ['#eeeaff', '#e0eaff'], pills: ['#d6ceff', '#cfe2ff', '#ffeaa7', '#ffd3e6'] },
    jungle: { label: 'Jungle', icon: '🦜', deco: ['🦜', '🌴', '🐒', '🍃', '🦋'], bg: ['#e3f7d0', '#fff3c4'], accent: '#2fa84f', dark: '#1d7a37', ink: '#1d3b24', tiles: ['#eaf8da', '#fff6d0'], pills: ['#cdeeb0', '#ffe69a', '#ffd0b0', '#bfe9d6'] },
    candy: { label: 'Candy', icon: '🍭', deco: ['🍭', '🍩', '🧁', '🍬', '🍓'], bg: ['#ffe0f0', '#e2f5ff'], accent: '#ec4899', dark: '#bb2c78', ink: '#4a1d3b', tiles: ['#ffe9f3', '#e6f5ff'], pills: ['#ffc9e3', '#c9ecff', '#fff2b3', '#e0d1ff'] },
    dino: { label: 'Dinosaurs', icon: '🦖', deco: ['🦖', '🦕', '🌋', '🥚', '🦴'], bg: ['#fdeccb', '#e2f3cf'], accent: '#e67e22', dark: '#b05d12', ink: '#3b2a14', tiles: ['#fff0d4', '#e8f5d6'], pills: ['#ffd9a8', '#d3eeb0', '#ffe08a', '#c8e6e0'] },
    plain: { label: 'Plain', icon: '🖨️', deco: [], bg: ['#f4f4f5', '#ffffff'], accent: '#3f3f46', dark: '#18181b', ink: '#111111', tiles: ['#ffffff', '#ffffff'], pills: ['#f1f1f1'] },
  };
  const BW_THEME = { label: 'B&W', icon: '', deco: [], bg: ['#ffffff', '#ffffff'], accent: '#000000', dark: '#000000', ink: '#000000', tiles: ['#ffffff', '#ffffff'], pills: ['#ffffff'] };
  const RAINBOW = ['#ff595e', '#ff924c', '#f4b400', '#8ac926', '#1982c4', '#6a4c93'];
  const FUN_FONT = '"Chalkboard SE", "Marker Felt", "Comic Neue", "Comic Sans MS", "Trebuchet MS", sans-serif';

  const state = {
    shape: 'square', size: 14, dirs: PRESETS.diagonals.slice(),
    puzzle: null, showAnswers: false, dict: null,
    theme: 'rainbow', letters: 'tiles',
  };

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach((c) => e.appendChild(c));
    return e;
  }

  /* ---- control builders ---- */
  function buildShapePicker() {
    const box = $('#shapePicker');
    SHAPES.forEach((s) => {
      const m = makeMask(s, 11);
      let rects = '';
      for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
        if (m.active[r * m.cols + c]) rects += `<rect x="${c}" y="${r}" width="0.92" height="0.92" rx="0.25"/>`;
      }
      const btn = el('button', { type: 'button', class: 'chip shape', 'data-shape': s, 'aria-pressed': 'false', title: SHAPE_LABELS[s] });
      btn.innerHTML = `<svg viewBox="0 0 ${m.cols} ${m.rows}" aria-hidden="true">${rects}</svg><span>${SHAPE_LABELS[s]}</span>`;
      btn.addEventListener('click', () => { state.shape = s; syncControls(); });
      box.appendChild(btn);
    });
  }

  function buildSizePicker() {
    const box = $('#sizePicker');
    Object.keys(SIZES).forEach((n) => {
      const btn = el('button', { type: 'button', class: 'chip', 'data-size': n, 'aria-pressed': 'false' });
      btn.innerHTML = `${SIZES[n]}<small>${n}×${n}</small>`;
      btn.addEventListener('click', () => { state.size = +n; syncControls(); });
      box.appendChild(btn);
    });
  }

  function buildCompass() {
    const box = $('#compass');
    COMPASS.forEach((d) => {
      if (!d) { box.appendChild(el('span', { class: 'compass-mid', text: '★', 'aria-hidden': 'true' })); return; }
      const btn = el('button', { type: 'button', class: 'chip dir', 'data-dir': d, 'aria-pressed': 'false', 'aria-label': d + ' direction', text: ARROWS[d] });
      btn.addEventListener('click', () => {
        const i = state.dirs.indexOf(d);
        if (i >= 0) { if (state.dirs.length > 1) state.dirs.splice(i, 1); }
        else state.dirs.push(d);
        syncControls();
      });
      box.appendChild(btn);
    });
    $$('#presetPicker button').forEach((b) => b.addEventListener('click', () => {
      state.dirs = PRESETS[b.dataset.preset].slice(); syncControls();
    }));
  }

  function buildThemePicker() {
    const box = $('#themePicker');
    Object.keys(THEMES).forEach((k) => {
      const t = THEMES[k];
      const btn = el('button', { type: 'button', class: 'chip theme', 'data-theme': k, 'aria-pressed': 'false', title: t.label });
      btn.innerHTML = `<b>${t.icon}</b><span>${t.label}</span>`;
      btn.addEventListener('click', () => { applyTheme(k); sparkle(btn); });
      box.appendChild(btn);
    });
    $$('#letterPicker button').forEach((b) => b.addEventListener('click', () => {
      state.letters = b.dataset.letters;
      $$('#letterPicker button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('#grid').classList.toggle('plain', state.letters === 'plain');
    }));
  }

  function currentPreset() {
    for (const k in PRESETS) {
      const p = PRESETS[k];
      if (p.length === state.dirs.length && p.every((d) => state.dirs.indexOf(d) >= 0)) return k;
    }
    return null;
  }

  function syncControls() {
    $$('#shapePicker button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.shape === state.shape)));
    $$('#sizePicker button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.size === state.size)));
    $$('#compass .dir').forEach((b) => b.setAttribute('aria-pressed', String(state.dirs.indexOf(b.dataset.dir) >= 0)));
    const p = currentPreset();
    $$('#presetPicker button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === p)));
    updateWordFeedback();
  }

  /* ---- themes & decorations ---- */
  function patternUrl(deco) {
    if (!deco.length) return 'none';
    const pos = [[18, 36], [104, 22], [62, 96], [132, 118], [22, 146]];
    let t = '';
    deco.forEach((e, i) => {
      const [x, y] = pos[i % pos.length];
      t += `<text x="${x}" y="${y}" font-size="26" transform="rotate(${(i * 23) % 40 - 20} ${x} ${y})">${e}</text>`;
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="170" height="170" opacity="0.2">${t}</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  function applyTheme(key) {
    const t = THEMES[key];
    state.theme = key;
    const s = document.documentElement.style;
    s.setProperty('--bg1', t.bg[0]); s.setProperty('--bg2', t.bg[1]);
    s.setProperty('--accent', t.accent); s.setProperty('--accent-dark', t.dark);
    s.setProperty('--puzzle-ink', t.ink);
    s.setProperty('--tile-a', t.tiles[0]); s.setProperty('--tile-b', t.tiles[1]);
    for (let i = 0; i < 5; i++) s.setProperty('--pill' + i, t.pills[i % t.pills.length]);
    s.setProperty('--sheet-pattern', patternUrl(t.deco));
    document.body.dataset.theme = key;
    $$('#themePicker button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === key)));
    $('#decoL').textContent = t.deco[0] || '';
    $('#decoR').textContent = t.deco[1] || '';
    buildFloaters();
  }

  function buildFloaters() {
    const box = $('#floaters');
    box.innerHTML = '';
    const d = THEMES[state.theme].deco;
    if (calm || !d.length) return;
    for (let i = 0; i < 12; i++) {
      const s = el('span', { class: 'floater', text: d[i % d.length] });
      s.style.left = (i * 8.5 + Math.random() * 6).toFixed(1) + '%';
      s.style.fontSize = (22 + Math.random() * 28).toFixed(0) + 'px';
      s.style.animationDuration = (16 + Math.random() * 16).toFixed(1) + 's';
      s.style.animationDelay = (-Math.random() * 28).toFixed(1) + 's';
      box.appendChild(s);
    }
  }

  /* ---- celebrations ---- */
  function confetti() {
    if (calm) return;
    const t = THEMES[state.theme];
    const colors = [t.accent, '#ffca3a', '#8ac926', '#1982c4', '#ff595e', '#6a4c93'];
    const box = el('div', { class: 'confetti', 'aria-hidden': 'true' });
    for (let i = 0; i < 70; i++) {
      const p = el('i');
      if (t.deco.length && Math.random() < 0.3) p.textContent = pick(t.deco);
      else p.style.background = pick(colors);
      p.style.setProperty('--x', (Math.random() * 100).toFixed(1) + 'vw');
      p.style.setProperty('--dx', ((Math.random() - 0.5) * 30).toFixed(1) + 'vw');
      p.style.setProperty('--r', ((Math.random() - 0.5) * 900).toFixed(0) + 'deg');
      p.style.animationDuration = (2.2 + Math.random() * 1.8).toFixed(2) + 's';
      p.style.animationDelay = (Math.random() * 0.5).toFixed(2) + 's';
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 4800);
  }

  // a little burst of sparkles from an element
  function sparkle(target) {
    if (calm) return;
    const rc = target.getBoundingClientRect();
    const cx = rc.left + rc.width / 2, cy = rc.top + rc.height / 2;
    for (let i = 0; i < 8; i++) {
      const s = el('span', { class: 'spark', text: pick(['✨', '⭐', '💫']), 'aria-hidden': 'true' });
      const a = (i / 8) * Math.PI * 2, d = 34 + Math.random() * 26;
      s.style.left = cx + 'px'; s.style.top = cy + 'px';
      s.style.setProperty('--dx', Math.cos(a) * d + 'px');
      s.style.setProperty('--dy', Math.sin(a) * d + 'px');
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 800);
    }
  }

  /* ---- word box feedback ---- */
  let lastParsed = { words: [], errors: [] };
  function updateWordFeedback() {
    const parsed = parseWords($('#words').value, state.dirs);
    const mask = makeMask(state.shape, state.size);
    const longest = Math.max(mask.rows, mask.cols);
    const warnings = parsed.warnings.slice();
    const errors = parsed.errors.slice();
    parsed.words.forEach((w) => {
      if (w.length > longest) errors.push(`“${w}” (${w.length} letters) is too long for this grid.`);
    });
    const letters = parsed.words.reduce((a, w) => a + w.length, 0);
    const cells = mask.active.reduce((a, b) => a + b, 0);
    if (letters > cells * 0.55) warnings.push('That’s a lot of words for this grid. Try a larger size.');
    const n = parsed.words.length;
    const count = $('#wordCount');
    count.textContent = `${n} word${n === 1 ? '' : 's'}` + (n < 10 ? ' (10–20 works best)' : n > 20 ? ' (that’s over 20)' : ' ✓');
    count.className = n >= 10 && n <= 20 ? 'count good' : 'count';
    const box = $('#wordIssues');
    box.innerHTML = '';
    errors.forEach((t) => box.appendChild(el('li', { class: 'err', text: t })));
    warnings.forEach((t) => box.appendChild(el('li', { class: 'warn', text: t })));
    lastParsed = { words: parsed.words, errors };
    $('#generate').disabled = !n || errors.length > 0 || !state.dict;
  }

  /* ---- generation ---- */
  function setStatus(msg, kind) {
    const s = $('#status');
    s.textContent = msg || '';
    s.className = 'status' + (kind ? ' ' + kind : '');
  }

  function runGenerate() {
    if (!lastParsed.words.length || lastParsed.errors.length) return;
    const btn = $('#generate');
    btn.disabled = true; btn.textContent = 'Mixing the letters…';
    setStatus('Building and checking the puzzle…');
    setTimeout(() => {
      const mask = makeMask(state.shape, state.size);
      const t = Date.now();
      const res = generate({
        mask, words: lastParsed.words, dirs: state.dirs, dict: state.dict,
        minLen: +$('#strictness').value,
        blockBad: $('#blockBad').checked,
        matchStrength: +$('#matchStrength').value / 100,
        maxMs: 5000,
      });
      btn.textContent = 'Make my puzzle!';
      btn.disabled = false;
      if (!res.ok) {
        setStatus(res.reason === 'fit'
          ? 'Those words didn’t fit. Try a bigger grid, a simpler shape, fewer or shorter words, or more directions.'
          : 'Couldn’t find a layout without clashes. Try again, or change a word, direction or shape.', 'err');
        return;
      }
      state.puzzle = { mask, grid: res.grid, placements: res.placements, words: lastParsed.words.slice(), title: $('#title').value.trim() };
      const secs = ((Date.now() - t) / 1000).toFixed(1);
      if (res.left > 0) {
        setStatus(`Done in ${secs}s, but ${res.left} short accidental word${res.left === 1 ? '' : 's'} remained. Press the button again, or relax the check.`, 'warn');
      } else {
        setStatus(`Done in ${secs}s. Every word appears exactly once${+$('#strictness').value ? ' and no other dictionary words were found' : ''}.`, 'ok');
      }
      renderPuzzle();
      confetti();
      const out = $('#output');
      if (out.getBoundingClientRect().top > innerHeight * 0.6) out.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    }, 30);
  }

  /* ---- rendering ---- */
  function colorFor(i, total) { return `hsl(${Math.round((i * 360) / Math.max(total, 1) + 10) % 360} 80% 55%)`; }

  function renderPuzzle() {
    const p = state.puzzle;
    const out = $('#output');
    if (!p) { out.hidden = true; $('#placeholder').hidden = false; return; }
    out.hidden = false; $('#placeholder').hidden = true;
    const { mask, grid } = p;
    $('#puzzleTitle').textContent = p.title || 'Word Search';
    $('#cheer').hidden = true;

    const g = $('#grid');
    g.innerHTML = '';
    g.style.setProperty('--cols', mask.cols);
    g.style.setProperty('--rows', mask.rows);
    for (let r = 0; r < mask.rows; r++) for (let c = 0; c < mask.cols; c++) {
      const i = r * mask.cols + c;
      if (!mask.active[i]) { g.appendChild(el('div', { class: 'cell void' })); continue; }
      const cell = el('div', { class: 'cell ' + ((r + c) % 2 ? 'b' : 'a'), text: grid[i] });
      if (!calm) cell.style.animationDelay = Math.min((r + c) * 18, 700) + 'ms';
      g.appendChild(cell);
    }
    // answer overlay (animated "draw" per word)
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'overlay');
    svg.setAttribute('viewBox', `0 0 ${mask.cols} ${mask.rows}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    p.placements.forEach((pl, i) => {
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', pl.c + 0.5); line.setAttribute('y1', pl.r + 0.5);
      line.setAttribute('x2', pl.ec + 0.5); line.setAttribute('y2', pl.er + 0.5);
      line.setAttribute('pathLength', '1');
      line.setAttribute('stroke', colorFor(i, p.placements.length));
      line.setAttribute('stroke-width', '0.72');
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('stroke-opacity', '0.5');
      line.style.animationDelay = i * 70 + 'ms';
      svg.appendChild(line);
    });
    g.appendChild(svg);
    g.classList.toggle('answers', state.showAnswers);
    g.classList.toggle('plain', state.letters === 'plain');
    updateAnswersButton();

    const ul = $('#wordList');
    ul.innerHTML = '';
    p.words.slice().sort().forEach((w, i) => {
      const li = el('li', { text: w, tabindex: '0', role: 'button', title: 'Click to cross off' });
      li.style.setProperty('--pill', `var(--pill${i % 5})`);
      const toggle = () => {
        li.classList.toggle('done');
        if (li.classList.contains('done')) {
          sparkle(li);
          if (!ul.querySelector('li:not(.done)')) { $('#cheer').hidden = false; confetti(); }
        } else $('#cheer').hidden = true;
      };
      li.addEventListener('click', toggle);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      ul.appendChild(li);
    });
    $('#nameDate').hidden = !$('#nameLine').checked;
    fitGrid();
  }

  function updateAnswersButton() {
    $('#toggleAnswers').textContent = state.showAnswers ? '🙈 Hide answers' : '👀 Show answers';
    $('#toggleAnswers').setAttribute('aria-pressed', String(state.showAnswers));
  }

  function fitGrid() {
    const p = state.puzzle;
    if (!p) return;
    const avail = Math.max(200, $('#gridHolder').clientWidth - 44);
    const cell = Math.max(16, Math.min(42, Math.floor(avail / p.mask.cols)));
    $('#grid').style.setProperty('--cell', cell + 'px');
  }

  /* ---- printing: shrink the grid so everything fits on ONE page ---- */
  function printCellSize() {
    const p = state.puzzle;
    const listRows = Math.ceil(p.words.length / 4);
    const pageH = 930, pageW = 720;              // US Letter minus 0.5in margins, in CSS px (A4 has more room)
    const chrome = 16 + 8 + 50 + 8 + ($('#nameLine').checked ? 32 : 0) + 18 + 30 + listRows * 30 + 14 + 30;
    const availH = pageH - chrome;
    const availW = pageW - 28 - 18 - 12;
    return Math.max(14, Math.min(40, Math.floor(availW / p.mask.cols), Math.floor(availH / p.mask.rows)));
  }
  let printing = false;
  function enterPrint() {
    if (printing || !state.puzzle) return;
    printing = true;
    $('#grid').style.setProperty('--cell', printCellSize() + 'px');
  }
  function exitPrint() { printing = false; fitGrid(); }

  /* ---- export helpers ---- */
  function puzzleAsText() {
    const p = state.puzzle;
    const lines = [];
    if (p.title) lines.push(p.title, '');
    for (let r = 0; r < p.mask.rows; r++) {
      let line = '';
      for (let c = 0; c < p.mask.cols; c++) {
        const i = r * p.mask.cols + c;
        line += (p.mask.active[i] ? p.grid[i] : ' ') + ' ';
      }
      lines.push(line.replace(/\s+$/, ''));
    }
    lines.push('', 'Find these words:', p.words.slice().sort().join(', '));
    return lines.join('\n');
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function savePng() {
    const p = state.puzzle, bw = $('#bw').checked, t = bw ? BW_THEME : THEMES[state.theme];
    const { rows, cols } = p.mask;
    const cell = 44, pad = 28, bp = 14, bannerH = 74;
    const gw = cols * cell, gh = rows * cell;
    const W = gw + (pad + bp) * 2;
    const words = p.words.slice().sort();
    const perRow = Math.max(2, Math.floor((W - pad * 2) / 150));
    const pillW = (W - pad * 2 - (perRow - 1) * 8) / perRow, pillH = 34;
    const listH = Math.ceil(words.length / perRow) * (pillH + 8) + 56;
    const nameH = $('#nameLine').checked ? 44 : 0;
    const H = pad + bannerH + nameH + gh + bp * 2 + listH + pad;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, t.bg[0]); grad.addColorStop(1, t.bg[1]);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // title ribbon
    roundRect(ctx, pad, pad, W - pad * 2, bannerH - 14, 18);
    ctx.fillStyle = bw ? '#fff' : t.accent; ctx.fill();
    if (bw) { ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.stroke(); }
    ctx.fillStyle = bw ? '#000' : '#fff'; ctx.font = `bold 34px ${FUN_FONT}`;
    ctx.fillText(`${t.deco[0] || ''} ${p.title || 'Word Search'} ${t.deco[1] || ''}`.trim(), W / 2, pad + (bannerH - 14) / 2 + 2);

    let y = pad + bannerH;
    if (nameH) {
      ctx.fillStyle = t.ink; ctx.font = `20px ${FUN_FONT}`; ctx.textAlign = 'left';
      ctx.fillText('Name: ____________________', pad + 6, y + 14);
      ctx.textAlign = 'right'; ctx.fillText('Date: ____________', W - pad - 6, y + 14);
      ctx.textAlign = 'center'; y += nameH;
    }
    // board
    roundRect(ctx, pad, y, W - pad * 2, gh + bp * 2, 20);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = t.accent; ctx.stroke();
    const ox = pad + bp, oy = y + bp;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (!p.mask.active[i] || state.letters === 'plain') continue;
      roundRect(ctx, ox + c * cell + 2, oy + r * cell + 2, cell - 4, cell - 4, 10);
      ctx.fillStyle = (r + c) % 2 ? t.tiles[1] : t.tiles[0]; ctx.fill();
    }
    if (state.showAnswers) {
      p.placements.forEach((pl, i) => {
        ctx.strokeStyle = bw ? '#000' : colorFor(i, p.placements.length); ctx.globalAlpha = bw ? 0.28 : 0.5;
        ctx.lineWidth = cell * 0.72; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ox + (pl.c + 0.5) * cell, oy + (pl.r + 0.5) * cell);
        ctx.lineTo(ox + (pl.ec + 0.5) * cell, oy + (pl.er + 0.5) * cell);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = t.ink; ctx.font = `bold 26px ${FUN_FONT}`;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (p.mask.active[i]) ctx.fillText(p.grid[i], ox + (c + 0.5) * cell, oy + (r + 0.5) * cell + 2);
    }
    // word pills
    const ly = y + gh + bp * 2 + 28;
    ctx.fillStyle = t.dark; ctx.font = `bold 20px ${FUN_FONT}`;
    ctx.fillText('Find these words!', W / 2, ly);
    ctx.font = `bold 17px ${FUN_FONT}`;
    words.forEach((w, i) => {
      const px = pad + (i % perRow) * (pillW + 8), py = ly + 22 + Math.floor(i / perRow) * (pillH + 8);
      roundRect(ctx, px, py, pillW, pillH, pillH / 2);
      ctx.fillStyle = t.pills[i % t.pills.length]; ctx.fill();
      if (bw) { ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke(); }
      ctx.fillStyle = t.ink; ctx.fillText(w, px + pillW / 2, py + pillH / 2 + 1);
    });
    const a = document.createElement('a');
    a.download = (p.title || 'wordsearch').replace(/[^\w]+/g, '_') + '.png';
    a.href = cv.toDataURL('image/png');
    a.click();
  }

  /* ---- init ---- */
  function init() {
    if (root.WS_DICT) state.dict = buildDict(root.WS_DICT);
    else setStatus('dictionary.js did not load, so generation is unavailable. Keep it in the same folder as index.html.', 'err');

    // rainbow site title
    const title = $('#siteTitle');
    const text = title.textContent;
    title.textContent = '';
    title.setAttribute('aria-label', text);
    Array.from(text).forEach((ch, i) => {
      const s = el('span', { text: ch === ' ' ? '\u00a0' : ch, 'aria-hidden': 'true' });
      s.style.color = RAINBOW[i % RAINBOW.length];
      s.style.setProperty('--i', i);
      title.appendChild(s);
    });

    buildShapePicker(); buildSizePicker(); buildCompass(); buildThemePicker();
    applyTheme('rainbow');
    syncControls();

    $('#words').addEventListener('input', updateWordFeedback);
    $('#generate').addEventListener('click', runGenerate);
    $('#matchStrength').addEventListener('input', () => { $('#matchVal').textContent = $('#matchStrength').value + '%'; });
    $('#nameLine').addEventListener('change', () => { $('#nameDate').hidden = !$('#nameLine').checked; });
    $('#toggleAnswers').addEventListener('click', () => {
      state.showAnswers = !state.showAnswers;
      $('#grid').classList.toggle('answers', state.showAnswers);
      updateAnswersButton();
    });
    // click letters to highlight them while solving
    $('#grid').addEventListener('click', (e) => {
      const c = e.target;
      if (c.classList && c.classList.contains('cell') && !c.classList.contains('void')) c.classList.toggle('mark');
    });
    $('#print').addEventListener('click', () => window.print());
    $('#savePng').addEventListener('click', savePng);
    $('#copyText').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(puzzleAsText()); setStatus('Copied the puzzle as text.', 'ok'); }
      catch (e) { setStatus('Couldn’t copy automatically. Your browser blocked clipboard access.', 'warn'); }
    });
    $('#example').addEventListener('click', () => {
      const ex = pick(EXAMPLES);
      $('#words').value = ex.words.split(' ').join('\n');
      $('#title').value = ex.title;
      applyTheme(ex.theme);
      updateWordFeedback();
    });
    window.addEventListener('resize', fitGrid);
    window.addEventListener('beforeprint', enterPrint);
    window.addEventListener('afterprint', exitPrint);
    if (root.matchMedia) { // Safari & others: react to print media changing
      const mq = root.matchMedia('print');
      const onMq = (e) => (e.matches ? enterPrint() : exitPrint());
      if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
    }
    $('#bw').addEventListener('change', () => $('#sheet').classList.toggle('bw', $('#bw').checked));
  }

  init();
})(typeof window !== 'undefined' ? window : globalThis);
