// VoiceVocab - 音声で答える英単語・熟語トレーニング
// 忘却曲線ベースの間隔反復 (SM-2簡易版) + Web Speech API

"use strict";

// ===== 間隔反復（忘却曲線） =====
// stage n で正解 → 次回出題は INTERVALS_DAYS[n] 日後。不正解 → stage 0 に戻し10分後に再出題対象。
const INTERVALS_DAYS = [0, 1, 3, 7, 14, 30, 60, 120];
const RELEARN_MS = 10 * 60 * 1000;      // 不正解後の再出題間隔
const REQUEUE_GAP = 4;                   // セッション内で間違えた問題を何問後に再出題するか
const PROG_KEY = "vv_progress_v1";
const SETTINGS_KEY = "vv_settings_v1";

let progress = {};   // { id: {stage, due, right, wrong} }
try { progress = JSON.parse(localStorage.getItem(PROG_KEY)) || {}; } catch (e) { progress = {}; }

function saveProgress() { localStorage.setItem(PROG_KEY, JSON.stringify(progress)); }
function getProg(id) {
  if (!progress[id]) progress[id] = { stage: -1, due: 0, right: 0, wrong: 0 }; // stage -1 = 未学習
  return progress[id];
}

function recordAnswer(word, correct) {
  const p = getProg(word.id);
  const now = Date.now();
  if (correct) {
    p.right++;
    p.stage = Math.min(p.stage + 1, INTERVALS_DAYS.length - 1);
    if (p.stage < 1) p.stage = 1;
    p.due = now + INTERVALS_DAYS[p.stage] * 24 * 60 * 60 * 1000;
  } else {
    p.wrong++;
    p.stage = 0;
    p.due = now + RELEARN_MS;
  }
  saveProgress();
}

// ===== 出題キュー生成 =====
function buildQueue(settings) {
  const now = Date.now();
  const pool = WORDS.filter(w => settings.levels.includes(w.lv) && settings.kinds.includes(w.k));
  const due = [], fresh = [], future = [];
  for (const w of pool) {
    const p = progress[w.id];
    if (!p || p.stage < 0) fresh.push(w);
    else if (p.due <= now) due.push(w);
    else future.push(w);
  }
  // 復習期限が来ているものを最優先 → 新規 → 期限前（期限が近い順）
  shuffle(due); shuffle(fresh);
  future.sort((a, b) => progress[a.id].due - progress[b.id].due);
  return due.concat(fresh, future).slice(0, settings.count);
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

// ===== テキスト正規化・正誤判定 =====
function kataToHira(s) {
  return s.replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}
function normJa(s) {
  return kataToHira(String(s)).toLowerCase().replace(/[\s、。．，,.!?！?「」『』()（）〜~ー・]/g, "");
}
function normEn(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

// 音声コマンド判定（"skip"等は語彙の正解と衝突しないよう語彙側で不使用）
function detectCommand(texts, dir) {
  const joined = texts.join(" ");
  const ja = normJa(joined), en = normEn(joined);
  if (/すきっぷ|ぱす|スキップ/.test(ja) || /\bskip\b|\bpass\b/.test(en)) return "skip";
  if (/もういちど|もう一度|りぴーと/.test(ja) || /\brepeat\b/.test(en)) return "repeat";
  if (/しゅうりょう|終了|おしまい|やめる/.test(ja) || /\bfinish\b|\bquit\b/.test(en)) return "quit";
  return null;
}

// dir: "e2j" は日本語で回答, "j2e" は英語で回答
function isCorrect(word, texts, dir) {
  if (dir === "e2j") {
    for (const t of texts) {
      const heard = normJa(t);
      if (!heard) continue;
      for (const ans of word.ja) {
        const a = normJa(ans);
        if (heard.includes(a)) return true;
        if (a.length >= 3 && a.includes(heard) && heard.length >= 2) return true;
      }
    }
  } else {
    const target = normEn(word.en);
    for (const t of texts) {
      let heard = normEn(t);
      if (!heard) continue;
      // "to give up" のような to 付き回答も許容
      if (heard.startsWith("to ")) heard = heard.slice(3);
      if (heard === target || heard.includes(target)) return true;
      if (target.includes(heard) && heard.length >= Math.max(3, target.length - 2)) return true;
    }
  }
  return false;
}

// ===== 音声合成（読み上げ） =====
function speak(text, lang, rate) {
  return new Promise(resolve => {
    if (!("speechSynthesis" in window)) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate || 1.0;
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    u.onend = finish;
    u.onerror = finish;
    speechSynthesis.speak(u);
    // onend が発火しない端末向けの保険
    setTimeout(finish, 2500 + text.length * 220);
  });
}

// ===== 音声認識 =====
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let activeRec = null;

// 1回分の聞き取り。resolve: {texts:[...]} / {noSpeech:true} / {error:msg}
function listen(lang, timeoutMs) {
  return new Promise(resolve => {
    if (!SR) return resolve({ error: "unsupported" });
    const rec = new SR();
    activeRec = rec;
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 5;
    let settled = false;
    const settle = v => {
      if (settled) return;
      settled = true;
      activeRec = null;
      clearTimeout(timer);
      try { rec.abort(); } catch (e) {}
      resolve(v);
    };
    const timer = setTimeout(() => settle({ noSpeech: true }), timeoutMs || 8000);
    rec.onresult = ev => {
      const texts = [];
      const res = ev.results[ev.results.length - 1];
      for (let i = 0; i < res.length; i++) texts.push(res[i].transcript);
      settle({ texts });
    };
    rec.onerror = ev => {
      if (ev.error === "no-speech" || ev.error === "aborted") settle({ noSpeech: true });
      else settle({ error: ev.error });
    };
    rec.onend = () => settle({ noSpeech: true });
    try { rec.start(); } catch (e) { settle({ error: String(e) }); }
  });
}

function stopListening() {
  if (activeRec) { try { activeRec.abort(); } catch (e) {} activeRec = null; }
}

// ===== 画面要素 =====
const $ = id => document.getElementById(id);
const screens = { setup: $("setup"), session: $("session"), result: $("result") };
function showScreen(name) {
  for (const k in screens) screens[k].classList.toggle("hidden", k !== name);
}

// ===== 設定の保存・復元 =====
function readSettings() {
  const levels = [...document.querySelectorAll("#levelChips input:checked")].map(i => +i.value);
  const kinds = [...document.querySelectorAll("#kindChips input:checked")].map(i => i.value);
  const mode = document.querySelector("#modeChips input:checked").value;
  const count = +document.querySelector("#countChips input:checked").value;
  return { levels, kinds, mode, count, speakQ: $("optSpeak").checked, auto: $("optAuto").checked };
}
function persistSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }
function restoreSettings() {
  let s;
  try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY)); } catch (e) {}
  if (!s) return;
  document.querySelectorAll("#levelChips input").forEach(i => i.checked = s.levels.includes(+i.value));
  document.querySelectorAll("#kindChips input").forEach(i => i.checked = s.kinds.includes(i.value));
  document.querySelectorAll("#modeChips input").forEach(i => i.checked = i.value === s.mode);
  document.querySelectorAll("#countChips input").forEach(i => i.checked = +i.value === s.count);
  $("optSpeak").checked = s.speakQ !== false;
  $("optAuto").checked = s.auto !== false;
}

// ===== 学習状況表示 =====
function renderStats() {
  const now = Date.now();
  let learned = 0, dueCount = 0, right = 0, wrong = 0;
  for (const w of WORDS) {
    const p = progress[w.id];
    if (!p || p.stage < 0) continue;
    learned++;
    if (p.due <= now) dueCount++;
    right += p.right; wrong += p.wrong;
  }
  const acc = right + wrong ? Math.round(right / (right + wrong) * 100) : 0;
  $("statsBody").innerHTML =
    `収録: ${WORDS.length}語 ／ 学習済み: ${learned}語<br>` +
    `復習期限が来ている問題: <b>${dueCount}語</b><br>` +
    `通算正答率: ${acc}%（⭕${right} ❌${wrong}）`;
}

// ===== セッション制御 =====
const session = {
  active: false, queue: [], index: 0, total: 0,
  right: 0, wrong: 0, wrongList: [],
  settings: null, currentResolve: null, wakeLock: null,
};

function questionDir(settings) {
  if (settings.mode === "mix") return Math.random() < 0.5 ? "e2j" : "j2e";
  return settings.mode;
}

async function requestWakeLock() {
  try { session.wakeLock = await navigator.wakeLock.request("screen"); } catch (e) {}
}

async function startSession() {
  const settings = readSettings();
  if (!settings.levels.length || !settings.kinds.length) { alert("レベルと種類を1つ以上選んでください"); return; }
  persistSettings(settings);
  const queue = buildQueue(settings);
  if (!queue.length) { alert("該当する問題がありません"); return; }

  session.active = true;
  session.settings = settings;
  session.queue = queue.map(w => ({ word: w, dir: questionDir(settings) }));
  session.total = session.queue.length;
  session.index = 0;
  session.right = 0; session.wrong = 0; session.wrongList = [];
  showScreen("session");
  requestWakeLock();
  runLoop();
}

function endSession() {
  session.active = false;
  stopListening();
  speechSynthesis.cancel();
  if (session.wakeLock) { session.wakeLock.release().catch(() => {}); session.wakeLock = null; }
  renderResult();
  showScreen("result");
}

function setPhase(text, mic) {
  $("phase").textContent = text;
  $("micIcon").classList.toggle("hidden", !mic);
}

function showQuestion(item) {
  const w = item.word;
  const dirLabel = item.dir === "e2j" ? "英→和" : "和→英";
  const kindLabel = w.k === "w" ? "単語" : "熟語";
  $("qKind").textContent = `${dirLabel}・Lv${w.lv} ${kindLabel}`;
  $("qText").textContent = item.dir === "e2j" ? w.en : w.ja[0];
  $("heard").textContent = "";
  $("verdict").textContent = "";
  $("verdict").className = "verdict";
  $("progressLabel").textContent = `${Math.min(session.index + 1, session.total)} / ${session.total}`;
  $("scoreLabel").textContent = `⭕${session.right} ❌${session.wrong}`;
  $("nextRow").style.visibility = "hidden";
}

// 手動ボタン割り込み。runLoop 内の待機を解決する
function manualAction(action) {
  if (session.currentResolve) {
    const r = session.currentResolve;
    session.currentResolve = null;
    stopListening();
    speechSynthesis.cancel();
    r({ manual: action });
  }
}

// 聞き取り待ち（手動ボタンでも解決できるようにラップ）
function listenInterruptible(lang, timeoutMs) {
  return new Promise(resolve => {
    session.currentResolve = resolve;
    listen(lang, timeoutMs).then(v => {
      if (session.currentResolve === resolve) { session.currentResolve = null; resolve(v); }
    });
  });
}

function waitManual() {
  return new Promise(resolve => { session.currentResolve = resolve; });
}

async function runLoop() {
  while (session.active && session.index < session.queue.length) {
    const item = session.queue[session.index];
    const outcome = await askOne(item);
    if (!session.active) return;

    if (outcome === "quit") { endSession(); return; }
    if (outcome === "repeat") continue;

    if (outcome === "correct") {
      session.right++;
      recordAnswer(item.word, true);
    } else { // wrong / skip
      session.wrong++;
      recordAnswer(item.word, false);
      if (!session.wrongList.some(x => x.id === item.word.id)) session.wrongList.push(item.word);
      // セッション内で数問後にもう一度出題（忘却曲線の短期復習）
      if (!item.requeued) {
        const pos = Math.min(session.index + 1 + REQUEUE_GAP, session.queue.length);
        session.queue.splice(pos, 0, { word: item.word, dir: item.dir, requeued: true });
        session.total = session.queue.length;
      }
    }
    session.index++;
  }
  if (session.active) endSession();
}

// 1問の出題〜判定。戻り値: "correct" | "wrong" | "skip" | "repeat" | "quit"
async function askOne(item) {
  const w = item.word;
  const s = session.settings;
  const answerLang = item.dir === "e2j" ? "ja-JP" : "en-US";
  showQuestion(item);

  // 出題読み上げ
  if (s.speakQ) {
    setPhase("出題中…", false);
    if (item.dir === "e2j") await speak(w.en, "en-US", 0.9);
    else await speak(w.ja[0], "ja-JP", 1.0);
    if (!session.active) return "quit";
  }

  // 回答の聞き取り（無音なら1回だけ促して再挑戦）
  for (let attempt = 0; attempt < 2; attempt++) {
    setPhase(item.dir === "e2j" ? "日本語で答えてください" : "英語で答えてください", true);
    const res = await listenInterruptible(answerLang, 8000);
    setPhase("", false);
    if (!session.active) return "quit";

    if (res.manual) return await handleManual(res.manual, item);
    if (res.error === "unsupported") { alert("このブラウザは音声認識に対応していません。Android版Chromeをご利用ください。"); return "quit"; }
    if (res.error === "not-allowed" || res.error === "service-not-allowed") {
      alert("マイクの使用が許可されていません。ブラウザの設定でマイクを許可してください。");
      return "quit";
    }

    if (res.noSpeech || res.error) {
      if (attempt === 0) {
        if (s.speakQ) await speak("もう一度どうぞ", "ja-JP", 1.1);
        continue;
      }
      // 2回無音 → 不正解扱い
      return await finishAnswer(item, false, "（聞き取れませんでした）");
    }

    $("heard").textContent = "🎤 " + res.texts[0];
    const cmd = detectCommand(res.texts, item.dir);
    if (cmd === "skip") return await finishAnswer(item, false, "（スキップ）");
    if (cmd === "repeat") return "repeat";
    if (cmd === "quit") return "quit";

    return await finishAnswer(item, isCorrect(w, res.texts, item.dir), res.texts[0]);
  }
  return "wrong";
}

async function handleManual(action, item) {
  if (action === "quit") return "quit";
  if (action === "repeat") return "repeat";
  if (action === "skip") return await finishAnswer(item, false, "（スキップ）");
  if (action === "ok") return await finishAnswer(item, true, "（手動判定）");
  if (action === "ng") return await finishAnswer(item, false, "（手動判定）");
  return "repeat";
}

// 正誤表示・フィードバック読み上げ → "correct"/"wrong" を返す
async function finishAnswer(item, correct, heardText) {
  const w = item.word;
  const s = session.settings;
  const v = $("verdict");
  if (heardText) $("heard").textContent = "🎤 " + heardText;

  const answerText = item.dir === "e2j" ? `${w.en} = ${w.ja[0]}` : `${w.ja[0]} = ${w.en}`;
  if (correct) {
    v.textContent = "⭕ 正解！";
    v.className = "verdict ok";
    if (s.speakQ) await speak("正解", "ja-JP", 1.2);
  } else {
    v.textContent = `❌ 正解: ${answerText}`;
    v.className = "verdict ng";
    if (s.speakQ) {
      await speak("残念。正解は", "ja-JP", 1.2);
      if (item.dir === "e2j") await speak(w.ja[0], "ja-JP", 1.0);
      else { await speak(w.en, "en-US", 0.85); await speak(w.en, "en-US", 0.85); }
    }
  }
  if (!session.active) return "quit";

  if (s.auto) {
    await new Promise(r => setTimeout(r, correct ? 700 : 1200));
  } else {
    $("nextRow").style.visibility = "visible";
    const res = await waitManual();
    if (res.manual === "quit") { session.index++; return "quit"; }
  }
  return correct ? "correct" : "wrong";
}

// ===== 結果画面 =====
function renderResult() {
  const answered = session.right + session.wrong;
  const acc = answered ? Math.round(session.right / answered * 100) : 0;
  $("resultSummary").innerHTML =
    `回答数: ${answered}問<br>⭕ ${session.right}問 ／ ❌ ${session.wrong}問<br>正答率: <b>${acc}%</b>`;
  $("resultWrong").innerHTML = session.wrongList.length
    ? session.wrongList.map(w => `<b>${w.en}</b> — ${w.ja[0]}`).join("<br>")
    : "なし 🎉";
}

// ===== イベント =====
$("startBtn").addEventListener("click", startSession);
$("quitBtn").addEventListener("click", () => manualAction("quit") || (session.active && endSession()));
$("repeatBtn").addEventListener("click", () => manualAction("repeat"));
$("skipBtn").addEventListener("click", () => manualAction("skip"));
$("okBtn").addEventListener("click", () => manualAction("ok"));
$("ngBtn").addEventListener("click", () => manualAction("ng"));
$("nextBtn").addEventListener("click", () => manualAction("next"));
$("backBtn").addEventListener("click", () => { renderStats(); showScreen("setup"); });

// 画面復帰時にウェイクロックを取り直す
document.addEventListener("visibilitychange", () => {
  if (session.active && document.visibilityState === "visible") requestWakeLock();
});

// ===== 初期化 =====
restoreSettings();
renderStats();
if (!SR) {
  $("supportNote").textContent = "⚠ このブラウザは音声認識非対応です。AndroidのChromeで開いてください。";
}
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
