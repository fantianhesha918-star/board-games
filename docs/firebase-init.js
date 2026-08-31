// ボードゲームアプリ オンライン対戦用 Firebase 初期化
// CDN 経由で SDK を読み込むためビルド不要。GitHub Pages にそのまま置ける。
//
// 注意: この firebaseConfig（apiKey 含む）は「公開前提」の値です。Firebase の
// クライアント向け API キーは秘密情報ではありません。実際のアクセス制御は
// firestore.rules 側のセキュリティルールで行います。

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import {
  initializeFirestore,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyATK3ILpR_kuqE1P0NuEn_vQ7GDUhsmH78",
  authDomain: "board-games-online-d0d21.firebaseapp.com",
  projectId: "board-games-online-d0d21",
  storageBucket: "board-games-online-d0d21.firebasestorage.app",
  messagingSenderId: "1098031452490",
  appId: "1:1098031452490:web:e7494ddc91f37f71ad31b3",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// ロングポーリングを強制。制限の強いネットワークやプロキシ下でも安定して
// つながる（ターン制ゲームなので数秒の遅延は問題にならない）。
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

// 匿名サインイン。既存セッションがあればそれを使う（二重にアカウントを作らない）。
export const uidReady = new Promise((resolve, reject) => {
  const off = onAuthStateChanged(
    auth,
    (user) => {
      if (user) {
        off();
        resolve(user.uid);
      } else {
        signInAnonymously(auth).catch(reject);
      }
    },
    reject
  );
});

export function getUid() {
  return uidReady;
}
