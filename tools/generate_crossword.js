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

  let stalledRounds = 0;
  while (placed.length < targetWords && stalledRounds < 3) {
    const candidates = shuffle(pool.filter(w => !used.has(w.answer)), rng);
    let placedAny = false;
    for (const w of candidates) {
      if (placed.length >= targetWords) break;
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

function addPickup(p, rng) {
  const grid = p.grid;
  const cells = [];
  for (let r = 0; r < grid.length; r++) for (let c = 0; c < grid[0].length; c++) if (grid[r][c] !== '#') cells.push({ r, c, ch: grid[r][c] });
  const fullWords = new Set([...p.across, ...p.down].map(w => w.answer));
  const candidates = [];
  for (let i = 0; i < cells.length; i++) for (let j = 0; j < cells.length; j++) {
    if (i === j) continue;
    const word = cells[i].ch + cells[j].ch;
    if (bankMap.has(word) && !fullWords.has(word)) candidates.push({ answer: word, pos: [cells[i], cells[j]] });
  }
  if (!candidates.length) return;
  const pick = candidates[Math.floor(rng() * candidates.length)];
  p.pickup = pick.pos.map((c, i) => ({ num: i + 1, row: c.r, col: c.c }));
  p.pickupAnswer = pick.answer;
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

const nextId = Math.max(...PUZZLES.map(p => p.id)) + 1;
const avoidSeeds = new Set();
const generated = [];
specs.forEach((spec, idx) => {
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
