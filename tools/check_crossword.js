// クロスワードのパズルデータ(docs/crossword.html内のPUZZLES配列)を検証するツール。
// 実行: node tools/check_crossword.js
// - 他のどの単語とも交差しない「孤立ワード」がないか
// - グリッド文字と across/down の answer が一致しているか
// - 採番(num)が方向ごとに重複していないか
// - どの単語にも属さないマス、番号が振られていない2マス以上の並びがないか
// - pickup(ボーナス文字)の位置がpickupAnswerと一致しているか
// - (警告のみ)クルーに答え(ひらがな)がそのまま含まれていないか
// クロスワードの追加・編集をしたら、必ずこれを実行してから完了とすること。
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'docs', 'crossword.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const startMarker = 'const PUZZLES=';
const startIdx = html.indexOf(startMarker);
if (startIdx === -1) throw new Error('PUZZLES配列が見つかりません');
const endIdx = html.indexOf('\n  ];', startIdx);
if (endIdx === -1) throw new Error('PUZZLES配列の終端が見つかりません');
// eslint-disable-next-line no-eval
const PUZZLES = eval(html.slice(startIdx + startMarker.length, endIdx + '\n  ]'.length));

let anyIssue = false;
function report(msg) { anyIssue = true; console.log(msg); }
const warnings = [];

for (const p of PUZZLES) {
  const grid = p.grid;
  const R = grid.length, C = grid[0].length;
  for (const row of grid) if (row.length !== C) report(`id:${p.id} 行の文字数不一致: "${row}"`);

  // グリッドと answer の突合
  for (const w of (p.across || [])) {
    let s = '';
    for (let k = 0; k < w.len; k++) s += grid[w.row][w.col + k];
    if (s !== w.answer) report(`id:${p.id} across num${w.num} grid不一致: grid="${s}" answer="${w.answer}"`);
  }
  for (const w of (p.down || [])) {
    let s = '';
    for (let k = 0; k < w.len; k++) s += grid[w.row + k][w.col];
    if (s !== w.answer) report(`id:${p.id} down num${w.num} grid不一致: grid="${s}" answer="${w.answer}"`);
  }

  // num重複チェック(方向ごと)
  for (const dir of ['across', 'down']) {
    const nums = (p[dir] || []).map(w => w.num);
    const dup = nums.filter((n, i) => nums.indexOf(n) !== i);
    if (dup.length) report(`id:${p.id} ${dir} 重複num: ${[...new Set(dup)].join(',')}`);
  }

  // 孤立ワードチェック(他のどの単語とも交差していないか)
  const cover = Array.from({ length: R }, () => Array.from({ length: C }, () => new Set()));
  const words = [];
  (p.across || []).forEach((w, i) => {
    const id = 'A' + i;
    words.push({ id, dir: 'across', ...w });
    for (let k = 0; k < w.len; k++) cover[w.row][w.col + k].add(id);
  });
  (p.down || []).forEach((w, i) => {
    const id = 'D' + i;
    words.push({ id, dir: 'down', ...w });
    for (let k = 0; k < w.len; k++) cover[w.row + k][w.col].add(id);
  });
  for (const w of words) {
    let touches = false;
    for (let k = 0; k < w.len; k++) {
      const r = w.dir === 'across' ? w.row : w.row + k;
      const c = w.dir === 'across' ? w.col + k : w.col;
      if (cover[r][c].size > 1) { touches = true; break; }
    }
    if (!touches) report(`id:${p.id} 孤立ワード: ${w.dir} #${w.num} (${w.row},${w.col}) "${w.answer}"`);
  }

  // 未カバーマス(#以外なのにどの単語にも属さない)
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    if (grid[r][c] !== '#' && cover[r][c].size === 0) report(`id:${p.id} 未カバーマス (${r},${c})="${grid[r][c]}"`);
  }

  // 2マス以上連続しているのに対応する across/down 定義がない「未定義run」
  for (let r = 0; r < R; r++) {
    let c = 0;
    while (c < C) {
      if (grid[r][c] === '#') { c++; continue; }
      const start = c;
      while (c < C && grid[r][c] !== '#') c++;
      const len = c - start;
      if (len >= 2 && !(p.across || []).some(w => w.row === r && w.col === start && w.len === len)) {
        report(`id:${p.id} across未定義run row${r} col${start} len${len}`);
      }
    }
  }
  for (let c = 0; c < C; c++) {
    let r = 0;
    while (r < R) {
      if (grid[r][c] === '#') { r++; continue; }
      const start = r;
      while (r < R && grid[r][c] !== '#') r++;
      const len = r - start;
      if (len >= 2 && !(p.down || []).some(w => w.col === c && w.row === start && w.len === len)) {
        report(`id:${p.id} down未定義run row${start} col${c} len${len}`);
      }
    }
  }

  // pickup(ボーナス文字)の整合性
  if (p.pickup && p.pickupAnswer) {
    let s = '';
    for (const pk of p.pickup) s += grid[pk.row][pk.col];
    if (s !== p.pickupAnswer) report(`id:${p.id} pickup不一致: got="${s}" expected="${p.pickupAnswer}"`);
  }

  // クルーに答え(ひらがな)がそのまま含まれていないか(警告扱い、エラーにはしない)
  // 2026-09-23、id1「ようふく」のクルーが「洋服、着る服のこと。」と答えを漢字で
  // そのまま書いてしまっていた不具合を機に追加。ひらがな一致のみ検出でき、
  // 「お母さん」等の漢字表記による自己言及は検出できないため、追加時は目視確認も必要。
  for (const w of [...(p.across || []), ...(p.down || [])]) {
    if (w.answer.length >= 3 && w.clue.includes(w.answer)) {
      warnings.push(`id:${p.id} ${w.answer} クルーに答えがそのまま含まれている疑い: "${w.clue}"`);
    }
  }
}

if (!anyIssue) console.log(`全チェック問題なし(${PUZZLES.length}問)`);
else process.exitCode = 1;
if (warnings.length) {
  console.log(`\n--- 警告(${warnings.length}件、要目視確認) ---`);
  warnings.forEach(w => console.log(w));
}
