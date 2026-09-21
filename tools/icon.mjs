// pure-node PNG icon: dark rounded square + green circle + "100" drawn with simple digit strokes
import fs from 'fs'; import zlib from 'zlib';
function png(w, h, rgba) {
  const crcT = []; for (let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;crcT[n]=c>>>0;}
  const crc = b => { let c=0xFFFFFFFF; for (const x of b) c = crcT[(c^x)&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; };
  const chunk = (t, d) => { const l=Buffer.alloc(4); l.writeUInt32BE(d.length); const td=Buffer.concat([Buffer.from(t), d]); const c=Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w*4+1)*h); for (let y=0;y<h;y++){ raw[y*(w*4+1)]=0; rgba.copy(raw, y*(w*4+1)+1, y*w*4, (y+1)*w*4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4); ihdr[8]=8; ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// 7-seg style digits
const SEG = { '1':[0,1,1,0,0,0,0], '0':[1,1,1,1,1,1,0] }; // a b c d e f g
function draw(size) {
  const px = Buffer.alloc(size*size*4); const s=size;
  const set=(x,y,r,g,b)=>{ if(x<0||y<0||x>=s||y>=s)return; const i=(y*s+x)*4; px[i]=r;px[i+1]=g;px[i+2]=b;px[i+3]=255; };
  const R=s*0.22;
  for (let y=0;y<s;y++) for (let x=0;x<s;x++) {
    const dx=Math.max(R-x, x-(s-1-R), 0), dy=Math.max(R-y, y-(s-1-R), 0);
    if (dx*dx+dy*dy <= R*R) set(x,y,16,20,24);
    else { const i=(y*s+x)*4; px[i+3]=0; }
  }
  const cx=s/2, cy=s/2, cr=s*0.33;
  for (let y=0;y<s;y++) for (let x=0;x<s;x++) if ((x-cx)**2+(y-cy)**2 <= cr*cr) set(x,y,79,209,160);
  // digits "100": each digit box w=0.12s h=0.26s, thickness 0.035s
  const dw=s*0.12, dh=s*0.26, th=s*0.035, gap=s*0.05; const total=3*dw+2*gap; let x0=cx-total/2, y0=cy-dh/2;
  const rect=(x,y,w,h)=>{ for(let yy=Math.round(y);yy<y+h;yy++) for(let xx=Math.round(x);xx<x+w;xx++) set(xx,yy,6,43,30); };
  for (const ch of '100') {
    const sg=SEG[ch];
    if (sg[0]) rect(x0, y0, dw, th);                 // a top
    if (sg[1]) rect(x0+dw-th, y0, th, dh/2);          // b top-right
    if (sg[2]) rect(x0+dw-th, y0+dh/2, th, dh/2);     // c bottom-right
    if (sg[3]) rect(x0, y0+dh-th, dw, th);            // d bottom
    if (sg[4]) rect(x0, y0+dh/2, th, dh/2);           // e bottom-left
    if (sg[5]) rect(x0, y0, th, dh/2);                // f top-left
    x0 += dw+gap;
  }
  return px;
}
for (const sz of [192, 512]) fs.writeFileSync(`../docs/icon-${sz}.png`, png(sz, sz, draw(sz)));
console.log('icons ok');
