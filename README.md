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
- 部屋には2スキーマ（`firestore.rules` は `seats` フィールドの有無で振り分け）:
  - **2人用（othello）** `rooms/{code}` = `{game, status, host, guest|null, state, createdAt, updatedAt, hostSeen, guestSeen}`。`state.turn`="b"/"w"、`state.winner`="b"/"w"/"draw"。着手はその手番のプレイヤーのみ許可。`online.js` の `createRoom`/`joinRoom`/`heartbeat(code,role)`
  - **複数人用（memory 等・2〜4席）** `rooms/{code}` = `{game, status, host, cap(人間席数), cpu(CPU席数), seats:[{uid,name}], state, createdAt, updatedAt, seen:{uid:ts}}`。`state.turn`=席番号 0..(cap+cpu-1)（0..cap-1=人間 seats[i]、以降=CPU）、`state.seq`=単調増加、`state.over`=終了フラグ。書き込みは「席についている本人＋seq増加」で許可（手番の厳密判定はクライアント側）。CPU席は席0の端末が動かす。`online.js` の `createRoomN`/`joinRoomN`/`heartbeatN(code)`
  - 新しい2人ゲーム→2人用、3人以上OKなゲーム→複数人用に合わせれば `firestore.rules` は変更不要
- 複数人用オンライン対応済み：神経衰弱・七並べ・ババ抜き・大富豪（いずれも `firestore.rules` は無変更で追加できた）
- `online.js` の `joinRoomN` は同時参加のレース（3人目以降がルールで弾かれる）に備えて数回リトライする
- ルール変更時は Firebaseコンソール（Firestore Database → ルール = `https://console.firebase.google.com/project/board-games-online-d0d21/firestore/rules`）に `firestore.rules` を手貼りして「公開」（自動デプロイなし。firebase-tools CLI は未導入＝アカウント全体のアクセス権をPCに置くのを避けるため、2026-08-31 ユーザー判断）
- 無料プランのため部屋ドキュメントの自動削除（TTL）は未設定。ホストが対局を終了/離脱すると `closeRoom` で削除される。放置された部屋が溜まる場合は手動またはBlazeプランのTTLで対応

## 収録状況

- オセロ: 実装済み（CPU対戦 / 2人対面 / オンライン対戦、CPU強さ3段階）。盤・駒はチンチラグレー素材
  - オンライン対戦: 「オンライン」モードでニックネームを入れ「部屋を作る」→表示された4桁の部屋番号を相手に伝える。相手は同じ番号で「参加」。盤面・手番はFirebase Firestore経由でリアルタイム同期。ホスト=黒、ゲスト=白。投了・相手の接続状態表示あり。個人情報は持たない（ニックネーム＋部屋番号のみ）。Firebaseは無料Sparkプラン・課金なし。実際のアクセス制御は`firestore.rules`（一覧検索禁止／着手はその手番のプレイヤーのみ／部屋削除はホストのみ）
- トランプ（オセロ以外の4種は「人間の人数 1〜4 ＋ CPUの人数」を設定し合計2〜4人。人間2人以上は交代プレイ、手札を隠すゲームは手番交代ごとに「次の人に渡す」画面をはさむ）
  - 神経衰弱: 実装済み（2〜4人・人間/CPU混在可、CPU記憶力3段階、12/20/30枚）。盤は全員に見えるので交代画面なし。CPUは各自が独立した記憶を持つ。盤はスクロールなしで全カードが見えるよう `fitBoard()` で画面高に合わせてカードを縮小。**オンライン対戦（別々の端末から2〜4人・空き席はCPUで補充可）対応**：「オンライン」モードで合計人数とCPU数を設定して部屋作成、他の人は番号で参加（満席で自動開始）。席順＝参加順＝手番順、CPU席は席0（ホスト）の端末が動かす。盤は共有なのでやり取りするのは state 全体（deck/taken/up/turn/scores/over/seq）
  - ババ抜き: 実装済み（2〜4人・人間/CPU混在可）。設定でシャッフル（ババ嵐：ジョーカー保持者が1ゲーム1回、サイコロ ➡/⬅=全員の手札を一斉に横移動、☠=不発）の あり/なし を選択可。**オンライン対戦（別々の端末から2〜4人・空き席はCPU補充可）対応**：複数人用スキーマ（`createRoomN`）。state＝`{cfg:{shuffle},hands[](CSV。"JK"=ジョーカー),done[],place[],finishSeq,pileP,usedShuffle[],turn(席番号),last,over,loser,seq}`。手札は各自の端末にだけ表示（データは全員に届くので「devtoolsで覗かない」前提）。1手ぶんの遷移は`applyBabaAction`（純粋関数。type=draw／shuffle）、シャッフルは手番を進めず・引く前の各席1回、CPU席は席0が`netCpuTurn`で動かす。引く相手＝次の未あがり席、引いた後は相手の残り手札をシャッフルして位置バレを軽減
  - 七並べ: 実装済み（2〜4人・人間/CPU混在可、パス回数 3/4/5、ジョーカー=ワイルドの あり/なし）。盤の空マスは「♥5」等の簡易表示、出たマスは実カードの絵柄を表示。A または K まで並ぶと反対端から折り返して置く（Aまで→K,Q,…／Kまで→A,2,…、到達側の通常方向は凍結）。ジョーカーは好きな空きマスに置ける“ワイルド”（1ゲーム1回きり・戻せない）で、置いた位置の本物カードを持つ人は次の手番で必ずそれを出す（パス不可、実カードに置き換わる）。バーストで手札を場に開く、順位表示。**オンライン対戦（別々の端末から2〜4人・空き席はCPU補充可）対応**：複数人用スキーマ（`createRoomN`）。state＝`{cfg,board(52文字 . o j),hands[](CSV),pass[],alive[](a/d/b),place[],bustAt[],finishSeq,bustSeq,turn(席番号),forced,last,over,seq}`。手札は各自の端末にだけ表示（データ自体は全員に届くので「devtoolsで覗かない」前提）。1手ぶんの遷移は`applyAction`（純粋関数）、CPU席は席0が`netCpuTurn`で動かす
  - 大富豪: 実装済み（2〜4人・人間/CPU混在可、CPU強さ3段、連戦（階級＋カード交換）/1戦）。全ローカルルールを実装し設定画面で個別ON/OFF：B（8切り・革命・階段・縛り・スペ3返し・11バック・都落ち、既定ON）／C（7渡し・10捨て・5飛ばし・9リバース・反則あがり、既定OFF）。**オンライン対戦（別々の端末から2〜4人・空き席CPU補充可）対応**：複数人用スキーマ（`createRoomN`）。カードは 0..52 の整数idで表現、state.hands は id を "," 連結した文字列の配列（Firestore が配列内配列を許さないため）。1手＝純粋関数 `applyDaifugo(state,seat,act)`。act＝play/pass/transfer/discard/exchange/next。7渡し・10捨て・カード交換は `phase`＋`pending` で中断し、その席（人間は `pickCards`、CPUはホスト代行）が選んで再開（`runPipeline` のステップ配列を pending に退避）。連戦の次ゲームは席0（ホスト）が `{type:"next"}`。CPU手番・CPUの選択はホスト（席0）が `netCpuDrive` で代行。既存 `render()` は `applyNetSnapshot` で G を再構築して流用
  - 一人ゲーム（ソリティア等）: 準備中
- 将棋 / どうぶつしょうぎ: 準備中

## 素材

- オセロ盤: `チンチラグレー_オセロ素材/othello_board.svg` を `index.html` にインライン化
- オセロ駒: `othello_black.png` / `white.png` を 256px WebP 化 → `docs/assets/othello/`
- トランプ54枚: `使用済み/チンチラグレー_トランプ全54枚` を 340px WebP 化 → `docs/assets/cards/`（`S1`〜`S13`,`C*`,`H*`,`D*`,`JB`,`JR`）
- カード裏面: `docs/assets/cards/back.webp`（`使用済み/チンチラグレー_カード裏面/card_back.jpg` を 340px WebP 化。柄控えめのシンプル版）
- メニューのトランプ／神経衰弱アイコンも `back.webp` を流用
- 素材フォルダは `クロコ確認フォルダ/アプリ素材/ボードゲームアプリ/`（`使用済み/` `未使用/` に仕分け、`_使用状況.md` あり）
