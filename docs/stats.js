/* 全ゲーム共通の記録（プレイ回数・勝敗など）。localStorage にゲームごとの集計だけを持つ軽量モジュール。
   使い方：
     BGStats.record("daifugo", cur => { cur.plays=(cur.plays||0)+1; ... });  // 読み書きしてまとめて保存
     BGStats.get("othello");                                                 // 現在の集計を取得
     BGStats.getAll();                                                       // 全ゲーム分
     BGStats.reset("memory");                                                // 1ゲーム分だけ消す
     BGStats.resetAll();                                                     // 全部消す
*/
(function(g){
  "use strict";
  const KEY = "bg-stats-v1";

  function load(){
    try{ const v = JSON.parse(localStorage.getItem(KEY)); return (v && typeof v==="object") ? v : {}; }
    catch(e){ return {}; }
  }
  function save(d){
    try{ localStorage.setItem(KEY, JSON.stringify(d)); }catch(e){}
  }
  function get(game){
    const d = load();
    return d[game] || {};
  }
  function getAll(){ return load(); }
  function record(game, patchFn){
    const d = load();
    const cur = d[game] || {};
    patchFn(cur);
    d[game] = cur;
    save(d);
    return cur;
  }
  function reset(game){
    const d = load();
    delete d[game];
    save(d);
  }
  function resetAll(){
    try{ localStorage.removeItem(KEY); }catch(e){}
  }

  g.BGStats = { get, getAll, record, reset, resetAll, KEY };
})(window);
