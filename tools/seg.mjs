// STT + sentence unitization. Usage: node seg.mjs <mp3> [model]
import fs from 'fs';
import { MPEGDecoder } from 'mpg123-decoder';
import { pipeline } from '@huggingface/transformers';

export async function decode16k(file) {
  const dec = new MPEGDecoder(); await dec.ready;
  const { channelData, sampleRate } = dec.decode(new Uint8Array(fs.readFileSync(file)));
  dec.free();
  const mono = channelData.length > 1 ? channelData[0].map((v,i)=>(v+channelData[1][i])/2) : channelData[0];
  const ratio = sampleRate/16000, n = Math.floor(mono.length/ratio);
  const out = new Float32Array(n); for (let i=0;i<n;i++) out[i] = mono[Math.floor(i*ratio)];
  return out;
}

// speech regions [{start,end}] by RMS threshold
export function speechRegions(pcm, sr=16000, {win=0.02, thDb=-38, minSil=0.15, minSpeech=0.15}={}) {
  const w = Math.floor(sr*win); const frames = Math.floor(pcm.length/w);
  const db = new Float32Array(frames);
  for (let f=0; f<frames; f++) { let s=0; for (let i=f*w;i<(f+1)*w;i++) s+=pcm[i]*pcm[i]; db[f] = 10*Math.log10(s/w + 1e-12); }
  const regs = []; let inSp=false, st=0, silRun=0;
  for (let f=0; f<frames; f++) {
    const loud = db[f] > thDb;
    if (!inSp && loud) { inSp=true; st=f; silRun=0; }
    else if (inSp) { if (loud) silRun=0; else { silRun++; if (silRun*win >= minSil) { regs.push([st, f-silRun]); inSp=false; } } }
  }
  if (inSp) regs.push([st, frames]);
  return regs.map(([a,b])=>({start:a*win, end:b*win})).filter(r=>r.end-r.start>=minSpeech);
}

let asr, asrName;
export async function words(pcm, model='onnx-community/whisper-base.en_timestamped') {
  if (asrName !== model) { asr = await pipeline('automatic-speech-recognition', model, { dtype: 'fp32' }); asrName = model; }
  const r = await asr(pcm, { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 });
  const ws = [];
  for (const c of r.chunks) {
    const w = { t0:c.timestamp[0], t1:c.timestamp[1] ?? c.timestamp[0]+0.3, w:c.text.trim() };
    const p = ws[ws.length-1];
    if (p && p.w.toLowerCase()===w.w.toLowerCase() && Math.abs(p.t0-w.t0)<0.35) continue; // chunk-overlap duplicate
    ws.push(w);
  }
  return ws;
}

// sentences from word stream; snap edges to speech regions
export function unitize(ws, regs, dur) {
  const sents = []; let cur = [];
  for (const w of ws) { cur.push(w); if (/[.?!]["']?$/.test(w.w)) { sents.push(cur); cur=[]; } }
  if (cur.length) sents.push(cur);
  const units = sents.map(s => {
    let start = s[0].t0, end = s[s.length-1].t1;
    // snap start back to region start if within 0.5s, end forward to region end if within 0.5s
    for (const r of regs) { if (r.start<=start+0.05 && start-r.start<0.5) { start=r.start; } }
    for (const r of regs) { if (r.end>=end-0.05 && r.end-end<0.5) { end=r.end; break; } }
    return { start, end, text: s.map(x=>x.w).join(' ').replace(/\s+([,.?!])/g,'$1') };
  });
  // fix overlaps, add small pad
  for (const u of units) { u.start = Math.max(0, u.start-0.10); u.end = Math.min(dur, u.end+0.15); }
  for (let i=0;i<units.length-1;i++) if (units[i].end > units[i+1].start) units[i].end = units[i+1].start;
  // merge very short units into the next if the gap is tiny (e.g. "Really?" + "You have changed a lot.")
  const merged = [];
  for (const u of units) {
    const p = merged[merged.length-1];
    if (p && (p.end-p.start)<0.9 && (u.start-p.end)<0.3 && !/^\d+\.?$/.test(p.text) && !/^day\b/i.test(p.text)) { p.end=u.end; p.text += ' '+u.text; }
    else merged.push({...u});
  }
  return merged.map(u=>({start:+u.start.toFixed(2), end:+u.end.toFixed(2), text:u.text}));
}

export async function segment(file, model) {
  const pcm = await decode16k(file);
  const dur = pcm.length/16000;
  return unitize(await words(pcm, model), speechRegions(pcm), dur);
}

if (process.argv[1]?.endsWith('seg.mjs')) {
  console.log(JSON.stringify(await segment(process.argv[2], process.argv[3]), null, 1));
}
