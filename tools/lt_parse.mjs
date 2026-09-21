// Parse Listening Training PDF text -> out/lt.json  [{lt, item, day, en, ko}]
import fs from 'fs';
const txt = fs.readFileSync('out/lt.txt','utf8');
const pages = txt.split(/LT_day(\d+)/).slice(1); // [num, body, num, body...]
const out = [];
for (let p=0; p<pages.length; p+=2) {
  const lt = +pages[p], body = pages[p+1];
  const lines = body.split(/\r?\n/).map(l=>l.replace(/\s+$/,''));
  const items = [];
  for (let i=0;i<lines.length;i++) {
    const m = lines[i].match(/^(\d{1,2})\. \t(.*)$/);
    if (!m) continue;
    const n = +m[1]; if (n !== items.length+1) continue;
    const parts = m[2].split('\t');
    const pre = parts.length>1 ? parts[0] : '';
    const post = parts.length>1 ? parts.slice(1).join(' ') : parts[0];
    items.push({ n, pre, post, ko: lines[i+1].trim() });
    if (items.length===15) break;
  }
  // answer lines follow the last item
  const ansText = lines.join('\n').split(/\n15\. \t.*\n.*\n/)[1] || '';
  const ans = {}; for (const m of ansText.matchAll(/(\d{1,2})\.\s+([^\t\n\d]+?)(?=\s+\d{1,2}\.|\t|\n|$)/g)) ans[+m[1]] = m[2].trim();
  for (const it of items) {
    const a = ans[it.n] ?? '???';
    let en = (it.pre + (it.pre && !it.pre.endsWith(' ') ? ' ' : '') + a + ' ' + it.post).replace(/\s+/g,' ').replace(/\s+([,.?!])/g,'$1').trim();
    en = en.replace(/[’‘]/g,"'").replace(/[“”]/g,'"');
    out.push({ lt, item: it.n, day: (lt-1)*5 + Math.ceil(it.n/3), en, ko: it.ko, answer: a });
  }
}
// publisher PDF typos (wrong Korean line) - manual fixes
const FIX = { '60:1':'한동안 안 보이더라.', '60:2':'마치 맨땅에 헤딩하는 기분이야.', '68:1':'그녀는 비밀을 못 지켜.' };
for (const x of out) { const k = x.day+':'+((x.item-1)%3+1); if (FIX[k]) x.ko = FIX[k]; }
fs.writeFileSync('out/lt.json', JSON.stringify(out, null, 1));
console.log(out.length, 'sentences;', out.filter(x=>x.answer==='???').length, 'missing answers');
for (const x of out.slice(0,6)) console.log(x.day, '|', x.en, '|', x.ko);
for (const x of out.filter(x=>x.lt===20).slice(-3)) console.log(x.day, '|', x.en, '|', x.ko);
