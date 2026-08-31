# ボードゲームアプリ

スマホ向けボードゲーム集（オセロ / トランプ / 将棋 / どうぶつしょうぎ）。

- 公開URL: GitHub Pages（`/docs`）
- リポジトリ: fantianhesha918-star/board-games
- 公開元: `master` ブランチの `/docs` フォルダ
- ビルド不要。`docs/` 内の静的ファイルをそのまま公開

## ページ構成

- `docs/index.html` … ハブ（ゲーム選択）＋オセロ（設定・対局を画面切替。CPU/対面/オンラインの3モード）
- `docs/firebase-init.js` / `docs/online.js` … オンライン対戦用（Firebase Firestore・匿名認証。CDN読み込みでビルド不要）
- `firestore.rules` … オンライン対戦のセキュリティルール（リポジトリ直下。Firebaseコンソールへ手動デプロイ）
- `docs/trump.html` … トランプのサブメニュー
- `docs/memory.html` … 神経衰弱
- `docs/babanuki.html` … ババ抜き
- `docs/sevens.html` … 七並べ
- `docs/daifugo.html` … 大富豪
- `docs/rules.html` … 全ゲームの遊び方・ルール説明（index/trump のメニューから「遊び方・ルール説明」ボタンで開く）
- 各ページは自己完結（共有JSファイルなし、file:// でも動く）

## 更新手順

`docs/` 内を編集 → `git add -A && git commit -m "..." && git push` で反映。

## オンライン対戦（Firebase）

- Firebaseプロジェクト: `board-games-online-d0d21`（無料Sparkプラン・課金なし、リージョン asia-northeast1）
- 使用機能: Firestore（Standardエディション）＋ Authentication の匿名プロバイダのみ
- `docs/firebase-init.js` の `firebaseConfig`（apiKey含む）は**公開前提の値**でリポジトリにコミット済み。Firebaseクライアントの apiKey は秘密情報ではなく、実際のアクセス制御は `firestore.rules` 側で行う
- `firestore.rules` を変更したら、Firebaseコンソール（Firestore Database → ルール）に手動で貼り付けて「公開」する必要がある（自動デプロイなし）
- データ構造: `rooms/{4桁コード}` に `{game, status, host:{uid,name}, guest:{uid,name}|null, state, createdAt, updatedAt, hostSeen, guestSeen}`。`state` はゲーム依存（オセロは `{board(64文字), turn:"b"|"w", last, pass, winner}`）
- 現状オンライン対応はオセロのみ。他ゲームへ広げる場合は `firestore.rules` の `isMove()`（オセロ専用の手番判定）を拡張すること
- 無料プランのため部屋ドキュメントの自動削除（TTL）は未設定。ホストが対局を終了/離脱すると `closeRoom` で削除される。放置された部屋が溜まる場合は手動またはBlazeプランのTTLで対応

## 収録状況

- オセロ: 実装済み（CPU対戦 / 2人対面 / オンライン対戦、CPU強さ3段階）。盤・駒はチンチラグレー素材
  - オンライン対戦: 「オンライン」モードでニックネームを入れ「部屋を作る」→表示された4桁の部屋番号を相手に伝える。相手は同じ番号で「参加」。盤面・手番はFirebase Firestore経由でリアルタイム同期。ホスト=黒、ゲスト=白。投了・相手の接続状態表示あり。個人情報は持たない（ニックネーム＋部屋番号のみ）。Firebaseは無料Sparkプラン・課金なし。実際のアクセス制御は`firestore.rules`（一覧検索禁止／着手はその手番のプレイヤーのみ／部屋削除はホストのみ）
- トランプ（オセロ以外の4種は「人間の人数 1〜4 ＋ CPUの人数」を設定し合計2〜4人。人間2人以上は交代プレイ、手札を隠すゲームは手番交代ごとに「次の人に渡す」画面をはさむ）
  - 神経衰弱: 実装済み（2〜4人・人間/CPU混在可、CPU記憶力3段階、12/20/30枚）。盤は全員に見えるので交代画面なし。CPUは各自が独立した記憶を持つ
  - ババ抜き: 実装済み（2〜4人・人間/CPU混在可）。設定でシャッフル（ババ嵐：ジョーカー保持者が1ゲーム1回、サイコロ ➡/⬅=全員の手札を一斉に横移動、☠=不発）の あり/なし を選択可
  - 七並べ: 実装済み（2〜4人・人間/CPU混在可、パス回数 3/4/5、ジョーカー=ワイルドの あり/なし）。盤の空マスは「♥5」等の簡易表示、出たマスは実カードの絵柄を表示。A または K まで並ぶと反対端から折り返して置く（Aまで→K,Q,…／Kまで→A,2,…、到達側の通常方向は凍結）。ジョーカーは好きな空きマスに置ける“ワイルド”（1ゲーム1回きり・戻せない）で、置いた位置の本物カードを持つ人は次の手番で必ずそれを出す（パス不可、実カードに置き換わる）。バーストで手札を場に開く、順位表示
  - 大富豪: 実装済み（2〜4人・人間/CPU混在可、CPU強さ3段、連戦（階級＋カード交換）/1戦）。全ローカルルールを実装し設定画面で個別ON/OFF：B（8切り・革命・階段・縛り・スペ3返し・11バック・都落ち、既定ON）／C（7渡し・10捨て・5飛ばし・9リバース・反則あがり、既定OFF）
  - 一人ゲーム（ソリティア等）: 準備中
- 将棋 / どうぶつしょうぎ: 準備中

## 素材

- オセロ盤: `チンチラグレー_オセロ素材/othello_board.svg` を `index.html` にインライン化
- オセロ駒: `othello_black.png` / `white.png` を 256px WebP 化 → `docs/assets/othello/`
- トランプ54枚: `使用済み/チンチラグレー_トランプ全54枚` を 340px WebP 化 → `docs/assets/cards/`（`S1`〜`S13`,`C*`,`H*`,`D*`,`JB`,`JR`）
- カード裏面: `docs/assets/cards/back.webp`（`使用済み/チンチラグレー_カード裏面/card_back.jpg` を 340px WebP 化。柄控えめのシンプル版）
- メニューのトランプ／神経衰弱アイコンも `back.webp` を流用
- 素材フォルダは `クロコ確認フォルダ/アプリ素材/ボードゲームアプリ/`（`使用済み/` `未使用/` に仕分け、`_使用状況.md` あり）
