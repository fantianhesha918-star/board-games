// クロスワードを自動生成し、docs/crossword.htmlのPUZZLES配列に追記するツール。
//
// 使い方:
//   node tools/generate_crossword.js [問題数] [列サイズ...]
//   例) node tools/generate_crossword.js 4 8x8 9x9 7x9 9x7
//   引数を省略すると、8x8を既定サイズとして指定数(既定4問)生成する。
//
// 仕組み:
//   1. tools/wordbank_adult.json(大人向け単語バンク)を単語プールとして使う。
//      2026-09-21にユーザーから「対象は大人」と明言され、既存のid1〜52(子ども向け
//      ひらがな問題)は残しつつ、今後の新規生成はすべて大人向け語彙で行う方針になった。
//      そのため既存PUZZLESからの単語抽出はせず、このファイルだけを参照する。
//   2. 標準的なクロスワード作成アルゴリズム(種語を置き、他の単語を既存マスに
//      交差させながら追加していく)で、他のどの単語とも交差しない「孤立ワード」が
//      構造上発生しないようにグリッドを組み立てる。
//   3. 生成後にPUZZLES配列の末尾へ追記する。
//
// 語彙を増やしたいときは tools/wordbank_adult.json に追記する(ひらがな表記、
// カタカナ・固有名詞は避ける。フレーズではなく単語・熟語単位にする)。
// 生成後は必ず `node tools/check_crossword.js` を実行して検証すること。
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'docs', 'crossword.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const startMarker = 'const PUZZLES=';
const startIdx = html.indexOf(startMarker);
const endIdx = html.indexOf('\n  ];', startIdx);
if (startIdx === -1 || endIdx === -1) throw new Error('PUZZLES配列が見つかりません');
// eslint-disable-next-line no-eval
const PUZZLES = eval(html.slice(startIdx + startMarker.length, endIdx + '\n  ]'.length));

const adult = JSON.parse(fs.readFileSync(path.join(__dirname, 'wordbank_adult.json'), 'utf8'));

const bankMap = new Map();
for (const w of adult) bankMap.set(w.answer, w.clue);
const FULL_BANK = [...bankMap.entries()].map(([answer, clue]) => ({ answer, clue }));

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ===== 本格ソルバー方式(黒マスパターン先決め + 全マス同時充填) =====
// 2026-09-23、feasibility_solver.jsでの実験により、以下が判明したため実装:
//   1. パターン生成は「完全ランダム→検証、ダメならやり直し」ではなく、1マスずつ
//      候補を試してその場で妥当性チェックする「逐次構築方式」にすると、
//      9x9以上でもほぼ100%パターン生成に成功する(旧方式は10x10以上でほぼ0%)。
//   2. 充填(単語当てはめ)は「1つのパターンに長時間かける」より「複数の異なる
//      パターンを短時間(0.5秒程度)ずつ試し、ダメなら次のパターンへ」の方が、
//      同じ計算時間でも成功率が大幅に高い(オフライン生成なので数秒〜数十秒
//      かけてよい)。
//   3. 黒マス密度は20%では現状の語彙(3000語)でも成功率0%。25〜30%を狙うと
//      7x7〜10x10で実用的な成功率に達する(9x9/30%で100%、10x10/30%で90%等)。
// この方式は「1語ずつ既存マスに交差させる」現行方式(generateOne)とは別物で、
// 黒マス率を20〜30%程度まで下げられる可能性がある代わりに、生成失敗もありうる
// (--solverフラグで有効化。失敗時は当該問題をスキップする)。
function symmetricPairs(R, C) {
  const cells = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const r2 = R - 1 - r, c2 = C - 1 - c;
    if (r > r2 || (r === r2 && c > c2)) continue;
    cells.push([r, c]);
  }
  return cells;
}

function validPattern(grid, R, C) {
  for (let r = 0; r < R; r++) {
    let run = 0;
    for (let c = 0; c <= C; c++) {
      const white = c < C && grid[r][c] === '.';
      if (white) run++; else { if (run === 1) return false; run = 0; }
    }
  }
  for (let c = 0; c < C; c++) {
    let run = 0;
    for (let r = 0; r <= R; r++) {
      const white = r < R && grid[r][c] === '.';
      if (white) run++; else { if (run === 1) return false; run = 0; }
    }
  }
  return true;
}

// 逐次構築方式: 1ペア(180度対称)ずつランダム順で黒マス化を試し、その場で
// validPatternを満たすかチェックする。だめならそのペアは白マスのまま次へ。
function patternGreedy(R, C, blackRatioTarget, rng, maxRestarts) {
  const cells = symmetricPairs(R, C);
  const targetBlack = Math.round(R * C * blackRatioTarget / 2);
  for (let restart = 0; restart < maxRestarts; restart++) {
    const grid = Array.from({ length: R }, () => Array(C).fill('.'));
    const order = shuffle(cells, rng);
    let placed = 0;
    for (const [r, c] of order) {
      if (placed >= targetBlack) break;
      if (grid[r][c] === '#') continue;
      grid[r][c] = '#'; grid[R - 1 - r][C - 1 - c] = '#';
      if (validPattern(grid, R, C)) placed++;
      else { grid[r][c] = '.'; grid[R - 1 - r][C - 1 - c] = '.'; }
    }
    if (placed >= targetBlack * 0.85) return grid;
  }
  return null;
}

function extractSlots(grid, R, C) {
  const slots = [];
  for (let r = 0; r < R; r++) {
    let c = 0;
    while (c < C) {
      if (grid[r][c] === '#') { c++; continue; }
      const start = c;
      while (c < C && grid[r][c] !== '#') c++;
      if (c - start >= 2) slots.push({ dir: 'across', row: r, col: start, len: c - start });
    }
  }
  for (let c = 0; c < C; c++) {
    let r = 0;
    while (r < R) {
      if (grid[r][c] === '#') { r++; continue; }
      const start = r;
      while (r < R && grid[r][c] !== '#') r++;
      if (r - start >= 2) slots.push({ dir: 'down', row: start, col: c, len: r - start });
    }
  }
  return slots;
}
function cellsOfSlot(slot) {
  const arr = [];
  for (let k = 0; k < slot.len; k++) arr.push(slot.dir === 'across' ? [slot.row, slot.col + k] : [slot.row + k, slot.col]);
  return arr;
}

// MRV(候補数最小のスロットを優先)によるバックトラック充填。timeLimitMsを
// 超えたら'timeout'を返して即座に打ち切る(呼び出し側で次のパターンへ移る)。
function solveFill(grid, R, C, byLen, rng, timeLimitMs) {
  const slots = extractSlots(grid, R, C);
  if (!slots.length) return null;
  const fill = Array.from({ length: R }, () => Array(C).fill(null));
  const usedWords = new Set();
  const slotCells = slots.map(cellsOfSlot);
  const t0 = Date.now();
  function candidatesFor(idx) {
    const slot = slots[idx], cells = slotCells[idx];
    const pool = byLen.get(slot.len) || [];
    const cand = [];
    for (const w of pool) {
      if (usedWords.has(w)) continue;
      let ok = true;
      for (let k = 0; k < w.length; k++) {
        const [r, c] = cells[k];
        if (fill[r][c] != null && fill[r][c] !== w[k]) { ok = false; break; }
      }
      if (ok) cand.push(w);
    }
    return cand;
  }
  function pickNextSlot(remaining) {
    let best = -1, bestCount = Infinity, bestCand = null;
    for (const idx of remaining) {
      const cand = candidatesFor(idx);
      if (cand.length < bestCount) { bestCount = cand.length; best = idx; bestCand = cand; if (bestCount === 0) break; }
    }
    return { best, bestCand };
  }
  function backtrack(remaining) {
    if (Date.now() - t0 > timeLimitMs) return 'timeout';
    if (!remaining.size) return true;
    const { best, bestCand } = pickNextSlot(remaining);
    if (bestCand.length === 0) return false;
    const order = shuffle(bestCand, rng);
    const cells = slotCells[best];
    const nextRemaining = new Set(remaining); nextRemaining.delete(best);
    for (const w of order) {
      const changed = [];
      for (let k = 0; k < w.length; k++) {
        const [r, c] = cells[k];
        if (fill[r][c] == null) { fill[r][c] = w[k]; changed.push([r, c]); }
      }
      usedWords.add(w);
      const res = backtrack(nextRemaining);
      if (res === true) return true;
      if (res === 'timeout') { for (const [r, c] of changed) fill[r][c] = null; usedWords.delete(w); return 'timeout'; }
      for (const [r, c] of changed) fill[r][c] = null;
      usedWords.delete(w);
    }
    return false;
  }
  const remaining = new Set(slots.map((_, i) => i));
  const res = backtrack(remaining);
  return res === true ? { fill, slots, slotCells } : null;
}

// 複数の異なるパターンを、それぞれ短時間(perAttemptMs)ずつ試す。
// totalBudgetMsに達するまで、失敗したら即座に別パターンへ切り替える。
function generateSolverBased(R, C, blackRatio, byLen, seedBase, totalBudgetMs, perAttemptMs) {
  const t0 = Date.now();
  let attempt = 0;
  while (Date.now() - t0 < totalBudgetMs) {
    const rng = mulberry32(seedBase * 1000003 + attempt);
    const grid = patternGreedy(R, C, blackRatio, rng, 10);
    if (grid) {
      const remainingBudget = Math.min(perAttemptMs, totalBudgetMs - (Date.now() - t0));
      if (remainingBudget > 0) {
        const solved = solveFill(grid, R, C, byLen, mulberry32(seedBase * 31 + attempt + 1), remainingBudget);
        if (solved) {
          const finalGrid = grid.map((row, r) => row.map((ch, c) => ch === '#' ? '#' : solved.fill[r][c]).join(''));
          const words = solved.slots.map((slot, i) => {
            const cells = solved.slotCells[i];
            const answer = cells.map(([r, c]) => solved.fill[r][c]).join('');
            return { row: slot.row, col: slot.col, dir: slot.dir, len: slot.len, answer, clue: bankMap.get(answer) || '' };
          });
          return { grid: finalGrid, words, R, C, attempts: attempt + 1 };
        }
      }
    }
    attempt++;
  }
  return null;
}

function generateOne(R, C, pool, targetWords, rng, minLongWords, avoidSeeds) {
  const grid = Array.from({ length: R }, () => Array(C).fill(null));
  const placed = [];
  const used = new Set();
  const inB = (r, c) => r >= 0 && r < R && c >= 0 && c < C;

  function canPlace(word, row, col, dir) {
    let overlap = 0;
    const cells = [];
    for (let k = 0; k < word.length; k++) {
      const r = dir === 'across' ? row : row + k;
      const c = dir === 'across' ? col + k : col;
      if (!inB(r, c)) return null;
      const ex = grid[r][c];
      const ch = word[k];
      if (ex != null) {
        if (ex !== ch) return null;
        overlap++;
        cells.push({ r, c, ch, isNew: false });
      } else {
        cells.push({ r, c, ch, isNew: true });
      }
    }
    if (overlap === 0 && placed.length > 0) return null;
    const beforeR = dir === 'across' ? row : row - 1;
    const beforeC = dir === 'across' ? col - 1 : col;
    if (inB(beforeR, beforeC) && grid[beforeR][beforeC] != null) return null;
    const afterR = dir === 'across' ? row : row + word.length;
    const afterC = dir === 'across' ? col + word.length : col;
    if (inB(afterR, afterC) && grid[afterR][afterC] != null) return null;
    for (const cell of cells) {
      if (!cell.isNew) continue;
      if (dir === 'across') {
        if (inB(cell.r - 1, cell.c) && grid[cell.r - 1][cell.c] != null) return null;
        if (inB(cell.r + 1, cell.c) && grid[cell.r + 1][cell.c] != null) return null;
      } else {
        if (inB(cell.r, cell.c - 1) && grid[cell.r][cell.c - 1] != null) return null;
        if (inB(cell.r, cell.c + 1) && grid[cell.r][cell.c + 1] != null) return null;
      }
    }
    return { cells, overlap };
  }

  function commit(answer, clue, row, col, dir, cells) {
    for (const cell of cells) grid[cell.r][cell.c] = cell.ch;
    placed.push({ row, col, dir, len: answer.length, answer, clue });
    used.add(answer);
  }

  let seedPool = pool.filter(w => w.answer.length >= 6 && !avoidSeeds.has(w.answer));
  if (!seedPool.length) seedPool = pool.filter(w => w.answer.length >= 5 && !avoidSeeds.has(w.answer));
  if (!seedPool.length) seedPool = pool.filter(w => w.answer.length >= 4 && !avoidSeeds.has(w.answer));
  if (!seedPool.length) seedPool = pool.filter(w => !avoidSeeds.has(w.answer));
  if (!seedPool.length) seedPool = pool;
  if (!seedPool.length) return null;
  const seed = shuffle(seedPool, rng)[0];
  const startRow = Math.floor(R / 2);
  const startCol = Math.max(0, Math.floor((C - seed.answer.length) / 2));
  const first = canPlace(seed.answer, startRow, startCol, 'across');
  if (!first) return null;
  commit(seed.answer, seed.clue, startRow, startCol, 'across', first.cells);

  // 目標語数(targetWords)に達しても打ち切らず、置ける単語がなくなるまで
  // 詰め込み続けることで黒マス(空きマス)を減らす。stalledRoundsは「1周丸ごと
  // 何も置けなかった」回数で、シャッフル順次第で後の周に置ける場合があるため
  // 数回粘ってから終了する。
  let stalledRounds = 0;
  while (stalledRounds < 4) {
    const candidates = shuffle(pool.filter(w => !used.has(w.answer)), rng);
    let placedAny = false;
    for (const w of candidates) {
      const options = [];
      for (let r = 0; r < R; r++) {
        for (let c = 0; c < C; c++) {
          const ch = grid[r][c];
          if (ch == null) continue;
          for (let i = 0; i < w.answer.length; i++) {
            if (w.answer[i] !== ch) continue;
            const a = canPlace(w.answer, r, c - i, 'across');
            if (a) options.push({ row: r, col: c - i, dir: 'across', res: a });
            const d = canPlace(w.answer, r - i, c, 'down');
            if (d) options.push({ row: r - i, col: c, dir: 'down', res: d });
          }
        }
      }
      if (!options.length) continue;
      options.sort((x, y) => y.res.overlap - x.res.overlap);
      const pick = options[Math.floor(rng() * Math.min(3, options.length))];
      commit(w.answer, w.clue, pick.row, pick.col, pick.dir, pick.res.cells);
      placedAny = true;
    }
    stalledRounds = placedAny ? 0 : stalledRounds + 1;
  }

  const longCount = placed.filter(w => w.len >= 6).length;
  if (placed.length < targetWords * 0.7 || longCount < minLongWords) return null;

  let minR = R, maxR = -1, minC = C, maxC = -1;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (grid[r][c] != null) {
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  }
  const nr = maxR - minR + 1, nc = maxC - minC + 1;
  const finalGrid = Array.from({ length: nr }, () => Array(nc).fill('#'));
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
    const v = grid[minR + r][minC + c];
    if (v != null) finalGrid[r][c] = v;
  }
  const finalWords = placed.map(w => ({ ...w, row: w.row - minR, col: w.col - minC }));
  return { grid: finalGrid.map(row => row.join('')), words: finalWords, R: nr, C: nc };
}

function numberAndSplit(result) {
  const { grid, words } = result;
  const R = grid.length, C = grid[0].length;
  const acrossStarts = new Map(), downStarts = new Map();
  for (const w of words) (w.dir === 'across' ? acrossStarts : downStarts).set(`${w.row},${w.col}`, w);
  let num = 1;
  const across = [], down = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const key = `${r},${c}`;
    const a = acrossStarts.get(key), d = downStarts.get(key);
    if (!a && !d) continue;
    if (a) across.push({ num, row: a.row, col: a.col, len: a.len, answer: a.answer, clue: a.clue });
    if (d) down.push({ num, row: d.row, col: d.col, len: d.len, answer: d.answer, clue: d.clue });
    num++;
  }
  return { across, down };
}

// ボーナス文字は「グリッド上の文字を寄せ集めて並び替えると出来上がる単語」。
// 短すぎると物足りないため、まず5〜10文字の単語から探し、見つからなければ
// 段階的に条件を緩めて必ず何かしら設定されるようにする。
function addPickup(p, rng) {
  const grid = p.grid;
  const cells = [];
  for (let r = 0; r < grid.length; r++) for (let c = 0; c < grid[0].length; c++) if (grid[r][c] !== '#') cells.push({ r, c, ch: grid[r][c] });
  const fullWords = new Set([...p.across, ...p.down].map(w => w.answer));

  function tryLen(minLen, maxLen) {
    const candWords = shuffle(FULL_BANK.filter(w => w.answer.length >= minLen && w.answer.length <= maxLen && !fullWords.has(w.answer)), rng);
    for (const w of candWords) {
      const byChar = new Map();
      for (const cell of cells) {
        if (!byChar.has(cell.ch)) byChar.set(cell.ch, []);
        byChar.get(cell.ch).push(cell);
      }
      for (const [ch, arr] of byChar) byChar.set(ch, shuffle(arr, rng));
      const idxMap = new Map();
      const chosen = [];
      let ok = true;
      for (const ch of w.answer) {
        const arr = byChar.get(ch);
        const idx = idxMap.get(ch) || 0;
        if (!arr || idx >= arr.length) { ok = false; break; }
        chosen.push(arr[idx]);
        idxMap.set(ch, idx + 1);
      }
      if (ok) return { answer: w.answer, pos: chosen };
    }
    return null;
  }

  const found = tryLen(5, 10) || tryLen(4, 10) || tryLen(2, 3);
  if (!found) return;
  p.pickup = found.pos.map((c, i) => ({ num: i + 1, row: c.r, col: c.c }));
  p.pickupAnswer = found.answer;
}

function tryGenerateWithRetries(R, C, pool, targetWords, minLongWords, avoidSeeds, seedBase) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const rng = mulberry32(seedBase * 1000 + attempt);
    const res = generateOne(R, C, pool, targetWords, rng, minLongWords, avoidSeeds);
    if (res) return res;
  }
  return null;
}

function parseSize(s) {
  const m = /^(\d+)x(\d+)$/.exec(s);
  if (!m) throw new Error(`サイズ指定が不正です: ${s} (例: 8x8)`);
  return { R: +m[1], C: +m[2] };
}

let args = process.argv.slice(2);
let themeFilter = null;
const themeArg = args.find(a => a.startsWith('--theme='));
if (themeArg) { themeFilter = themeArg.slice('--theme='.length); args = args.filter(a => a !== themeArg); }

// --solver: 本格ソルバー方式(黒マスパターン先決め+全マス充填)を使う。
// --black=0.25: 黒マス目標密度(省略時はサイズに応じて0.25〜0.30を自動選択)。
// --budget=20000: 1問あたりの合計計算時間(ms、省略時は101マス超なら60000、それ以外は20000を自動選択)。
// --attempt=500: パターン1個あたりの充填試行時間(ms)。
const solverMode = args.includes('--solver');
args = args.filter(a => a !== '--solver');
let blackRatioArg = null;
const blackArg = args.find(a => a.startsWith('--black='));
if (blackArg) { blackRatioArg = parseFloat(blackArg.slice('--black='.length)); args = args.filter(a => a !== blackArg); }
let solverBudgetMs = null; // nullなら生成時にサイズに応じて自動決定
const budgetArg = args.find(a => a.startsWith('--budget='));
if (budgetArg) { solverBudgetMs = parseInt(budgetArg.slice('--budget='.length), 10); args = args.filter(a => a !== budgetArg); }
let solverAttemptMs = 500;
const attemptArg = args.find(a => a.startsWith('--attempt='));
if (attemptArg) { solverAttemptMs = parseInt(attemptArg.slice('--attempt='.length), 10); args = args.filter(a => a !== attemptArg); }

let count = 4;
let sizeArgs = [];
if (args.length && /^\d+$/.test(args[0])) { count = +args[0]; sizeArgs = args.slice(1); }
else sizeArgs = args;
if (!sizeArgs.length) sizeArgs = ['8x8'];

// テーマ指定時は、そのカテゴリの単語 + 短い汎用語(2〜3文字、どのテーマでも自然に使える
// 接続用の言葉)だけに単語プールを絞り込む。汎用語がないと短い単語が不足し、
// 交差点を作れず生成に失敗しやすくなるため。
let POOL = FULL_BANK;
if (themeFilter) {
  const cats = [...new Set(adult.map(w => w.cat))];
  if (!cats.includes(themeFilter)) throw new Error(`不明なテーマ: ${themeFilter} (使えるテーマ: ${cats.join(', ')})`);
  const byAnswer = new Map(adult.map(w => [w.answer, w]));
  POOL = FULL_BANK.filter(w => {
    const orig = byAnswer.get(w.answer);
    return (orig && orig.cat === themeFilter) || w.answer.length <= 3;
  });
  console.log(`テーマ「${themeFilter}」: 単語プール${POOL.length}語(専用語+汎用の短い語)`);
}

// テーマ指定時はカテゴリの単語数が少なく、長い単語(6文字以上)も限られるため、
// 「長い単語を何語以上含むか」の必須条件を、実際にプールにある数に合わせて緩める。
const poolLongCount = POOL.filter(w => w.answer.length >= 6).length;
const specs = [];
for (let i = 0; i < count; i++) {
  const size = parseSize(sizeArgs[i % sizeArgs.length]);
  const cells = size.R * size.C;
  const defaultMinLong = cells >= 70 ? 4 : 3;
  const minLong = themeFilter ? Math.min(defaultMinLong, Math.max(0, poolLongCount - 1)) : defaultMinLong;
  specs.push({ ...size, target: Math.round(cells * 0.32), minLong });
}

// ソルバー方式用: POOLの単語を長さ別に索引化(重複語は既にbankMapでユニーク済み)。
const solverByLen = new Map();
if (solverMode) {
  for (const w of POOL) { if (!solverByLen.has(w.answer.length)) solverByLen.set(w.answer.length, []); solverByLen.get(w.answer.length).push(w.answer); }
}

const nextId = Math.max(...PUZZLES.map(p => p.id)) + 1;
const avoidSeeds = new Set();
const generated = [];
specs.forEach((spec, idx) => {
  if (solverMode) {
    const cells = spec.R * spec.C;
    const blackRatio = blackRatioArg != null ? blackRatioArg : (cells <= 49 ? 0.25 : 0.30);
    // 2026-09-23の実験で、11x11(121マス)は黒マス30%でも語彙不足ではなく単に
    // 探索量不足で失敗しやすいと判明(15秒予算で成功率25%→60秒予算で50%に上昇、
    // forward-checking等のアルゴリズム改善は同条件で有意差なしだった)。
    // オフライン生成なので大きい盤面ほど計算予算を増やす。
    const budget = solverBudgetMs != null ? solverBudgetMs : (cells > 100 ? 60000 : 20000);
    // 大きい盤面ほど1回の予算内でも成功率が5割程度にとどまるため、seedBaseを変えて
    // 最大3回まで再挑戦する(1回あたりの探索空間が変わり、別の乱数系列を試せる)。
    let res = null;
    for (let retry = 0; retry < 3 && !res; retry++) {
      res = generateSolverBased(spec.R, spec.C, blackRatio, solverByLen, (idx + 1) + retry * 97, budget, solverAttemptMs);
    }
    if (!res) { console.log(`spec${idx} (${spec.R}x${spec.C}, 黒マス${Math.round(blackRatio * 100)}%, ソルバー方式, 予算${budget}ms) 生成失敗、スキップ`); return; }
    const { across, down } = numberAndSplit(res);
    const p = { grid: res.grid, across, down };
    const rng = mulberry32(idx + 777);
    addPickup(p, rng);
    generated.push(p);
    console.log(`生成(ソルバー方式): ${res.R}x${res.C} 黒マス${Math.round(blackRatio * 100)}% 語数${across.length + down.length} (試行回数${res.attempts}, 予算${budget}ms)`);
    return;
  }
  const res = tryGenerateWithRetries(spec.R, spec.C, POOL, spec.target, spec.minLong, avoidSeeds, idx + 1);
  if (!res) { console.log(`spec${idx} (${spec.R}x${spec.C}) 生成失敗、スキップ`); return; }
  const { across, down } = numberAndSplit(res);
  const p = { grid: res.grid, across, down };
  const rng = mulberry32(idx + 777);
  addPickup(p, rng);
  const longest = [...across, ...down].sort((a, b) => b.len - a.len)[0];
  if (longest) avoidSeeds.add(longest.answer);
  generated.push(p);
  console.log(`生成: ${res.R}x${res.C} 語数${across.length + down.length} 最長${longest.len}`);
});

const CAT_LABEL = {
  shizen: '自然', gourmet: '食・酒', shigoto: '仕事・経済', kokoro: 'こころ',
  shikou: '思考', bunka: '文化・趣味', kenkou: '健康', kanyouku: '慣用句', seikatsu: '生活'
};

function esc(s) { return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
let block = '';
generated.forEach((p, idx) => {
  const id = nextId + idx;
  const theme = [...p.across, ...p.down].sort((a, b) => b.len - a.len).slice(0, 3).map(w => w.answer).join('・');
  const title = themeFilter ? `クロス${id}(${CAT_LABEL[themeFilter] || themeFilter})` : `クロス${id}`;
  block += `    {\n`;
  block += `      id:${id}, title:"${esc(title)}", theme:"${esc(theme)}",\n`;
  block += `      grid:[${p.grid.map(r => `"${esc(r)}"`).join(',')}],\n`;
  block += `      across:[\n`;
  p.across.forEach((w, i) => { block += `        {num:${w.num},row:${w.row},col:${w.col},len:${w.len},answer:"${esc(w.answer)}",clue:"${esc(w.clue)}"}${i < p.across.length - 1 ? ',' : ''}\n`; });
  block += `      ],\n      down:[\n`;
  p.down.forEach((w, i) => { block += `        {num:${w.num},row:${w.row},col:${w.col},len:${w.len},answer:"${esc(w.answer)}",clue:"${esc(w.clue)}"}${i < p.down.length - 1 ? ',' : ''}\n`; });
  block += `      ],\n`;
  if (p.pickup) block += `      pickup:[${p.pickup.map(pk => `{num:${pk.num},row:${pk.row},col:${pk.col}}`).join(',')}], pickupAnswer:"${esc(p.pickupAnswer)}"\n`;
  else block += `      pickup:[], pickupAnswer:""\n`;
  block += `    },\n`;
});

if (!generated.length) {
  console.log('1問も生成できませんでした。サイズや問題数を見直してください。');
  process.exit(1);
}

const newHtml = html.slice(0, endIdx + 1) + block + html.slice(endIdx + 1);
fs.writeFileSync(htmlPath, newHtml);
console.log(`${generated.length}問を追加しました(id:${nextId}〜${nextId + generated.length - 1})。node tools/check_crossword.js で検証してください。`);
