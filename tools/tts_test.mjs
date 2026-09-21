import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import fs from 'fs';
const tts = new MsEdgeTTS();
await tts.setMetadata('ko-KR-SunHiNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
const { audioStream } = tts.toStream('이게 대체 누구야?');
const chunks=[]; for await (const c of audioStream) chunks.push(c);
fs.writeFileSync('out/tts_test.mp3', Buffer.concat(chunks));
console.log('bytes', Buffer.concat(chunks).length);
