// VoiceVocab - 音声で答える英単語・熟語トレーニング
// 忘却曲線ベースの間隔反復 (SM-2簡易版) + Web Speech API

"use strict";

const APP_VERSION = "v15";

// ===== 間隔反復（忘却曲線） =====
// stage n で正解 → 次回出題は INTERVALS_DAYS[n] 日後。不正解 → stage 0 に戻し10分後に再出題対象。
const INTERVALS_DAYS = [0, 1, 3, 7, 14, 30, 60, 120];
const RELEARN_MS = 10 * 60 * 1000;      // 不正解後の再出題間隔
const REQUEUE_GAP = 4;                   // セッション内で間違えた問題を何問後に再出題するか
const DEFAULT_TIMEOUT_MS = 6000;         // 音声認識の待機時間の既定（設定画面で変更可）
const REASK_LIMIT = 2;                   // 音声は検知したが解析できなかったとき「もう一度」を促す最大回数
const NO_SPEECH_STREAK_LIMIT = 5;        // 何回連続で無反応だったら一時中断するか（タッチや発話があればカウントしない）
const WRONG_WAIT_MS = 5000;              // 不正解後、次の問題までの待機時間
const CORRECT_WAIT_MS = 700;             // 正解後、次の問題までの待機時間（通常）
const CORRECT_WAIT_SYN_MS = 2000;        // 正解後の待機時間（類義語表示オプションON時）
const PROG_KEY = "vv_progress_v1";
const SETTINGS_KEY = "vv_settings_v4";   // 設定はcookieに保存（キー名は流用）
const RANK_KEY = "vv_rank_v2";           // ランク算出用データ（出題方向別）
const RECENT_MAX = 50;                   // ランクは直近この問数の正答率とレベルから算出
const RANK_HIST_MAX = 10;                // 結果画面のグラフに残すランク履歴の数

let progress = {};   // { id: {stage, due, right, wrong} }
try { progress = JSON.parse(localStorage.getItem(PROG_KEY)) || {}; } catch (e) { progress = {}; }

function saveProgress() { localStorage.setItem(PROG_KEY, JSON.stringify(progress)); }
function getProg(id) {
  // stage -1 = 未学習。rightE2J/wrongE2J/rightJ2E/wrongJ2Eは出題方向別の正誤数（間違えた問題リストの分割表示用）
  // lastWrongE2J/lastWrongJ2Eはその方向で最後に間違えた時刻（間違えた問題リストの「最近順」表示用）
  if (!progress[id]) {
    progress[id] = {
      stage: -1, due: 0, right: 0, wrong: 0,
      rightE2J: 0, wrongE2J: 0, rightJ2E: 0, wrongJ2E: 0,
      lastWrongE2J: 0, lastWrongJ2E: 0,
    };
  }
  return progress[id];
}

// ===== ランク（直近RECENT_MAX問の正答率とレベルから算出、出題方向別） =====
// ランク = 平均レベル × 正答率 × 2（0.1〜9.9、Lv5を全問正解したときだけ10）
// 英→和 (e2j) と 和→英 (j2e) を独立に扱い、それぞれ直近の回答ログ recent と
// セッション終了ごとのランク履歴 hist（結果画面のグラフ用）を持つ。
let rankData = { e2j: { recent: [], hist: [] }, j2e: { recent: [], hist: [] } };
try {
  const r = JSON.parse(localStorage.getItem(RANK_KEY));
  if (r && r.e2j && r.j2e) rankData = r;
} catch (e) {}
function saveRank() { localStorage.setItem(RANK_KEY, JSON.stringify(rankData)); }
function pushRankRecent(dir, lv, ok) {
  const d = rankData[dir];
  d.recent.push({ lv, ok: ok ? 1 : 0 });
  if (d.recent.length > RECENT_MAX) d.recent = d.recent.slice(-RECENT_MAX);
  saveRank();
}
// 直近ログからランク値を計算する（ログがなければ null）
function computeRank(dir) {
  const rec = rankData[dir].recent;
  if (!rec.length) return null;
  let lvSum = 0, okSum = 0;
  for (const r of rec) { lvSum += r.lv; okSum += r.ok; }
  const rank = (lvSum / rec.length) * (okSum / rec.length) * 2;
  return Math.max(0.1, Math.min(10, Math.round(rank * 10) / 10));
}
// セッション終了時に現在のランクを履歴に確定する（グラフ用）
function commitRank(dir) {
  const r = computeRank(dir);
  if (r == null) return;
  const h = rankData[dir].hist;
  h.push(r);
  if (h.length > RANK_HIST_MAX) rankData[dir].hist = h.slice(-RANK_HIST_MAX);
  saveRank();
}
// 表示用の現在ランク = 直近に確定した履歴の末尾。未確定なら null（「--」表示）
function displayRank(dir) {
  const h = rankData[dir].hist;
  return h.length ? h[h.length - 1] : null;
}
function fmtRank(r) { return r == null ? "--" : (r >= 10 ? "10" : r.toFixed(1)); }

function recordAnswer(word, correct, dir) {
  // 「間違えた問題」への挑戦（noRank）ではランクを変えない
  if (!session.noRank) pushRankRecent(dir, word.lv, correct);
  const p = getProg(word.id);
  const now = Date.now();
  if (correct) {
    p.right++;
    if (dir === "e2j") p.rightE2J = (p.rightE2J || 0) + 1; else p.rightJ2E = (p.rightJ2E || 0) + 1;
    p.stage = Math.min(p.stage + 1, INTERVALS_DAYS.length - 1);
    if (p.stage < 1) p.stage = 1;
    p.due = now + INTERVALS_DAYS[p.stage] * 24 * 60 * 60 * 1000;
  } else {
    p.wrong++;
    if (dir === "e2j") { p.wrongE2J = (p.wrongE2J || 0) + 1; p.lastWrongE2J = now; }
    else { p.wrongJ2E = (p.wrongJ2E || 0) + 1; p.lastWrongJ2E = now; }
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

// ===== kuromoji（形態素解析）による読み変換 =====
// 「せいかく」と発音しても音声認識が文脈次第で「性格」「正確」など別の漢字に変換することがあり、
// 表記だけの比較では発音が合っていても不正解になってしまう（同音異義語問題）。
// kuromojiで漢字→読み（カタカナ）に変換し、読みが一致すれば正解として扱うことでこれを解消する。
// 辞書(約6MB)は初回のみダウンロードし、Service Workerがキャッシュするので2回目以降は高速。
let kuromojiTokenizerPromise = null;
function getKuromojiTokenizer() {
  if (!kuromojiTokenizerPromise) {
    kuromojiTokenizerPromise = new Promise(resolve => {
      if (typeof kuromoji === "undefined") return resolve(null);
      kuromoji.builder({ dicPath: "lib/kuromoji/dict/" }).build((err, tokenizer) => {
        resolve(err ? null : tokenizer);
      });
    });
  }
  return kuromojiTokenizerPromise;
}
// テキストを読み（ひらがな・正規化済み）に変換する。読みが取れない記号等は表層形のまま使う
function toReading(tokenizer, text) {
  try {
    const tokens = tokenizer.tokenize(String(text));
    const reading = tokens.map(t => t.reading || t.surface_form).join("");
    return normJa(kataToHira(reading));
  } catch (e) {
    return "";
  }
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

// 漢字の文字列一致だけで判定する（同音異義語には対応しない、高速なフォールバック用）
function kanjiMatch(word, texts) {
  for (const t of texts) {
    const heard = normJa(t);
    if (!heard) continue;
    for (const ans of word.ja) {
      const a = normJa(ans);
      if (heard.includes(a)) return true;
      if (a.length >= 3 && a.includes(heard) && heard.length >= 2) return true;
    }
  }
  return false;
}

// dir: "e2j" は日本語で回答, "j2e" は英語で回答
// e2j はまず漢字表記で判定し、一致しなければ読み（ひらがな）でも判定する。
// 音声認識は「げんしょう」と発音しても文脈次第で「現象」のような別の漢字に変換することがあり、
// 表記だけで比較すると発音は合っているのに不正解になってしまうため（同音異義語対策）。
async function isCorrect(word, texts, dir) {
  if (dir === "e2j") {
    if (kanjiMatch(word, texts)) return true;
    const tokenizer = await getKuromojiTokenizer();
    if (!tokenizer) return false; // 辞書が未ロードなら漢字判定のみ（劣化しても壊れない）
    for (const t of texts) {
      const heardReading = toReading(tokenizer, t);
      if (!heardReading) continue;
      for (const ans of word.ja) {
        const a = toReading(tokenizer, ans);
        if (!a) continue;
        if (heardReading.includes(a)) return true;
        if (a.length >= 3 && a.includes(heardReading) && heardReading.length >= 2) return true;
      }
    }
    return false;
  } else {
    // 出題語そのものに加えて、類義語での回答も正解として認める
    const targets = [word.en, ...(word.syn || [])].map(normEn);
    const known = getKnownEnSet();
    const heards = [];
    for (const t of texts) {
      let heard = normEn(t);
      if (!heard) continue;
      // "to give up" のような to 付き回答も許容
      if (heard.startsWith("to ")) heard = heard.slice(3);
      heards.push(heard);
      for (const target of targets) {
        if (heard === target) return true;
        // 「I decline」のように余計な語が付いた回答は許容するが、聞き取り自体が別の登録熟語なら
        // 含んでいるだけで正解にはしない（"get up" は "get" を含むが receive の正解ではない）
        if (!known.has(heard) && containsPhrase(heard, target)) return true;
        if (containsPhrase(target, heard) && heard.length >= Math.max(3, target.length - 2)) return true;
      }
    }
    // 綴りが近い場合の救済。英語の音声認識は正しく発音しても近い別の語を返すことがあり
    // （decline → recline 等）、表記の完全一致だけだと正解が弾かれてしまうため。
    // ただし increase と decrease のように「綴りは近いが意味が逆」の語を誤って正解にしないよう、
    // 許容は1文字違いまでとし、聞き取り結果がそれ自体で登録語のときは近似一致を使わない。
    for (const heard of heards) {
      if (known.has(heard)) continue; // 別の登録語をはっきり言っている → 近似一致させない
      for (const target of targets) {
        if (target.length < 5) continue;
        if (editDistance(heard, target) <= 1) return true;
        for (const hw of heard.split(" ")) {
          if (hw.length >= 5 && !known.has(hw) && editDistance(hw, target) <= 1) return true;
        }
      }
    }
  }
  return false;
}

// 単語境界を守った包含判定。単純な部分文字列一致だと "breakfast" が "break" を、
// "inexpensive" が "expensive" を含むと見なされ、意味の違う（ときには逆の）語が正解になってしまう
function containsPhrase(hay, needle) {
  if (!needle || needle.length > hay.length) return false;
  let from = 0;
  for (;;) {
    const i = hay.indexOf(needle, from);
    if (i < 0) return false;
    const before = i === 0 ? " " : hay[i - 1];
    const after = i + needle.length >= hay.length ? " " : hay[i + needle.length];
    if (before === " " && after === " ") return true;
    from = i + 1;
  }
}

// 収録されている英語表記（出題語＋類義語）の集合。近似一致の誤爆を防ぐために使う
let knownEnSet = null;
function getKnownEnSet() {
  if (!knownEnSet) {
    knownEnSet = new Set();
    for (const w of WORDS) {
      knownEnSet.add(normEn(w.en));
      for (const s of (w.syn || [])) knownEnSet.add(normEn(s));
    }
  }
  return knownEnSet;
}

// レーベンシュタイン距離（音声認識のゆれを吸収する近似一致用）
function editDistance(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 3) return 99; // 明らかに違う長さは打ち切り
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
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
// 余韻を残して減衰するチャイム音（ピンポーン用）
function chime(freq, startOffset, dur, vol) {
  const t = audioCtx.currentTime + startOffset;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}
function playCorrect() { // ピンポン♪（高→低の2音チャイム、テンポよく短めに）
  ensureAudio();
  if (!audioCtx) return;
  chime(1319, 0, 0.16, 0.3);    // ピン (E6)
  chime(1047, 0.12, 0.3, 0.3);  // ポン (C6)
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

// 1回分の聞き取り。resolve: {texts:[...]} / {sound:true} / {noSpeech:true} / {error:msg}
// - {texts}   : 文字として認識できた
// - {sound}   : 発話（音声）は検知したが文字として解析できなかった → 呼び出し側で「もう一度」を促す
// - {noSpeech}: 発話が検知されないままタイムアウト
// 周囲のノイズが多いと、認識エンジンがタイムアウト前に勝手に打ち切って no-speech を
// 返してくることがある（「聞き取れない」誤判定の原因）。そこで発話が検知されないまま終わった
// 場合はタイムアウトまで認識を張り直して聞き続ける。発話が検知されたのに解析できなかった場合は
// {sound} を返し、呼び出し側で「もう一度」と促す。
function listen(lang, timeoutMs) {
  return new Promise(resolve => {
    if (!SR) return resolve({ error: "unsupported" });
    const deadline = Date.now() + (timeoutMs || DEFAULT_TIMEOUT_MS);
    let settled = false;
    let rec = null;
    let sawSpeech = false; // この聞き取りの間に発話（音声）を検知したか
    // stopListening から外部中断できるよう、コントローラを activeRec に置く
    const ctl = { abort() { finish({ noSpeech: true }); } };
    activeRec = ctl;
    const timer = setTimeout(() => finish(sawSpeech ? { sound: true } : { noSpeech: true }), timeoutMs || DEFAULT_TIMEOUT_MS);
    const finish = v => {
      if (settled) return;
      settled = true;
      if (activeRec === ctl) activeRec = null;
      clearTimeout(timer);
      if (rec) { try { rec.abort(); } catch (e) {} }
      resolve(v);
    };
    const endOrRestart = () => {
      if (settled) return;
      // 発話を検知していたら「解析できなかった」として即座に返す（もう一度を促すため）
      if (sawSpeech) return finish({ sound: true });
      // 無音のまま終わった場合、残り時間があれば張り直して聞き続ける（ノイズ対策）
      if (Date.now() >= deadline - 400) return finish({ noSpeech: true });
      startRec();
    };
    const startRec = () => {
      rec = new SR();
      rec.lang = lang;
      rec.interimResults = false;
      rec.maxAlternatives = 5;
      rec.onspeechstart = () => { sawSpeech = true; };
      rec.onresult = ev => {
        const texts = [];
        const res = ev.results[ev.results.length - 1];
        for (let i = 0; i < res.length; i++) {
          const t = res[i].transcript.trim();
          if (t) texts.push(t);
        }
        if (texts.length) finish({ texts });
        else { sawSpeech = true; finish({ sound: true }); }
      };
      rec.onerror = ev => {
        if (ev.error === "no-speech" || ev.error === "aborted") endOrRestart();
        else finish({ error: ev.error });
      };
      rec.onend = () => endOrRestart();
      try { rec.start(); } catch (e) { finish({ error: String(e) }); }
    };
    startRec();
  });
}

function stopListening() {
  if (activeRec) { const a = activeRec; activeRec = null; try { a.abort(); } catch (e) {} }
}

// ===== 画面要素 =====
const $ = id => document.getElementById(id);
const screens = { setup: $("setup"), session: $("session"), result: $("result"), wrong: $("wrongScreen") };
function showScreen(name) {
  for (const k in screens) screens[k].classList.toggle("hidden", k !== name);
}

// ===== 設定の保存・復元（cookieに保存） =====
function setCookie(name, value, days) {
  const exp = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${exp};path=/;SameSite=Lax`;
}
function getCookie(name) {
  const m = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}
function readSettings() {
  // Lv1〜4チップは value="1,2" のようにカンマ区切りで実データのレベル(1〜5)を持つ
  const levels = [...document.querySelectorAll("#levelChips input:checked")]
    .flatMap(i => i.value.split(",").map(Number));
  const kinds = [...document.querySelectorAll("#kindChips input:checked")].map(i => i.value);
  const mode = document.querySelector("#modeChips input:checked").value;
  const count = +document.querySelector("#countChips input:checked").value;
  const timeout = +document.querySelector("#timeoutChips input:checked").value * 1000;
  return {
    levels, kinds, mode, count, timeout,
    speakQ: $("optSpeak").checked, auto: $("optAuto").checked,
    showSyn: $("optSyn").checked, showIpa: $("optIpa").checked,
  };
}
function persistSettings(s) { setCookie(SETTINGS_KEY, JSON.stringify(s), 365); }
function restoreSettings() {
  let s;
  try { s = JSON.parse(getCookie(SETTINGS_KEY)); } catch (e) {}
  if (!s) return;
  document.querySelectorAll("#levelChips input").forEach(i =>
    i.checked = i.value.split(",").some(v => (s.levels || []).includes(+v)));
  document.querySelectorAll("#kindChips input").forEach(i => i.checked = s.kinds.includes(i.value));
  document.querySelectorAll("#modeChips input").forEach(i => i.checked = i.value === s.mode);
  document.querySelectorAll("#countChips input").forEach(i => i.checked = +i.value === s.count);
  if (s.timeout) document.querySelectorAll("#timeoutChips input").forEach(i => i.checked = +i.value * 1000 === s.timeout);
  $("optSpeak").checked = s.speakQ !== false;
  $("optAuto").checked = s.auto !== false;
  $("optSyn").checked = !!s.showSyn;
  $("optIpa").checked = !!s.showIpa;
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
  // ランクは右上のボックスに英→和・和→英を縦並びで表示（未確定は「--」）
  $("rankE2J").textContent = fmtRank(displayRank("e2j"));
  $("rankJ2E").textContent = fmtRank(displayRank("j2e"));
  $("statsBody").innerHTML =
    `復習期限が来ている問題: <b>${dueCount}語</b><br>` +
    `通算正答率: ${acc}%（⭕${right} ❌${wrong}） ／ 学習済み: ${learned}語`;
}

// ===== セッション制御 =====
const session = {
  active: false, queue: [], index: 0, total: 0,
  right: 0, wrong: 0, wrongList: [], history: [],
  settings: null, currentResolve: null, wakeLock: null,
};

// ===== 画面を指で押し続けている間は自動で次の問題に進めない =====
let isTouching = false;
document.addEventListener("pointerdown", () => {
  isTouching = true;
  session.sawTouch = true; // 無反応カウントの解除用（タッチがあれば「反応あり」とみなす）
});
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

// 音声が連続で認識できなかったときに全画面表示する一時中断オーバーレイ。
// 画面のどこか（「続行する」ボタン含む）をタッチすると再開する
function waitForTapToResume() {
  return new Promise(resolve => {
    const overlay = $("pauseOverlay");
    overlay.classList.remove("hidden");
    const onTap = () => {
      overlay.classList.add("hidden");
      overlay.removeEventListener("pointerdown", onTap);
      resolve({ quit: false });
    };
    overlay.addEventListener("pointerdown", onTap);
  });
}

// ===== 直近3問の履歴表示（間違えた問題のみ） =====
const HISTORY_SIZE = 3;
function pushHistory(item, correct) {
  if (correct) return; // 履歴には間違えた問題だけを表示する
  const w = item.word;
  const q = item.dir === "e2j" ? w.en : w.ja[0];
  const a = item.dir === "e2j" ? w.ja[0] : w.en;
  session.history.unshift({ q, a });
  session.history.length = Math.min(session.history.length, HISTORY_SIZE);
  renderHistory();
}
function renderHistory() {
  $("historyBar").innerHTML = session.history.map(h =>
    `<span class="hist-item ng">❌ ${escapeHtml(h.q)} → ${escapeHtml(h.a)}</span>`
  ).join("");
}

function questionDir(settings) {
  return settings.mode === "j2e" ? "j2e" : "e2j";
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
  beginSession(settings, queue, { noRank: false });
}

// 過去に間違えた問題（永続の間違いリスト）だけをシャッフルして出題（設定画面のボタンから）。
// この挑戦ではランクを変えない。出題方向は設定画面で選んだ形式に従う。
function startWrongQuiz() {
  const settings = readSettings();
  if (!settings.kinds.length) { alert("種類を1つ以上選んでください"); return; }
  persistSettings(settings);
  const dir = questionDir(settings);
  const wrongKey = dir === "e2j" ? "wrongE2J" : "wrongJ2E";
  const words = WORDS.filter(w => progress[w.id] && progress[w.id][wrongKey] > 0);
  if (!words.length) { alert("間違えた問題がありません（" + (dir === "e2j" ? "英→和" : "和→英") + "）"); return; }
  ensureAudio();
  shuffle(words);
  beginSession(settings, words, { noRank: true });
}

// 間違えた問題だけをシャッフルして再挑戦（結果画面から）。ランクは変えない
function startRetrySession() {
  const words = session.wrongList.slice();
  if (!words.length || !session.settings) return;
  ensureAudio();
  shuffle(words);
  beginSession(session.settings, words, { noRank: true });
}

function beginSession(settings, words, opts) {
  opts = opts || {};
  session.active = true;
  session.settings = settings;
  session.noRank = !!opts.noRank;       // 「間違えた問題」への挑戦ではランクを変えない
  session.dirMode = questionDir(settings);
  session.queue = words.map(w => ({ word: w, dir: session.dirMode }));
  session.total = session.queue.length;
  session.index = 0;
  session.right = 0; session.wrong = 0; session.wrongList = []; session.history = [];
  session.noSpeechStreak = 0;
  session.rankBefore = displayRank(session.dirMode); // 結果画面でランクの変化を見せるため開始時点を控えておく
  renderHistory();
  showScreen("session");
  requestWakeLock();
  runLoop();
}

// announce: 全問出題しきって終わったときだけ true（音声で終了を知らせる）
function endSession(announce) {
  const speakEnd = announce && session.settings && session.settings.speakQ;
  session.active = false;
  stopListening();
  speechSynthesis.cancel();
  if (session.wakeLock) { session.wakeLock.release().catch(() => {}); session.wakeLock = null; }
  // 通常セッションのみ、終了時点のランクを履歴に確定する（グラフ用）
  if (!session.noRank && session.dirMode) commitRank(session.dirMode);
  renderResult();
  showScreen("result");
  // ハンズフリーで終了に気づけるよう読み上げる（画面を見ていない前提）
  if (speakEnd) speak("問題は終了しました", "ja-JP", 1.0);
}

function setPhase(text) {
  $("phase").textContent = text;
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
// 例文HTMLを生成し、出題語に当たる部分を <b class="ex-hl"> で強調する。
// 答えのヒントになる部分は <span class="spoiler"> で包んでおき、実際に消す/挿入するのではなく
// visibility切り替えだけで表示するため、正誤判定の前後でレイアウトが一切動かない。
// e2j: 英文はそのまま見せてよいが、和訳(ex-ja)だけが答えのヒントになるのでspoiler化
// j2e: 英語自体が答えになるため、例文全体をspoiler化
// 文中の出題語（活用形を含む）を cls つきの <b> で囲んだHTMLを返す
function highlightTarget(ex, targetEn, cls) {
  const tgt = targetEn.split(/\s+/);
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
  let out = "", pos = 0;
  toks.forEach((tk, idx) => {
    out += escapeHtml(ex.slice(pos, tk.start));
    out += hl.has(idx) ? `<b class="${cls}">${escapeHtml(tk.text)}</b>` : escapeHtml(tk.text);
    pos = tk.end;
  });
  return out + escapeHtml(ex.slice(pos));
}

function exampleHtml(w, dir) {
  if (!w.ex) return "";
  const sentence = highlightTarget(w.ex, w.en, "ex-hl");
  const jaSpan = `<span class="ex-ja spoiler">${escapeHtml(w.exJa || "")}</span>`;
  if (dir === "e2j") return sentence + jaSpan;
  return `<span class="spoiler">${sentence}${jaSpan}</span>`;
}

// 語源分解のHTML。英語部分（接頭辞・語根・接尾辞）は出題時点から表示し、
// その意味だけを spoiler にして回答後に開示する。
// （英→和では英単語は問題として既に見えているので、語源の英語部分を出しても答えにならない。
//   和→英では英単語自体が答えなので、呼び出し側で #qEtym ごと spoiler にして丸ごと隠す）
function etymHtml(w) {
  if (!w.etym || !w.etym.length) return "";
  const glosses = w.etym.map(([p, m]) =>
    `<span class="etym-part"><b>${escapeHtml(p)}</b><span class="etym-m spoiler">${escapeHtml(m)}</span></span>`
  ).join("");
  return `<div class="etym-gloss">${glosses}</div>`;
}

function showQuestion(item) {
  const w = item.word;
  const s = session.settings;

  // 回答画面でしか見せない情報（和訳・類義語・語源、和→英の場合は品詞・発音記号・例文も）は
  // 最初から最終的な内容までレンダリングしておき、spoilerクラス(visibility:hidden)で隠す。
  // 正誤判定のタイミングでDOMに要素を足し引きするとレイアウトが動いてしまうため、
  // 「表示するかどうか」だけを切り替えて位置がずれないようにしている。
  $("qExample").innerHTML = exampleHtml(w, item.dir);

  // 品詞は問題の単語・熟語の直前にバッジ表示（和→英では答えのヒントになるため回答後に表示）
  $("qPos").textContent = w.pos || "";
  $("qPos").classList.toggle("hidden", !w.pos);
  $("qPos").classList.toggle("spoiler", item.dir === "j2e" && !!w.pos);
  $("qTextWord").textContent = item.dir === "e2j" ? w.en : w.ja[0];

  // 発音記号は設定でONのときだけ行ごと表示（和→英では回答後に表示）
  const ipa = w.ipa || "";
  $("qIpaText").textContent = ipa;
  $("qIpa").classList.toggle("hidden", !s.showIpa);
  $("qIpa").classList.toggle("spoiler", item.dir === "j2e" && !!ipa);

  const synText = session.settings.showSyn && w.syn && w.syn.length ? "類義語: " + w.syn.join(", ") : "";
  $("qSynonyms").textContent = synText;
  $("qSynonyms").classList.toggle("spoiler", !!synText);

  // 語源: 英→和では英語部分を出題時から表示（意味だけ回答後）、和→英では丸ごと隠す
  const etym = etymHtml(w);
  $("qEtym").innerHTML = etym;
  $("qEtym").classList.toggle("spoiler", item.dir === "j2e" && !!etym);

  $("heard").textContent = "";
  $("verdict").textContent = "";
  $("verdict").className = "verdict";
  $("qAltAns").textContent = ""; // 正解時の「他の答え」行（高さはCSSで確保済みなので後から入れてもずれない）
  $("progressLabel").textContent = `${Math.min(session.index + 1, session.total)} / ${session.total}`;
  $("scoreLabel").textContent = `⭕${session.right} ❌${session.wrong}`;
  $("nextRow").style.visibility = "hidden";
  // 「回答してください」の案内文は、音声認識を開始する前から表示しておく
  // （認識開始の瞬間に出すとレイアウトがずれてしまうため）
  $("phase").textContent = item.dir === "e2j" ? "日本語で答えてください" : "英語で答えてください";
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
      recordAnswer(item.word, true, item.dir);
      // 一度間違えても再出題で正解できた問題は「間違えた問題」から外す
      // （結果画面の一覧や再挑戦の対象に出さない）
      const fixed = session.wrongList.findIndex(x => x.id === item.word.id);
      if (fixed >= 0) session.wrongList.splice(fixed, 1);
    } else { // wrong / skip
      session.wrong++;
      recordAnswer(item.word, false, item.dir);
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
  if (session.active) endSession(true); // 全問出題しきった終了だけ音声で知らせる
}

// 1問の出題〜判定。戻り値: "correct" | "wrong" | "skip" | "repeat" | "quit"
async function askOne(item) {
  const w = item.word;
  const s = session.settings;
  const answerLang = item.dir === "e2j" ? "ja-JP" : "en-US";
  session.sawTouch = false; // この問題の間にタッチがあったか（無反応カウントの解除条件）
  showQuestion(item);

  // 出題読み上げ（案内文は showQuestion で既に表示済み）
  if (s.speakQ) {
    if (item.dir === "e2j") await speak(w.en, "en-US", 0.9);
    else await speak(w.ja[0], "ja-JP", 1.0);
    if (!session.active) return "quit";
  }

  // 回答の聞き取り。発話は検知したが文字にできなかった場合は「もう一度」を促して同じ時間待つ
  setPhase(item.dir === "e2j" ? "日本語で答えてください" : "英語で答えてください");
  let res, reask = 0, spokeButUnclear = false;
  while (true) {
    res = await listenInterruptible(answerLang, s.timeout || DEFAULT_TIMEOUT_MS);
    if (!session.active) return "quit";
    if (res.manual || res.texts || res.noSpeech || res.error) break;
    // res.sound: 発話は検知したが解析できなかった → 上限まで「もう一度」を促して聞き直す
    spokeButUnclear = true;
    if (reask >= REASK_LIMIT) break;
    reask++;
    setPhase("🔁 もう一度どうぞ");
    if (s.speakQ) { await speak("もう一度", "ja-JP", 1.1); if (!session.active) return "quit"; }
  }
  setPhase("");
  if (!session.active) return "quit";

  if (res.manual) return await handleManual(res.manual, item);
  if (res.error === "unsupported") { alert("このブラウザは音声認識に対応していません。Android版Chromeをご利用ください。"); return "quit"; }
  if (res.error === "not-allowed" || res.error === "service-not-allowed") {
    alert("マイクの使用が許可されていません。ブラウザの設定でマイクを許可してください。");
    return "quit";
  }

  if (res.noSpeech || res.error || res.sound) {
    // 発話は検知していた（res.sound / spokeButUnclear）＝ユーザーは居るので無反応カウントしない。
    // 完全無音の場合のみ、回答表示中にも聞き耳を立てて発話があれば「反応あり」として扱う
    const spoke = !!res.sound || spokeButUnclear;
    const bgListen = spoke ? null : listen(answerLang, WRONG_WAIT_MS + 2000);
    const outcome = await finishAnswer(item, false, "（聞き取れませんでした）");
    if (bgListen) stopListening();
    const bg = bgListen ? await bgListen : null;
    if (outcome === "quit") return outcome;
    if (spoke || session.sawTouch || (bg && bg.texts && bg.texts.length)) {
      session.noSpeechStreak = 0; // タッチか発話があればユーザーは居るのでカウントしない
    } else {
      session.noSpeechStreak = (session.noSpeechStreak || 0) + 1;
      if (session.noSpeechStreak >= NO_SPEECH_STREAK_LIMIT) {
        session.noSpeechStreak = 0;
        const r = await waitForTapToResume();
        if (r.quit) return "quit";
      }
    }
    return outcome;
  }

  session.noSpeechStreak = 0;
  $("heard").textContent = "🎤 " + res.texts[0];
  const cmd = detectCommand(res.texts, item.dir);
  if (cmd === "skip") return "skip";
  if (cmd === "repeat") return "repeat";
  if (cmd === "quit") return "quit";

  return await finishAnswer(item, await isCorrect(w, res.texts, item.dir), res.texts[0]);
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

  const answerText = item.dir === "e2j" ? w.ja[0] : w.en;
  // 出題時からレンダリング済みの和訳・品詞・発音記号・類義語・語源（および語源の意味）を
  // ここで一括して見えるようにする（中身は変えずspoilerを外すだけなのでレイアウトは動かない）
  document.querySelectorAll("#session .q-area .spoiler").forEach(el => el.classList.remove("spoiler"));

  if (correct) {
    v.textContent = "⭕ 正解！";
    v.className = "verdict ok";
    // 認識された語以外にも正解として登録されている訳語があれば併記する（英→和のみ）
    if (item.dir === "e2j" && w.ja.length > 1) {
      const heardNorm = normJa(heardText || "");
      const others = w.ja.filter(a => !heardNorm.includes(normJa(a)));
      if (others.length) $("qAltAns").textContent = "ほかの回答: " + others.join(" ／ ");
    }
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

// ===== 間違えた問題リスト（英→和・和→英を分けて表示） =====
// "count" = 間違えた回数順（多い順） / "recent" = 最近間違えた順
let wrongSortMode = "count";
let wrongShowSyn = true;   // 類義語を併記するか
let wrongShowEx = false;   // 例文を併記するか

// dir別に一覧HTMLを作る。各行は「回数(❌⭕) — 問題 → 解答」の順（数字を先に見せる）
function wrongListSection(dir, title) {
  const wrongKey = dir === "e2j" ? "wrongE2J" : "wrongJ2E";
  const rightKey = dir === "e2j" ? "rightE2J" : "rightJ2E";
  const lastWrongKey = dir === "e2j" ? "lastWrongE2J" : "lastWrongJ2E";
  const items = WORDS
    .map(w => ({ w, p: progress[w.id] }))
    .filter(x => x.p && x.p[wrongKey] > 0)
    .sort((a, b) => wrongSortMode === "recent"
      ? (b.p[lastWrongKey] || 0) - (a.p[lastWrongKey] || 0)
      : b.p[wrongKey] - a.p[wrongKey] || a.w.en.localeCompare(b.w.en));
  const body = items.length
    ? `<div class="wl-list">${items.map(({ w, p }) => {
        const q = dir === "e2j" ? w.en : w.ja[0];
        const a = dir === "e2j" ? w.ja[0] : w.en;
        const ipa = dir === "e2j" && w.ipa ? ` <span class="wl-ipa">${escapeHtml(w.ipa)}</span>` : "";
        const synLine = wrongShowSyn && w.syn && w.syn.length ? `<div class="wl-syn">類義語: ${escapeHtml(w.syn.join(", "))}</div>` : "";
        const exLine = wrongShowEx && w.ex ? `<div class="wl-ex">${escapeHtml(w.ex)}<span class="wl-exja">${escapeHtml(w.exJa || "")}</span></div>` : "";
        return `<div class="wl-item"><div><span class="wl-count">❌${p[wrongKey]} ⭕${p[rightKey] || 0}</span> <b>${escapeHtml(q)}</b>${ipa} — ${escapeHtml(a)}</div>${synLine}${exLine}</div>`;
      }).join("")}</div>`
    : `<p class="wl-empty">なし 🎉</p>`;
  return `<div class="wl-section"><h3>${title}</h3>${body}</div>`;
}
function renderWrongList() {
  $("sortCountBtn").classList.toggle("active", wrongSortMode === "count");
  $("sortRecentBtn").classList.toggle("active", wrongSortMode === "recent");
  $("wlSynBtn").classList.toggle("active", wrongShowSyn);
  $("wlExBtn").classList.toggle("active", wrongShowEx);
  $("wrongListBody").innerHTML =
    wrongListSection("e2j", "英→和") + wrongListSection("j2e", "和→英");
}

// ===== 結果画面 =====
// 出題方向のランク履歴（過去RANK_HIST_MAX回）を折れ線グラフのSVGにする
function renderRankGraph(dir) {
  const hist = rankData[dir].hist;
  if (!hist.length) return `<p class="wl-empty">まだ記録がありません</p>`;
  const W = 300, H = 120, padL = 26, padR = 10, padT = 12, padB = 20;
  const n = hist.length;
  const xw = W - padL - padR, yh = H - padT - padB;
  const x = i => padL + (n === 1 ? xw / 2 : xw * i / (n - 1));
  const y = v => padT + yh * (1 - v / 10);
  const pts = hist.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const dots = hist.map((v, i) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" class="rg-dot"/>` +
    `<text x="${x(i).toFixed(1)}" y="${(y(v) - 7).toFixed(1)}" text-anchor="middle" class="rg-val">${fmtRank(v)}</text>`
  ).join("");
  const grid = [0, 5, 10].map(g =>
    `<line x1="${padL}" y1="${y(g).toFixed(1)}" x2="${W - padR}" y2="${y(g).toFixed(1)}" class="rg-grid"/>` +
    `<text x="${(padL - 5).toFixed(1)}" y="${(y(g) + 3).toFixed(1)}" text-anchor="end" class="rg-axis">${g}</text>`
  ).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="rank-graph-svg">${grid}` +
    `<polyline points="${pts}" fill="none" class="rg-line"/>${dots}</svg>`;
}

// ===== 間違えた語を使った短い文章＋イラスト（結果画面の下部） =====
// 文章は端末内で組み立てる（無料で使える外部の文章生成APIはBot対策で呼べないため）。
// 各語には日常会話の例文が用意してあるので、短いものから数文だけつなげて「ごく短い文章」にする。
// イラストはその文章をもとにWebから取得する。
const REVIEW_MAX_SENTENCES = 3;

function buildReviewPassage(words) {
  const withEx = words.filter(w => w.ex);
  if (!withEx.length) return null;
  // ごく短くするため、短い例文から優先して数文だけ使う
  const picked = withEx.slice().sort((a, b) => a.ex.length - b.ex.length).slice(0, REVIEW_MAX_SENTENCES);
  return {
    html: picked.map(w => highlightTarget(w.ex, w.en, "rp-hl")).join(" "),
    ja: picked.map(w => w.exJa).filter(Boolean).join(" "),
    plain: picked.map(w => w.ex).join(" "),
    used: picked.length,
    total: words.length,
  };
}

function hashSeed(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 100000;
}

// CCライセンスのイラスト検索（画像生成が失敗したときの代替）
async function openverseImageUrl(query) {
  try {
    const r = await fetch("https://api.openverse.org/v1/images/?q=" + encodeURIComponent(query) +
      "&category=illustration&page_size=1");
    if (!r.ok) return null;
    const j = await r.json();
    const it = j.results && j.results[0];
    return it ? (it.thumbnail || it.url) : null;
  } catch (e) { return null; }
}

function loadReviewImage(prompt, fallbackQuery) {
  const wrap = $("reviewImageWrap"), img = $("reviewImage"), note = $("reviewImageNote");
  wrap.classList.remove("hidden");
  img.classList.add("hidden");
  note.textContent = "イラストを取得中…";
  let done = false, triedFallback = false;
  const fail = () => {
    if (done) return;
    done = true;
    wrap.classList.add("hidden");
  };
  const useFallback = async () => {
    if (done || triedFallback) return fail();
    triedFallback = true;
    const url = await openverseImageUrl(fallbackQuery || prompt);
    if (done) return;
    if (!url) return fail();
    img.src = url;
  };
  img.onload = () => { if (done) return; done = true; img.classList.remove("hidden"); note.textContent = ""; };
  img.onerror = () => useFallback();
  // 画像生成は時間がかかることがあるので、待ちすぎたら検索画像に切り替える
  setTimeout(() => { if (!done && !triedFallback) useFallback(); }, 20000);
  img.src = "https://image.pollinations.ai/prompt/" +
    encodeURIComponent("simple flat cartoon illustration, everyday life scene: " + prompt) +
    "?width=512&height=320&nologo=true&seed=" + hashSeed(prompt);
}

function renderReviewSection(words) {
  const card = $("reviewPassageCard");
  const p = buildReviewPassage(words);
  if (!p) { card.classList.add("hidden"); return; }
  card.classList.remove("hidden");
  $("reviewPassage").innerHTML = p.html;
  $("reviewPassageJa").textContent = p.ja;
  $("reviewPassageNote").textContent =
    p.total > p.used ? `※ 間違えた${p.total}語のうち、下線の${p.used}語を使った文章です` : "";
  loadReviewImage(p.plain, words[0] ? words[0].en : "");
}

function renderResult() {
  const answered = session.right + session.wrong;
  const acc = answered ? Math.round(session.right / answered * 100) : 0;
  let html = `回答数: ${answered}問<br>⭕ ${session.right}問 ／ ❌ ${session.wrong}問<br>正答率: <b>${acc}%</b>`;
  if (!session.noRank) {
    // 通常セッション: 出題方向のランクの変化を表示し、履歴グラフも出す
    const dir = session.dirMode;
    const label = dir === "e2j" ? "英→和" : "和→英";
    const before = session.rankBefore, after = displayRank(dir);
    const diff = (before != null && after != null) ? Math.round((after - before) * 10) / 10 : null;
    const diffHtml = diff == null ? ""
      : diff > 0 ? `（<span class="rank-up">▲${diff.toFixed(1)}</span>）`
      : diff < 0 ? `（<span class="rank-down">▼${Math.abs(diff).toFixed(1)}</span>）`
      : `（<span class="rank-flat">±0</span>）`;
    html += `<br>${label}ランク: ${fmtRank(before)} → <b class="rank-val">${fmtRank(after)}</b>${diffHtml}`;
    $("rankGraphCard").classList.remove("hidden");
    $("rankGraphTitle").textContent = `${label} ランク推移`;
    $("rankGraph").innerHTML = renderRankGraph(dir);
  } else {
    // 「間違えた問題」への挑戦: ランクは変えず、グラフも出さない
    html += `<br><span class="rank-note">再挑戦のためランクは変更していません</span>`;
    $("rankGraphCard").classList.add("hidden");
  }
  $("resultSummary").innerHTML = html;
  $("resultWrong").innerHTML = session.wrongList.length
    ? session.wrongList.map(w => `<b>${w.en}</b> — ${w.ja[0]}`).join("<br>")
    : "なし 🎉";
  // 間違いがあるときだけ「間違えた問題だけ再挑戦」を出す
  $("retryWrongBtn").classList.toggle("hidden", !session.wrongList.length);
  // 画面下部に、間違えた語を使った短い文章とイラストを表示
  renderReviewSection(session.wrongList);
}

// ===== イベント =====
$("startBtn").addEventListener("click", startSession);
$("wrongQuizBtn").addEventListener("click", startWrongQuiz);
// ランク表示クリックで説明ポップアップ
$("rankLink").addEventListener("click", e => { e.preventDefault(); $("rankInfoOverlay").classList.remove("hidden"); });
$("rankInfoClose").addEventListener("click", () => $("rankInfoOverlay").classList.add("hidden"));
$("rankInfoOverlay").addEventListener("click", e => { if (e.target === $("rankInfoOverlay")) $("rankInfoOverlay").classList.add("hidden"); });
$("quitBtn").addEventListener("click", () => manualAction("quit") || (session.active && endSession()));
$("repeatBtn").addEventListener("click", () => manualAction("repeat"));
$("skipBtn").addEventListener("click", () => manualAction("skip"));
// 一時停止ボタンは長押しで反応するが、テキストとして選択可能だと長押しでブラウザの
// 文字選択モードに入ってしまい、pointerイベントが途中でキャンセルされて一時停止が効かなくなる。
// pointerdown / contextmenu のデフォルト動作を止めて選択・メニューが発生しないようにする。
$("pauseBtn").addEventListener("pointerdown", e => e.preventDefault());
$("pauseBtn").addEventListener("contextmenu", e => e.preventDefault());
$("nextBtn").addEventListener("click", () => manualAction("next"));
$("backBtn").addEventListener("click", () => { renderStats(); showScreen("setup"); });
$("retryWrongBtn").addEventListener("click", startRetrySession);
$("wrongListBtn").addEventListener("click", () => { renderWrongList(); showScreen("wrong"); });
$("wrongBackBtn").addEventListener("click", () => { renderStats(); showScreen("setup"); });
$("sortCountBtn").addEventListener("click", () => { wrongSortMode = "count"; renderWrongList(); });
$("sortRecentBtn").addEventListener("click", () => { wrongSortMode = "recent"; renderWrongList(); });
$("wlSynBtn").addEventListener("click", () => { wrongShowSyn = !wrongShowSyn; renderWrongList(); });
$("wlExBtn").addEventListener("click", () => { wrongShowEx = !wrongShowEx; renderWrongList(); });

// 画面復帰時にウェイクロックを取り直す
document.addEventListener("visibilitychange", () => {
  if (session.active && document.visibilityState === "visible") requestWakeLock();
});

// ===== 初期化 =====
$("appVersion").textContent = APP_VERSION;
restoreSettings();
renderStats();
if (!SR) {
  $("supportNote").textContent = "⚠ このブラウザは音声認識非対応です。AndroidのChromeで開いてください。";
}
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
// 同音異義語判定用の辞書を早めに読み込み始めておく（初回の回答時に間に合わせるため）
getKuromojiTokenizer();
