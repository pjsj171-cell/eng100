import fs from 'fs';
import { segment } from './seg.mjs';
const RAW = '../raw/';
const jobs = [];
for (let d=1; d<=100; d++) jobs.push([`DAY${String(d).padStart(3,'0')}`, RAW+`MP3_1983_128/영어회화 100일의 기적(최종 MP3)/DAY${String(d).padStart(3,'0')}.mp3`]);
for (let d=1; d<=20; d++) jobs.push([`LT_day${String(d).padStart(2,'0')}`, RAW+`부가자료/부가자료(3쇄~)/리스닝MP3(3쇄~)/LT_day${String(d).padStart(2,'0')}.mp3`]);
fs.mkdirSync('out/stt', {recursive:true});
for (const [name, file] of jobs) {
  const outf = `out/stt/${name}.json`;
  if (fs.existsSync(outf)) continue;
  const t=Date.now();
  const u = await segment(file);
  fs.writeFileSync(outf, JSON.stringify(u, null, 1));
  console.log(name, u.length, 'units', ((Date.now()-t)/1000).toFixed(0)+'s');
}
console.log('ALL DONE');
