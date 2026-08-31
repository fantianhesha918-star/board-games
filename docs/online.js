// オンライン対戦の共通モジュール（部屋の作成 / 参加 / 購読 / 状態更新）。
// ゲーム固有のロジックは持たず、「部屋 = 1つの Firestore ドキュメント」を
// リアルタイムに読み書きする土台だけを提供する。
//
// 部屋ドキュメント: rooms/{code}  (code = 4桁の数字)
//   {
//     game:    "othello" 等,
//     status:  "waiting" | "playing" | "done",
//     host:    { uid, name },        // 先手（オセロなら黒 'b'）
//     guest:   { uid, name } | null, // 後手（白 'w'）
//     state:   ゲーム状態（各ゲームが自由に決める。オセロは { board, turn, ... }）,
//     createdAt, updatedAt, hostSeen, guestSeen: タイムスタンプ,
//   }

import { db, getUid } from "./firebase-init.js";
import {
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const clip = (s, n) => String(s == null ? "" : s).trim().slice(0, n);
const code4 = () => String(Math.floor(1000 + Math.random() * 9000));

// 部屋を作成し、部屋番号(文字列)を返す。
export async function createRoom(game, name, state) {
  const uid = await getUid();
  for (let attempt = 0; attempt < 15; attempt++) {
    const code = code4();
    const ref = doc(db, "rooms", code);
    try {
      const ok = await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists()) return false; // 衝突 → 別番号で再試行
        tx.set(ref, {
          game,
          status: "waiting",
          host: { uid, name: clip(name, 12) || "ホスト" },
          guest: null,
          state: state || {},
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          hostSeen: serverTimestamp(),
          guestSeen: null,
        });
        return true;
      });
      if (ok) return code;
    } catch (e) {
      /* 再試行 */
    }
  }
  throw new Error("部屋番号を確保できませんでした。もう一度お試しください。");
}

// 部屋に参加（または再入室）。{ role, data } を返す。
export async function joinRoom(code, name) {
  const uid = await getUid();
  const ref = doc(db, "rooms", clip(code, 8));
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("その部屋番号は見つかりません。");
    const d = snap.data();
    if (d.host && d.host.uid === uid) {
      tx.update(ref, { hostSeen: serverTimestamp() });
      return { role: "host", data: d };
    }
    if (d.guest && d.guest.uid === uid) {
      tx.update(ref, { guestSeen: serverTimestamp() });
      return { role: "guest", data: d };
    }
    if (d.status !== "waiting" || d.guest != null) {
      throw new Error("その部屋はすでに対戦中か、満員です。");
    }
    const guest = { uid, name: clip(name, 12) || "ゲスト" };
    tx.update(ref, {
      guest,
      status: "playing",
      guestSeen: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { role: "guest", data: { ...d, guest, status: "playing" } };
  });
}

// 部屋のリアルタイム購読。cb(data|null) を呼ぶ。戻り値は解除関数。
export function watchRoom(code, cb) {
  const ref = doc(db, "rooms", clip(code, 8));
  return onSnapshot(
    ref,
    (snap) => cb(snap.exists() ? snap.data() : null),
    (err) => {
      console.error("watchRoom error", err);
      cb(null, err);
    }
  );
}

// 部屋の一部フィールドを更新（手番のプレイヤーが state を書き換える等）。
export async function pushRoom(code, patch) {
  const ref = doc(db, "rooms", clip(code, 8));
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
}

// 生存通知（相手の切断表示用）。role は "host" | "guest"。
export async function heartbeat(code, role) {
  const ref = doc(db, "rooms", clip(code, 8));
  const field = role === "guest" ? "guestSeen" : "hostSeen";
  try {
    await updateDoc(ref, { [field]: serverTimestamp() });
  } catch (e) {
    /* 一時的な失敗は無視 */
  }
}

// 部屋を閉じる（ホストのみ許可）。
export async function closeRoom(code) {
  try {
    await deleteDoc(doc(db, "rooms", clip(code, 8)));
  } catch (e) {
    /* 権限が無い / すでに無い場合は無視 */
  }
}

export { getUid };

// 非モジュールの既存ゲームコードから使えるようグローバルに公開。
window.BGOnline = {
  createRoom,
  joinRoom,
  watchRoom,
  pushRoom,
  heartbeat,
  closeRoom,
  getUid,
};
window.dispatchEvent(new Event("bgonline-ready"));
