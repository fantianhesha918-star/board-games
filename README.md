# ボードゲームアプリ

スマホ向けボードゲーム集（オセロ / トランプ / 将棋 / どうぶつしょうぎ）。

- 公開URL: GitHub Pages（`/docs`）
- リポジトリ: fantianhesha918-star/board-games
- 公開元: `master` ブランチの `/docs` フォルダ
- 公開対象は `docs/index.html` のみ（単一HTMLで完結、ビルド不要）

## 更新手順

`docs/index.html` を編集 → `git add -A && git commit -m "..." && git push` で反映。

## 収録状況

- オセロ: 実装済み（CPU対戦 / 2人対面、CPU強さ3段階）。盤・駒はチンチラグレー素材を使用
- トランプ / 将棋 / どうぶつしょうぎ: 準備中

## 素材

- 盤: `クロコ確認フォルダ/アプリ素材/ボードゲームアプリ/チンチラグレー_オセロ素材/othello_board.svg` を `docs/index.html` にインライン化
- 駒: 同フォルダの `othello_black.png` / `othello_white.png` を 256px・WebP に変換して `docs/assets/othello/` に配置
- トランプ54枚素材（チンチラグレー）も同フォルダに用意済み（未組み込み）
