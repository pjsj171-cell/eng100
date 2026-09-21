import fs from 'fs';
import { MPEGDecoder } from 'mpg123-decoder';
import { pipeline } from '@huggingface/transformers';

const file = process.argv[2];
const model = process.argv[3] || 'onnx-community/whisper-base';
const t0 = Date.now();
const dec = new MPEGDecoder(); await dec.ready;
const { channelData, sampleRate } = dec.decode(new Uint8Array(fs.readFileSync(file)));
dec.free();
// mono + resample to 16k
let mono = channelData.length > 1 ? channelData[0].map((v,i)=> (v+channelData[1][i])/2) : channelData[0];
const ratio = sampleRate/16000; const n = Math.floor(mono.length/ratio);
const out = new Float32Array(n); for (let i=0;i<n;i++) out[i] = mono[Math.floor(i*ratio)];
console.error('decoded', sampleRate, '->16k', (n/16000).toFixed(1),'s', Date.now()-t0,'ms');
const asr = await pipeline('automatic-speech-recognition', model, { dtype: 'fp32' });
console.error('model loaded', Date.now()-t0,'ms');
const r = await asr(out, { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5, language: 'en', task: 'transcribe' });
console.error('done', Date.now()-t0,'ms');
console.log(JSON.stringify(r, null, 1));
