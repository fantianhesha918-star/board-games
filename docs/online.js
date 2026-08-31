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

// 部屋を閉じる（ホスト / 席0 のみ許可）。
export async function closeRoom(code) {
  try {
    await deleteDoc(doc(db, "rooms", clip(code, 8)));
  } catch (e) {
    /* 権限が無い / すでに無い場合は無視 */
  }
}

/* =========================================================================
 * 複数人（2〜4席）用の部屋。othello の 2人用（host/guest）とは別スキーマ。
 *   rooms/{code} = {
 *     game, status: "waiting"|"playing",
 *     host: { uid, name },      // 席0 の人（= 部屋を閉じられる人）
 *     cap: 2..4,                // 人間の席数
 *     cpu: 0..2,                // CPU の席数（席 cap..cap+cpu-1 を占める）
 *     seats: [ { uid, name } ], // 参加した人間（参加順 = 席番号）。cap 人で playing
 *     state: { turn: 0..(cap+cpu-1), seq, over, ... ゲーム固有 },
 *     createdAt, updatedAt,
 *     seen: { <uid>: timestamp },
 *   }
 * ======================================================================= */

// 複数人部屋を作成。cap=人間席数, cpu=CPU席数。部屋番号を返す。
export async function createRoomN(game, name, cap, cpu, state) {
  const uid = await getUid();
  const c = Math.max(2, Math.min(4, cap | 0));
  const cp = Math.max(0, Math.min(2, cpu | 0));
  for (let attempt = 0; attempt < 15; attempt++) {
    const code = code4();
    const ref = doc(db, "rooms", code);
    try {
      const ok = await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists()) return false;
        tx.set(ref, {
          game,
          status: "waiting",
          host: { uid, name: clip(name, 12) || "ホスト" },
          cap: c,
          cpu: cp,
          seats: [{ uid, name: clip(name, 12) || "ホスト" }],
          state: state || {},
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          seen: { [uid]: serverTimestamp() },
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

// 複数人部屋に参加（または再入室）。{ index, data } を返す。index = 自分の席番号。
export async function joinRoomN(code, name) {
  const uid = await getUid();
  const ref = doc(db, "rooms", clip(code, 8));
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("その部屋番号は見つかりません。");
    const d = snap.data();
    if (!Array.isArray(d.seats)) throw new Error("この部屋には参加できません。");
    const mine = d.seats.findIndex((s) => s && s.uid === uid);
    if (mine >= 0) {
      tx.update(ref, { ["seen." + uid]: serverTimestamp() });
      return { index: mine, data: d };
    }
    if (d.status !== "waiting") throw new Error("その部屋はすでに始まっています。");
    if (d.seats.length >= d.cap) throw new Error("その部屋は満員です。");
    const myIndex = d.seats.length;
    const seats = d.seats.concat([{ uid, name: clip(name, 12) || "プレイヤー" }]);
    const full = seats.length === d.cap;
    tx.update(ref, {
      seats,
      status: full ? "playing" : "waiting",
      ["seen." + uid]: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { index: myIndex, data: { ...d, seats, status: full ? "playing" : "waiting" } };
  });
}

// 複数人部屋の生存通知。seen[自分のuid] を更新。
export async function heartbeatN(code) {
  const uid = await getUid();
  const ref = doc(db, "rooms", clip(code, 8));
  try {
    await updateDoc(ref, { ["seen." + uid]: serverTimestamp() });
  } catch (e) {
    /* 一時的な失敗は無視 */
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
  createRoomN,
  joinRoomN,
  heartbeatN,
  getUid,
};
window.dispatchEvent(new Event("bgonline-ready"));
