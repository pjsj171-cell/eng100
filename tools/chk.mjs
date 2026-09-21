import { decode16k, speechRegions } from './seg.mjs';
const p = await decode16k(process.argv[2]); console.log('dur', (p.length/16000).toFixed(2), 's', speechRegions(p));
