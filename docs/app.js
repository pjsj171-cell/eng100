/* 영어회화 100일의 기적 — 차량용 쉐도잉 앱
 * 구조: pack.zip(음원+문장) → IndexedDB 저장 → 모드별 트랙을 OfflineAudioContext로 WAV 렌더링 → <audio>로 재생
 * 렌더링된 한 트랙이 통째로 재생되므로 화면이 꺼져도 끊기지 않고, 블루투스 버튼(Media Session)으로 문장 이동이 됩니다.
 */
'use strict';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pad3 = (n) => String(n).padStart(3, '0');

// ───────────────────────── 설정 · 진도 (localStorage)
const DEFAULTS = { passes: 3, reps: 1, gap: 1.3, reviewDays: 5, reviewCount: 15, lecture: 'first' };
const settings = Object.assign({}, DEFAULTS, load('eng100.settings', {}));
const progress = load('eng100.progress', { days: {}, lastDay: 1 });
function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
const dayProg = (d) => (progress.days[d] ??= { lectured: false, passes: 0, reviews: 0, last: 0 });

// ───────────────────────── IndexedDB
let dbp;
function db() {
  return dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open('eng100', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('files'); d.createObjectStore('meta'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbGet(store, key) { const d = await db(); return new Promise((res, rej) => { const q = d.transaction(store).objectStore(store).get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function idbPut(store, key, val) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(store, 'readwrite'); t.objectStore(store).put(val, key); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
async function idbCount(store) { const d = await db(); return new Promise((res, rej) => { const q = d.transaction(store).objectStore(store).count(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function idbClear() { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(['files', 'meta'], 'readwrite'); t.objectStore('files').clear(); t.objectStore('meta').clear(); t.oncomplete = res; t.onerror = () => rej(t.error); }); }

// ───────────────────────── 데이터
let DATA = null;            // days.json
const dayByNum = (n) => DATA?.days.find(d => d.day === n);

async function loadData() {
  DATA = (await idbGet('meta', 'days')) || null;
  refreshHome();
  return !!DATA;
}

// pack.zip 가져오기 (스트리밍 해제 → IndexedDB)
async function importZip(file) {   // file: File, 또는 {stream(), size} (개발용 URL 가져오기)
  const prog = $('impProg'), bar = prog.querySelector('i'), msg = $('impMsg');
  prog.classList.remove('hidden'); msg.textContent = '불러오는 중… (몇 분 걸릴 수 있어요. 화면을 켜 두세요)';
  const unz = new fflate.Unzip(); unz.register(fflate.UnzipInflate);
  const writes = []; let files = 0, daysJson = null;
  unz.onfile = (f) => {
    if (f.name.endsWith('/')) return;
    const chunks = [];
    f.ondata = (err, chunk, final) => {
      if (err) { msg.textContent = '오류: ' + err.message; throw err; }
      chunks.push(chunk);
      if (final) {
        if (f.name.endsWith('days.json')) { daysJson = JSON.parse(new TextDecoder().decode(concat(chunks))); }
        else { writes.push(idbPut('files', f.name, new Blob(chunks, { type: 'audio/mpeg' }))); }
        files++;
      }
    };
    f.start();
  };
  const reader = file.stream().getReader(); let read = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) { unz.push(new Uint8Array(0), true); break; }
    unz.push(value); read += value.length;
    bar.style.width = (read / file.size * 100).toFixed(1) + '%';
    if (writes.length > 40) { await Promise.all(writes.splice(0)); }   // 메모리 억제
  }
  await Promise.all(writes);
  if (!daysJson) throw new Error('pack.zip 안에 days.json이 없습니다');
  await idbPut('meta', 'days', daysJson);
  msg.textContent = `완료: 파일 ${files}개 저장`;
  await loadData(); refreshDataStatus();
}
function concat(chunks) { const n = chunks.reduce((a, c) => a + c.length, 0); const o = new Uint8Array(n); let p = 0; for (const c of chunks) { o.set(c, p); p += c.length; } return o; }

async function refreshDataStatus() {
  const n = await idbCount('files');
  $('dataStatus').innerHTML = DATA
    ? `<span class="k">상태</span> 자료 있음 · Day ${DATA.days.length}개 · 파일 ${n}개<br><span class="k">버전</span> ${DATA.version || '-'}`
    : `<span class="k">상태</span> 자료 없음 — pack.zip을 불러오세요`;
}

// ───────────────────────── 오디오 디코딩 · 렌더링
let dctx;                                // 디코딩용
const bufCache = new Map();              // path → AudioBuffer
async function decodeFile(path) {
  if (bufCache.has(path)) return bufCache.get(path);
  const blob = await idbGet('files', path);
  if (!blob) throw new Error('파일 없음: ' + path);
  dctx ??= new (window.AudioContext || window.webkitAudioContext)();
  const buf = await dctx.decodeAudioData(await blob.arrayBuffer());
  if (bufCache.size > 12) bufCache.delete(bufCache.keys().next().value);
  bufCache.set(path, buf);
  return buf;
}
function peakOf(buf) { let p = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i += 4) { const v = Math.abs(d[i]); if (v > p) p = v; } } return p || 1; }

// plan: [{buf, offset, dur, gain, t}] → WAV Blob URL
const RENDER_SR = 24000;
async function renderPlan(items, total) {
  const ctx = new OfflineAudioContext(1, Math.ceil(total * RENDER_SR) + RENDER_SR, RENDER_SR);
  for (const it of items) {
    const src = ctx.createBufferSource(); src.buffer = it.buf;
    const g = ctx.createGain();
    const t = it.t, e = it.t + it.dur, f = Math.min(0.012, it.dur / 4);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(it.gain, t + f);
    g.gain.setValueAtTime(it.gain, e - f); g.gain.linearRampToValueAtTime(0, e);
    src.connect(g).connect(ctx.destination);
    src.start(t, it.offset, it.dur);
  }
  const out = await ctx.startRendering();
  return URL.createObjectURL(toWav(out));
}
function toWav(abuf) {
  const n = abuf.length, sr = abuf.sampleRate, d = abuf.getChannelData(0);
  const v = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, d[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); }
  return new Blob([v], { type: 'audio/wav' });
}

// ───────────────────────── 트랙 만들기
// 쉐도잉: 문장 → (문장길이×gap + 0.4s) 쉼, reps회 반복, passes회 전체 반복
async function buildShadow(day, onlyDialog) {
  const d = dayByNum(day);
  const units = d.units.filter(u => !onlyDialog || u.k === 'd');
  const buf = await decodeFile(d.audio);
  const gain = 0.85 / peakOf(buf);
  const items = [], marks = []; let t = 0.6;
  const P = settings.passes, R = settings.reps;
  for (let p = 1; p <= P; p++) {
    for (let i = 0; i < units.length; i++) {
      const u = units[i], dur = u.e - u.s;
      marks.push({ t, step: `${onlyDialog ? '대화' : '쉐도잉'} ${p}/${P} · ${i + 1}/${units.length}`, en: u.t, ko: '' });
      for (let r = 0; r < R; r++) {
        items.push({ buf, offset: u.s, dur, gain, t });
        t += dur + dur * settings.gap + 0.4;
      }
    }
    t += 1.2;
  }
  const url = await renderPlan(items, t);
  return { kind: onlyDialog ? 'dialog' : 'shadow', day, url, marks, dur: t, label: `Day ${day} ${onlyDialog ? '대화' : '쉐도잉'}` };
}

// 복습: 한국어(TTS) → 쉼 → 영어 → 영어
function pickReview(day) {
  const cur = dayByNum(day)?.review || [];
  const pool = [];
  for (let k = Math.max(1, day - settings.reviewDays); k < day; k++) pool.push(...(dayByNum(k)?.review || []).map(r => ({ ...r, day: k })));
  shuffle(pool);
  const picked = [...cur.map(r => ({ ...r, day })), ...pool.slice(0, Math.max(0, settings.reviewCount - cur.length))];
  return shuffle(picked);
}
async function buildReview(day) {
  const list = pickReview(day);
  if (!list.length) throw new Error('복습할 문장이 없습니다');
  const items = [], marks = []; let t = 0.6;
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    const ko = await decodeFile(r.koAudio), en = await decodeFile(r.audio);
    const gk = 0.8 / peakOf(ko), ge = 0.85 / peakOf(en);
    const edur = r.e - r.s;
    marks.push({ t, step: `복습 ${i + 1}/${list.length} · Day ${r.day}`, en: '…', ko: r.ko });
    items.push({ buf: ko, offset: 0, dur: ko.duration, gain: gk, t }); t += ko.duration + Math.max(2.2, edur * settings.gap + 0.8);
    marks.push({ t, step: `복습 ${i + 1}/${list.length} · Day ${r.day}`, en: r.en, ko: r.ko });
    items.push({ buf: en, offset: r.s, dur: edur, gain: ge, t }); t += edur + 0.7;
    items.push({ buf: en, offset: r.s, dur: edur, gain: ge, t }); t += edur + edur * settings.gap + 0.9;
  }
  const url = await renderPlan(items, t);
  return { kind: 'review', day, url, marks, dur: t, label: `Day ${day} 복습` };
}

async function buildLecture(day) {
  const d = dayByNum(day);
  const blob = await idbGet('files', d.lecture);
  if (!blob) throw new Error('강의 파일 없음');
  return { kind: 'lecture', day, url: URL.createObjectURL(blob), marks: [{ t: 0, step: '강의', en: d.title, ko: '저자 해설강의' }], dur: 0, label: `Day ${day} 강의` };
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; }

// ───────────────────────── 재생 큐
const player = $('player');
let queue = [], qi = -1, cur = null, markIdx = -1, building = false;

async function startQueue(builders) {
  if (!DATA) { openData(); toast('먼저 pack.zip을 불러오세요'); return; }
  if (building) return;
  building = true;
  try {
    stopAll();
    setNow('준비 중…', '트랙을 만드는 중입니다', '');
    queue = []; qi = -1;
    const first = await builders[0](); queue.push(first);
    playTrack(0);
    for (let i = 1; i < builders.length; i++) queue.push(await builders[i]());   // 나머지는 재생 중 미리 렌더링
  } catch (e) { console.error(e); toast('오류: ' + e.message); setNow('오류', e.message, ''); }
  finally { building = false; }
}
function playTrack(i) {
  if (i < 0 || i >= queue.length) { finish(); return; }
  qi = i; cur = queue[i]; markIdx = -1;
  player.src = cur.url; player.playbackRate = 1;
  player.play().catch(e => toast('재생 실패: ' + e.message));
  updateMark(true);
  mediaMeta();
}
function stopAll() {
  player.pause(); player.removeAttribute('src'); player.load();
  for (const t of queue) if (t.url.startsWith('blob:')) URL.revokeObjectURL(t.url);
  queue = []; qi = -1; cur = null;
}
function finish() {
  setNow('완료', '오늘 루틴 끝! 수고했어요 👏', '');
  $('cPlay').textContent = '▶';
  cur = null; refreshHome();
}
function onTrackEnded() {
  if (!cur) return;
  const p = dayProg(cur.day); p.last = Date.now();
  if (cur.kind === 'lecture') p.lectured = true;
  if (cur.kind === 'shadow' || cur.kind === 'dialog') p.passes += settings.passes;
  if (cur.kind === 'review') p.reviews += 1;
  progress.lastDay = cur.day; save('eng100.progress', progress);
  if (qi + 1 < queue.length) playTrack(qi + 1);
  else if (building) { player.pause(); waitNext(); }   // 다음 트랙 렌더링이 아직 안 끝난 경우
  else finish();
}
async function waitNext() { const n = qi + 1; while (building && queue.length <= n) await sleep(200); if (queue.length > n) playTrack(n); else finish(); }
player.addEventListener('ended', onTrackEnded);
player.addEventListener('timeupdate', () => updateMark(false));
player.addEventListener('play', () => { $('cPlay').textContent = '⏸'; mediaState('playing'); });
player.addEventListener('pause', () => { $('cPlay').textContent = '▶'; mediaState('paused'); });

function currentMarkIndex() {
  if (!cur) return -1;
  const t = player.currentTime + 0.05; let idx = -1;
  for (let i = 0; i < cur.marks.length; i++) { if (cur.marks[i].t <= t) idx = i; else break; }
  return idx;
}
function updateMark(force) {
  if (!cur) return;
  const idx = currentMarkIndex();
  const dur = cur.dur || player.duration || 0;
  $('npBar').style.width = dur ? (player.currentTime / dur * 100) + '%' : '0%';
  if (idx === markIdx && !force) return;
  markIdx = idx;
  const m = cur.marks[Math.max(0, idx)] || {};
  setNow(m.step || cur.label, m.en || '', m.ko || '');
  mediaMeta(m);
}
function setNow(step, en, ko) { $('npStep').textContent = step; $('npEn').textContent = en; $('npKo').textContent = ko; }

// 문장 이동 (⏮ ⏭ · 블루투스/핸들 버튼)
function seekMark(delta) {
  if (!cur) return;
  if (cur.kind === 'lecture') { player.currentTime = Math.max(0, player.currentTime + (delta > 0 ? 30 : -15)); return; }
  let idx = currentMarkIndex();
  if (delta < 0 && idx >= 0 && player.currentTime - cur.marks[idx].t > 2.0) { /* 같은 문장 처음으로 */ }
  else idx += delta;
  if (idx >= cur.marks.length) { skipTrack(); return; }
  idx = Math.max(0, idx);
  player.currentTime = cur.marks[idx].t; markIdx = -1; updateMark(true);
  if (player.paused) player.play();
}
function skipTrack() { if (!cur) return; if (qi + 1 < queue.length) playTrack(qi + 1); else if (building) waitNext(); else finish(); }
function togglePlay() {
  if (!cur) { runRoutine(); return; }
  if (player.paused) player.play(); else player.pause();
}

// ───────────────────────── Media Session (잠금화면 · 블루투스)
function mediaMeta(m) {
  if (!('mediaSession' in navigator) || !cur) return;
  m ??= cur.marks[Math.max(0, markIdx)] || {};
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: m.en && m.en !== '…' ? m.en : (m.ko || cur.label),
      artist: m.step || cur.label,
      album: '영어회화 100일의 기적',
      artwork: [{ src: 'icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
  } catch {}
}
function mediaState(s) { try { navigator.mediaSession.playbackState = s; } catch {} }
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const H = (a, f) => { try { ms.setActionHandler(a, f); } catch {} };
  H('play', () => player.play()); H('pause', () => player.pause());
  H('previoustrack', () => seekMark(-1)); H('nexttrack', () => seekMark(1));
  H('seekbackward', () => seekMark(-1)); H('seekforward', () => seekMark(1));
  H('stop', () => { player.pause(); });
}

// ───────────────────────── 모드
let day = progress.lastDay || 1;
function routineBuilders(d) {
  const p = dayProg(d);
  const b = [];
  if (settings.lecture === 'always' || (settings.lecture === 'first' && !p.lectured)) b.push(() => buildLecture(d));
  b.push(() => buildShadow(d, false));
  b.push(() => buildReview(d));
  return b;
}
function routineDesc(d) {
  const p = dayProg(d);
  const lec = settings.lecture === 'always' || (settings.lecture === 'first' && !p.lectured);
  return `${lec ? '강의 → ' : ''}쉐도잉 ${settings.passes}회 → 복습 ${settings.reviewCount}문장`;
}
function runRoutine() { startQueue(routineBuilders(day)); }

// ───────────────────────── UI
function setDay(n) {
  day = Math.min(100, Math.max(1, n));
  refreshHome();
}
function refreshHome() {
  $('dayNum').textContent = day;
  const d = dayByNum(day);
  $('dayTitle').textContent = d ? d.title : (DATA ? '' : '자료 없음 — 📦 눌러서 불러오기');
  const p = dayProg(day);
  $('dayStat').textContent = d ? `문장 ${d.units.length}개 · 강의 ${p.lectured ? '✓' : '–'} · 쉐도잉 ${p.passes}회 · 복습 ${p.reviews}회` : '';
  $('routineDesc').textContent = routineDesc(day);
}
$('dayMinus').onclick = () => setDay(day - 1);
$('dayPlus').onclick = () => setDay(day + 1);
$('mRoutine').onclick = runRoutine;
$('mShadow').onclick = () => startQueue([() => buildShadow(day, false)]);
$('mDialog').onclick = () => startQueue([() => buildShadow(day, true)]);
$('mReview').onclick = () => startQueue([() => buildReview(day)]);
$('mLecture').onclick = () => startQueue([() => buildLecture(day)]);
$('cPlay').onclick = togglePlay;
$('cPrev').onclick = () => seekMark(-1);
$('cNext').onclick = () => seekMark(1);
$('npSkip').onclick = () => { if (cur) { skipTrack(); toast('다음 단계로'); } };

// 자료 overlay
function openData() { $('ovData').classList.add('show'); refreshDataStatus(); }
$('btnData').onclick = openData;
$('closeData').onclick = () => $('ovData').classList.remove('show');
$('fileZip').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { await importZip(f); toast('자료 불러오기 완료'); }
  catch (err) { console.error(err); $('impMsg').textContent = '오류: ' + err.message; }
  e.target.value = '';
};
// 개발용: ?dev 로 열면 로컬 서버의 /dist/pack.zip 을 바로 가져오는 버튼 표시
if (location.search.includes('dev')) {
  const b = document.createElement('button'); b.className = 'big'; b.textContent = '(dev) /dist/pack.zip 가져오기';
  b.onclick = async () => { const r = await fetch('/dist/pack.zip'); await importZip({ stream: () => r.body, size: +r.headers.get('content-length') || 1 }); toast('dev import 완료'); };
  $('btnClearData').before(b);
}
$('btnClearData').onclick = async () => { if (!confirm('저장된 음원과 문장을 모두 지울까요?')) return; stopAll(); await idbClear(); DATA = null; bufCache.clear(); refreshHome(); refreshDataStatus(); };

// 설정 overlay
function renderSettings() {
  document.querySelectorAll('#ovSettings .seg').forEach(seg => {
    const key = seg.dataset.key, vals = seg.dataset.vals.split(',');
    seg.innerHTML = '';
    for (const v of vals) {
      const b = document.createElement('button'); b.textContent = v === 'first' ? '처음만' : v === 'always' ? '항상' : v === 'never' ? '안 함' : v;
      const val = isNaN(+v) ? v : +v;
      if (settings[key] === val) b.classList.add('on');
      b.onclick = () => { settings[key] = val; save('eng100.settings', settings); renderSettings(); refreshHome(); };
      seg.appendChild(b);
    }
  });
}
$('btnSettings').onclick = () => { renderSettings(); $('ovSettings').classList.add('show'); };
$('closeSettings').onclick = () => $('ovSettings').classList.remove('show');
$('btnResetProgress').onclick = () => { if (!confirm('진도를 초기화할까요?')) return; progress.days = {}; progress.lastDay = 1; save('eng100.progress', progress); setDay(1); };

let toastT;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2500); }

// 키보드(PC 테스트용): ← → 문장 이동, space 재생
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowRight') seekMark(1); else if (e.key === 'ArrowLeft') seekMark(-1); else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
});

// ───────────────────────── 시작
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
loadData().then(has => { refreshHome(); if (!has) openData(); });
