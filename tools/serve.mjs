// 로컬 테스트 서버: app/ 을 http://localhost:8080 으로, dist/ 를 /dist/ 로
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = path.resolve('docs'), DIST = path.resolve('dist');
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.mp3':'audio/mpeg', '.zip':'application/zip', '.css':'text/css' };
http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html';
  const f = u.startsWith('/dist/') ? path.join(DIST, u.slice(6)) : path.join(ROOT, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  const st = fs.statSync(f); const type = MIME[path.extname(f)] || 'application/octet-stream';
  const range = req.headers.range;
  if (range) { const [a,b] = range.replace('bytes=','').split('-'); const s=+a, e=b?+b:st.size-1; res.writeHead(206, {'Content-Type':type,'Content-Range':`bytes ${s}-${e}/${st.size}`,'Accept-Ranges':'bytes','Content-Length':e-s+1}); fs.createReadStream(f,{start:s,end:e}).pipe(res); return; }
  res.writeHead(200, {'Content-Type':type,'Content-Length':st.size,'Accept-Ranges':'bytes','Cache-Control':'no-store'}); fs.createReadStream(f).pipe(res);
}).listen(8080, () => console.log('http://localhost:8080'));
