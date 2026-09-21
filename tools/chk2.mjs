import { decode16k, speechRegions } from './seg.mjs';
const pcm = await decode16k('../raw/부가자료/부가자료(3쇄~)/리스닝MP3(3쇄~)/LT_day09.mp3');
console.log(speechRegions(pcm, 16000, { minSil: 0.45, minSpeech: 0.3 }).filter(r=>r.start>4 && r.start<20));
console.log(speechRegions(pcm, 16000, { minSil: 0.2, minSpeech: 0.2 }).filter(r=>r.start>10 && r.start<20));
