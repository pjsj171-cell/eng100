// out/stt/*.json + out/lt.json + out/ko/*.mp3 + raw mp3 → ../dist/days.json + ../dist/pack.zip
import fs from 'fs'; import path from 'path'; import zlib from 'zlib';
const RAW = '../raw/', DIST = '../dist/';
fs.mkdirSync(DIST, { recursive: true });
const p3 = n => String(n).padStart(3,'0'), p2 = n => String(n).padStart(2,'0');
const warn = [];

// ── DAY units
function dayUnits(n) {
  let u = JSON.parse(fs.readFileSync(`out/stt/DAY${p3(n)}.json`,'utf8'));
  // drop "Day N" announcement pieces at the start
  while (u.length && /^(day\b.*|\d+\.?|day)$/i.test(u[0].text.trim())) u.shift();
  const title = u.shift()?.text ?? '';
  const mi = u.findIndex(x => /m[ai]n[iy]\s*dialog/i.test(x.text));
  if (mi < 0) warn.push(`DAY${p3(n)}: mini-dialogue marker not found`);
  const units = [];
  u.forEach((x, i) => {
    if (i === mi) return;
    const txt = x.text.trim();
    if (mi >= 0 && i < mi && i >= mi-2 && txt.length < 5) return;   // jingle garbage before marker
    if (!/[a-z]/i.test(txt)) return;
    units.push({ s: x.start, e: x.end, t: txt, k: (mi < 0 || i < mi) ? 'x' : 'd' });
  });
  return { title, units };
}

// ── LT sentence timings: group by gaps ≥1.6s, drop number announcements
function ltTimes(n) {
  const u = JSON.parse(fs.readFileSync(`out/stt/LT_day${p2(n)}.json`,'utf8'));
  const groups = []; let g = [];
  for (let i = 0; i < u.length; i++) {
    if (g.length && u[i].start - g[g.length-1].end >= 1.6) { groups.push(g); g = []; }
    g.push(u[i]);
  }
  if (g.length) groups.push(g);
  const sents = groups.map(gr => gr.filter(x => !/^\d+\.?( \d+\.?)?$/.test(x.text.trim()) && /[a-z]/i.test(x.text)))
                      .filter(gr => gr.length)
                      .map(gr => ({ s: gr[0].start, e: gr[gr.length-1].end, t: gr.map(x=>x.text).join(' ') }));
  if (sents.length !== 15) warn.push(`LT_day${p2(n)}: ${sents.length} sentences (expected 15)`);
  return sents;
}

const lt = JSON.parse(fs.readFileSync('out/lt.json','utf8'));
const ltT = {}; for (let n=1;n<=20;n++) ltT[n] = ltTimes(n);

const days = [];
for (let n=1;n<=100;n++) {
  const { title, units } = dayUnits(n);
  const review = lt.filter(x => x.day === n).map(x => {
    const tm = ltT[x.lt][x.item-1];
    if (!tm) { warn.push(`LT_day${p2(x.lt)} item ${x.item}: no timing`); return null; }
    return { en: x.en, ko: x.ko, audio: `audio/lt/LT${p2(x.lt)}.mp3`, s: tm.s, e: tm.e, koAudio: `audio/ko/D${p3(n)}_${(x.item-1)%3+1}.mp3`, stt: tm.t };
  }).filter(Boolean);
  days.push({ day: n, title, audio: `audio/day/DAY${p3(n)}.mp3`, lecture: `audio/lec/L${p3(n)}.mp3`, units, review });
}
const data = { version: new Date().toISOString().slice(0,10), days };
fs.writeFileSync(DIST + 'days.json', JSON.stringify(data));
fs.writeFileSync('out/days_pretty.json', JSON.stringify(data, null, 1));
console.log('days.json:', days.length, 'days,', days.reduce((a,d)=>a+d.units.length,0), 'units,', days.reduce((a,d)=>a+d.review.length,0), 'review');
for (const w of warn) console.log('WARN', w);

// ── STORE zip writer (streaming to disk)
const crcT = []; for (let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;crcT[n]=c>>>0;}
const crc32 = b => { let c=0xFFFFFFFF; for (let i=0;i<b.length;i++) c = crcT[(c^b[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; };
const entries = [
  ['days.json', Buffer.from(JSON.stringify(data))],
  ...Array.from({length:100},(_,i)=>[`audio/day/DAY${p3(i+1)}.mp3`, RAW+`MP3_1983_128/영어회화 100일의 기적(최종 MP3)/DAY${p3(i+1)}.mp3`]),
  ...Array.from({length:100},(_,i)=>[`audio/lec/L${p3(i+1)}.mp3`, RAW+`영어회화100일의기적_저자해설강의/New_Lecture${p2(i+1)}.mp3`]),
  ...Array.from({length:20},(_,i)=>[`audio/lt/LT${p2(i+1)}.mp3`, RAW+`부가자료/부가자료(3쇄~)/리스닝MP3(3쇄~)/LT_day${p2(i+1)}.mp3`]),
  ...fs.readdirSync('out/ko').filter(f=>f.endsWith('.mp3')).map(f=>[`audio/ko/${f}`, `out/ko/${f}`]),
];
const fd = fs.openSync(DIST + 'pack.zip', 'w'); let off = 0; const cd = [];
const w32 = (b,o,v)=>b.writeUInt32LE(v>>>0,o), w16=(b,o,v)=>b.writeUInt16LE(v,o);
for (const [name, src] of entries) {
  const data = Buffer.isBuffer(src) ? src : fs.readFileSync(src);
  const nm = Buffer.from(name, 'utf8'), crc = crc32(data);
  const lh = Buffer.alloc(30); w32(lh,0,0x04034b50); w16(lh,4,20); w16(lh,6,0x0800); w16(lh,8,0); w16(lh,10,0); w16(lh,12,0x21); w32(lh,16,crc); w32(lh,20,data.length); w32(lh,24,data.length); w16(lh,26,nm.length); w16(lh,28,0);
  fs.writeSync(fd, lh); fs.writeSync(fd, nm); fs.writeSync(fd, data);
  const ch = Buffer.alloc(46); w32(ch,0,0x02014b50); w16(ch,4,20); w16(ch,6,20); w16(ch,8,0x0800); w16(ch,10,0); w16(ch,12,0); w16(ch,14,0x21); w32(ch,16,crc); w32(ch,20,data.length); w32(ch,24,data.length); w16(ch,28,nm.length); w16(ch,30,0); w16(ch,32,0); w16(ch,34,0); w16(ch,36,0); w32(ch,38,0); w32(ch,42,off);
  cd.push(Buffer.concat([ch, nm]));
  off += 30 + nm.length + data.length;
}
const cdStart = off; let cdLen = 0;
for (const c of cd) { fs.writeSync(fd, c); cdLen += c.length; }
const eo = Buffer.alloc(22); w32(eo,0,0x06054b50); w16(eo,4,0); w16(eo,6,0); w16(eo,8,cd.length); w16(eo,10,cd.length); w32(eo,12,cdLen); w32(eo,16,cdStart); w16(eo,20,0);
fs.writeSync(fd, eo); fs.closeSync(fd);
console.log('pack.zip:', entries.length, 'files,', (fs.statSync(DIST+'pack.zip').size/1e6).toFixed(0), 'MB');
