// VoiceVocab - 音声で答える英単語・熟語トレーニング
// 忘却曲線ベースの間隔反復 (SM-2簡易版) + Web Speech API

"use strict";

// ===== 間隔反復（忘却曲線） =====
// stage n で正解 → 次回出題は INTERVALS_DAYS[n] 日後。不正解 → stage 0 に戻し10分後に再出題対象。
const INTERVALS_DAYS = [0, 1, 3, 7, 14, 30, 60, 120];
const RELEARN_MS = 10 * 60 * 1000;      // 不正解後の再出題間隔
const REQUEUE_GAP = 4;                   // セッション内で間違えた問題を何問後に再出題するか
const WRONG_WAIT_MS = 5000;              // 不正解後、次の問題までの待機時間
const CORRECT_WAIT_MS = 700;             // 正解後、次の問題までの待機時間（通常）
const CORRECT_WAIT_SYN_MS = 2000;        // 正解後の待機時間（類義語表示オプションON時）
const PROG_KEY = "vv_progress_v1";
const SETTINGS_KEY = "vv_settings_v3";   // レベルが複数選択トグルに戻ったためv3

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
    // 出題語そのものに加えて、類義語での回答も正解として認める
    const targets = [word.en, ...(word.syn || [])].map(normEn);
    for (const t of texts) {
      let heard = normEn(t);
      if (!heard) continue;
      // "to give up" のような to 付き回答も許容
      if (heard.startsWith("to ")) heard = heard.slice(3);
      for (const target of targets) {
        if (heard === target || heard.includes(target)) return true;
        if (target.includes(heard) && heard.length >= Math.max(3, target.length - 2)) return true;
      }
    }
  }
  return false;
}

// ===== 効果音（Web Audio） =====
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
}
function beep(freq, startOffset, dur, type, vol) {
  const t = audioCtx.currentTime + startOffset;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type || "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol || 0.25, t + 0.01);
  gain.gain.setValueAtTime(vol || 0.25, t + dur - 0.05);
  gain.gain.linearRampToValueAtTime(0, t + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}
function playCorrect() { // ピンポン♪（上昇2音）
  ensureAudio();
  if (!audioCtx) return;
  beep(784, 0, 0.12, "sine", 0.3);
  beep(1175, 0.13, 0.25, "sine", 0.3);
}
function playWrong() { // ブザー（低い2連音）
  ensureAudio();
  if (!audioCtx) return;
  beep(160, 0, 0.2, "square", 0.2);
  beep(160, 0.26, 0.28, "square", 0.2);
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
const screens = { setup: $("setup"), session: $("session"), result: $("result"), wrong: $("wrongScreen") };
function showScreen(name) {
  for (const k in screens) screens[k].classList.toggle("hidden", k !== name);
}

// ===== 設定の保存・復元 =====
function readSettings() {
  const levels = [...document.querySelectorAll("#levelChips input:checked")].map(i => +i.value);
  const kinds = [...document.querySelectorAll("#kindChips input:checked")].map(i => i.value);
  const mode = document.querySelector("#modeChips input:checked").value;
  const count = +document.querySelector("#countChips input:checked").value;
  return { levels, kinds, mode, count, speakQ: $("optSpeak").checked, auto: $("optAuto").checked, showSyn: $("optSyn").checked };
}
function persistSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }
function restoreSettings() {
  let s;
  try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY)); } catch (e) {}
  if (!s) return;
  document.querySelectorAll("#levelChips input").forEach(i => i.checked = (s.levels || []).includes(+i.value));
  document.querySelectorAll("#kindChips input").forEach(i => i.checked = s.kinds.includes(i.value));
  document.querySelectorAll("#modeChips input").forEach(i => i.checked = i.value === s.mode);
  document.querySelectorAll("#countChips input").forEach(i => i.checked = +i.value === s.count);
  $("optSpeak").checked = s.speakQ !== false;
  $("optAuto").checked = s.auto !== false;
  $("optSyn").checked = !!s.showSyn;
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
  right: 0, wrong: 0, wrongList: [], history: [],
  settings: null, currentResolve: null, wakeLock: null,
};

// ===== 画面を指で押し続けている間は自動で次の問題に進めない =====
let isTouching = false;
document.addEventListener("pointerdown", () => { isTouching = true; });
document.addEventListener("pointerup", () => { isTouching = false; });
document.addEventListener("pointercancel", () => { isTouching = false; });

// 最低 ms 待機し、その時点でまだ画面を押しっぱなしなら指を離すまで待つ
function waitAutoAdvance(ms) {
  return new Promise(resolve => {
    const start = Date.now();
    const tick = () => {
      if (Date.now() - start >= ms && !isTouching) return resolve();
      setTimeout(tick, 100);
    };
    tick();
  });
}

// ===== 直近2問の履歴表示 =====
function pushHistory(item, correct) {
  const w = item.word;
  const q = item.dir === "e2j" ? w.en : w.ja[0];
  const a = item.dir === "e2j" ? w.ja[0] : w.en;
  session.history.unshift({ q, a, correct });
  session.history.length = Math.min(session.history.length, 2);
  renderHistory();
}
function renderHistory() {
  $("historyBar").innerHTML = session.history.map(h =>
    `<span class="hist-item ${h.correct ? "ok" : "ng"}">${h.correct ? "⭕" : "❌"} ${escapeHtml(h.q)} → ${escapeHtml(h.a)}</span>`
  ).join("");
}

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
  ensureAudio(); // ユーザー操作の中でAudioContextを起動しておく
  persistSettings(settings);
  const queue = buildQueue(settings);
  if (!queue.length) { alert("該当する問題がありません"); return; }

  session.active = true;
  session.settings = settings;
  session.queue = queue.map(w => ({ word: w, dir: questionDir(settings) }));
  session.total = session.queue.length;
  session.index = 0;
  session.right = 0; session.wrong = 0; session.wrongList = []; session.history = [];
  renderHistory();
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

// ===== 例文中の出題語ハイライト =====
// 例文では出題語が活用形（caught, went, I'm 等）で現れるため、不規則変化表 + 語幹一致で探す
const IRREGULAR_FORMS = {
  be: ["am", "is", "are", "was", "were", "been", "being", "i'm", "he's", "she's", "it's"],
  go: ["went", "gone", "goes", "going"],
  come: ["came", "comes", "coming"],
  catch: ["caught", "catches", "catching"],
  find: ["found", "finds", "finding"],
  run: ["ran", "runs", "running"],
  take: ["took", "taken", "takes", "taking"],
  fall: ["fell", "fallen", "falls", "falling"],
  hold: ["held", "holds", "holding"],
  bring: ["brought", "brings", "bringing"],
  get: ["got", "gotten", "gets", "getting"],
  give: ["gave", "given", "gives", "giving"],
  make: ["made", "makes", "making"],
  do: ["did", "done", "does", "doing"],
  stand: ["stood", "stands", "standing"],
  put: ["puts", "putting"],
  set: ["sets", "setting"],
  eat: ["ate", "eaten", "eats", "eating"],
};
function tokenMatches(exTok, tgtTok) {
  const e = exTok.toLowerCase().replace(/'/g, "");
  const t = tgtTok.toLowerCase();
  if (e === t.replace(/'/g, "")) return true;
  if (IRREGULAR_FORMS[t] && IRREGULAR_FORMS[t].some(f => f.replace(/'/g, "") === e)) return true;
  if (t.length >= 4 && e.startsWith(t.slice(0, 4))) return true; // 規則変化 (abandoned, carried...)
  return false;
}
// 例文HTMLを生成し、出題語に当たる部分を <b class="ex-hl"> で強調する
function exampleHtml(w) {
  if (!w.ex) return "";
  const ex = w.ex;
  const tgt = w.en.split(/\s+/);
  const re = /[A-Za-z']+/g;
  const toks = [];
  let m;
  while ((m = re.exec(ex))) toks.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  // 各位置を起点に、間に2語まで挟みつつ（"pick you up" 等）出題語の並びを探す
  let matched = null;
  for (let i = 0; i < toks.length && !matched; i++) {
    let ti = 0, gaps = 0;
    const picks = [];
    for (let j = i; j < toks.length && ti < tgt.length; j++) {
      if (tokenMatches(toks[j].text, tgt[ti])) { picks.push(j); ti++; gaps = 0; }
      else if (picks.length) { if (++gaps > 2) break; }
      else break;
    }
    if (ti === tgt.length) matched = picks;
  }
  const hl = new Set(matched || []);
  let html = "", pos = 0;
  toks.forEach((tk, idx) => {
    html += escapeHtml(ex.slice(pos, tk.start));
    html += hl.has(idx) ? `<b class="ex-hl">${escapeHtml(tk.text)}</b>` : escapeHtml(tk.text);
    pos = tk.end;
  });
  html += escapeHtml(ex.slice(pos));
  return `${html}<span class="ex-ja">${escapeHtml(w.exJa || "")}</span>`;
}

function showQuestion(item) {
  const w = item.word;
  const dirLabel = item.dir === "e2j" ? "英→和" : "和→英";
  const kindLabel = w.k === "w" ? "単語" : "熟語";
  $("qKind").textContent = `${dirLabel}・Lv${w.lv} ${kindLabel}`;
  $("qText").textContent = item.dir === "e2j" ? w.en : w.ja[0];
  // 例文・発音記号・類義語は英語が答えになる和→英では出題時に隠し、回答後に表示する
  // （英語が問題文の英→和は答えが日本語なので、出題時点から見せてよい）
  if (item.dir === "e2j") {
    $("qExample").innerHTML = exampleHtml(w);
    $("qIpa").textContent = w.ipa || "";
    $("qSynonyms").textContent = session.settings.showSyn && w.syn && w.syn.length ? "類義語: " + w.syn.join(", ") : "";
  } else {
    $("qExample").innerHTML = "";
    $("qIpa").textContent = "";
    $("qSynonyms").textContent = "";
  }
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

    if (outcome === "skip") {
      // スキップは正誤判定なし。少し後にもう一度出題する
      if (!item.requeued) {
        const pos = Math.min(session.index + 1 + REQUEUE_GAP, session.queue.length);
        session.queue.splice(pos, 0, { word: item.word, dir: item.dir, requeued: true });
        session.total = session.queue.length;
      }
      session.index++;
      continue;
    }

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
    if (cmd === "skip") return "skip";
    if (cmd === "repeat") return "repeat";
    if (cmd === "quit") return "quit";

    return await finishAnswer(item, isCorrect(w, res.texts, item.dir), res.texts[0]);
  }
  return "wrong";
}

async function handleManual(action, item) {
  if (action === "quit") return "quit";
  if (action === "repeat") return "repeat";
  if (action === "skip") return "skip";
  return "repeat";
}

// 正誤表示・効果音フィードバック → "correct"/"wrong" を返す
async function finishAnswer(item, correct, heardText) {
  const w = item.word;
  const s = session.settings;
  const v = $("verdict");
  if (heardText) $("heard").textContent = "🎤 " + heardText;

  const answerText = item.dir === "e2j" ? `${w.en} = ${w.ja[0]}` : `${w.ja[0]} = ${w.en}`;
  // 和→英では出題時に隠していた例文・発音記号・類義語を回答後に表示する
  if (item.dir === "j2e") {
    $("qExample").innerHTML = exampleHtml(w);
    if (w.ipa) $("qIpa").textContent = w.ipa;
    if (s.showSyn && w.syn && w.syn.length) $("qSynonyms").textContent = "類義語: " + w.syn.join(", ");
  }

  if (correct) {
    v.textContent = "⭕ 正解！";
    v.className = "verdict ok";
    playCorrect();
  } else {
    v.textContent = `❌ 正解: ${answerText}`;
    v.className = "verdict ng";
    playWrong();
    if (s.speakQ) {
      // ブザーと重ならないよう少し待ってから、正解のみを読み上げ（前置きなし）
      await new Promise(r => setTimeout(r, 600));
      if (item.dir === "e2j") await speak(w.ja[0], "ja-JP", 1.0);
      else await speak(w.en, "en-US", 0.85);
    }
  }
  pushHistory(item, correct);
  if (!session.active) return "quit";

  if (s.auto) {
    const wait = correct ? (s.showSyn ? CORRECT_WAIT_SYN_MS : CORRECT_WAIT_MS) : WRONG_WAIT_MS;
    await waitAutoAdvance(wait);
  } else {
    $("nextRow").style.visibility = "visible";
    const res = await waitManual();
    if (res.manual === "quit") { session.index++; return "quit"; }
  }
  return correct ? "correct" : "wrong";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ===== 間違えた問題リスト =====
function renderWrongList() {
  const items = WORDS
    .map(w => ({ w, p: progress[w.id] }))
    .filter(x => x.p && x.p.wrong > 0)
    .sort((a, b) => b.p.wrong - a.p.wrong || a.w.en.localeCompare(b.w.en));
  $("wrongListBody").innerHTML = items.length
    ? items.map(({ w, p }) =>
        `<div><b>${escapeHtml(w.en)}</b> ${w.ipa ? `<span class="wl-ipa">${escapeHtml(w.ipa)}</span>` : ""}` +
        ` — ${escapeHtml(w.ja[0])}<span class="wl-count">❌${p.wrong} ⭕${p.right}</span></div>`
      ).join("")
    : "まだ間違えた問題はありません 🎉";
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
$("nextBtn").addEventListener("click", () => manualAction("next"));
$("backBtn").addEventListener("click", () => { renderStats(); showScreen("setup"); });
$("wrongListBtn").addEventListener("click", () => { renderWrongList(); showScreen("wrong"); });
$("wrongBackBtn").addEventListener("click", () => { renderStats(); showScreen("setup"); });

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
