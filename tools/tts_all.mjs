import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import fs from 'fs';
const items = JSON.parse(fs.readFileSync('out/lt.json','utf8'));
fs.mkdirSync('out/ko', {recursive:true});
let tts = new MsEdgeTTS();
await tts.setMetadata('ko-KR-SunHiNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
let n=0;
for (const it of items) {
  const f = `out/ko/D${String(it.day).padStart(3,'0')}_${(it.item-1)%3+1}.mp3`;
  if (fs.existsSync(f) && fs.statSync(f).size>2000) continue;
  for (let tries=0; tries<3; tries++) {
    try {
      const { audioStream } = tts.toStream(it.ko);
      const chunks=[]; for await (const c of audioStream) chunks.push(c);
      const buf = Buffer.concat(chunks); if (buf.length<2000) throw new Error('short');
      fs.writeFileSync(f, buf); n++; break;
    } catch (e) { console.log('retry', f, e.message); tts = new MsEdgeTTS(); await tts.setMetadata('ko-KR-SunHiNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3); }
  }
}
console.log('done', n, 'generated');
