# ボードゲームアプリ

スマホ向けボードゲーム集（オセロ / トランプ / 将棋 / どうぶつしょうぎ）。

- 公開URL: GitHub Pages（`/docs`）
- リポジトリ: fantianhesha918-star/board-games
- 公開元: `master` ブランチの `/docs` フォルダ
- ビルド不要。`docs/` 内の静的ファイルをそのまま公開

## ページ構成

- `docs/index.html` … ハブ（ゲーム選択）＋オセロ（設定・対局を画面切替）
- `docs/trump.html` … トランプのサブメニュー
- `docs/memory.html` … 神経衰弱
- 各ページは自己完結（共有JSファイルなし、file:// でも動く）

## 更新手順

`docs/` 内を編集 → `git add -A && git commit -m "..." && git push` で反映。

## 収録状況

- オセロ: 実装済み（CPU対戦 / 2人対面、CPU強さ3段階）。盤・駒はチンチラグレー素材
- トランプ
  - 神経衰弱: 実装済み（CPU対戦 / 2人対面、CPU記憶力3段階、12/20/30枚）
  - ババ抜き / 七並べ / 大富豪 / 一人ゲーム（ソリティア等）: 準備中
- 将棋 / どうぶつしょうぎ: 準備中

## 素材

- オセロ盤: `チンチラグレー_オセロ素材/othello_board.svg` を `index.html` にインライン化
- オセロ駒: `othello_black.png` / `white.png` を 256px WebP 化 → `docs/assets/othello/`
- トランプ54枚: `未使用/チンチラグレー_トランプ全54枚` を 340px WebP 化 → `docs/assets/cards/`（`S1`〜`S13`,`C*`,`H*`,`D*`,`JB`,`JR`）
- カード裏面: `docs/assets/cards/back.svg`（自作。素材に裏面画像が無いため）
- 素材フォルダは `クロコ確認フォルダ/アプリ素材/ボードゲームアプリ/`（`使用済み/` `未使用/` に仕分け、`_使用状況.md` あり）
