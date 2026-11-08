import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const ROOT = resolve(import.meta.dirname);
const APP = resolve(ROOT, 'src/legacy/app.js');
const BRIDGE = resolve(ROOT, 'src/legacy/bridge.js');
const PIANO_KEYS = [21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81, 84, 87, 90, 93, 96, 99, 102, 105, 108];

const pianoSource = `import { fetchPianoAudio, nearestPianoKey } from '../domain/audio.ts';
// The recordings are separate files so the browser can cache and retry each sample independently.
const PIANO_KEYS=[${PIANO_KEYS.join(',')}];
const PIANO_URLS={${PIANO_KEYS.map(key => `${key}:new URL('../assets/piano/${key}.mp3',import.meta.url).href`).join(',')}};
const pianoBank={ctx:null,buffers:new Map(),pending:new Map(),raw:null,keys:null,promise:null,status:'idle',idle:0};
const PIANO_WARM=[48,84];
function pianoStatus(){
  const message=t(pianoBank.status==='ready'?'piano_ready':pianoBank.status==='error'?'piano_error':'piano_loading');
  const global=$('piano-global-status'); if(global) global.textContent=message;
  const dock=$('piano-status'); if(dock){dock.hidden=pianoBank.status==='ready';dock.textContent=message;}
}
function pianoKeys(){ return PIANO_KEYS; }
function pianoNearest(midi){ return nearestPianoKey(midi,pianoKeys()); }
function pianoFail(err){ pianoBank.promise=null; pianoBank.status='idle'; pianoStatus(); console.error('Piano recordings could not be decoded',err); }
function pianoDecode(key){
  const ctx=actx;
  if(pianoBank.ctx!==ctx){ pianoBank.ctx=ctx; pianoBank.buffers=new Map(); pianoBank.pending=new Map(); pianoBank.promise=null; }
  if(pianoBank.buffers.has(key)) return Promise.resolve(pianoBank.buffers.get(key));
  if(pianoBank.pending.has(key)) return pianoBank.pending.get(key);
  const url=PIANO_URLS[key]; if(!url) return Promise.reject(new Error('No piano recording for '+key));
  const job=fetchPianoAudio(url,ctx).then(audio=>{
      if(pianoBank.ctx===ctx) pianoBank.buffers.set(key,audio);
      return audio;
    }).finally(()=>{ if(pianoBank.ctx===ctx) pianoBank.pending.delete(key); });
  pianoBank.pending.set(key,job); return job;
}
function pianoEnsure(midis){
  if(!actx) return Promise.resolve(false);
  const ctx=actx;
  pianoKeys(); const keys=[...new Set(midis.map(pianoNearest))];
  return Promise.all(keys.map(pianoDecode)).then(()=>true,err=>{ if(ctx===actx&&pianoBank.ctx===ctx) pianoFail(err); return false; });
}
function pianoIdleWarm(){
  const ctx=actx, keys=pianoKeys().filter(k=>!pianoBank.buffers.has(k)).sort((a,b)=>Math.abs(a-66)-Math.abs(b-66));
  const step=()=>{ if(ctx!==actx||pianoBank.status==='error') return; const k=keys.shift(); if(k==null) return;
    pianoDecode(k).then(()=>schedule(),err=>{ if(ctx===actx&&pianoBank.ctx===ctx) pianoFail(err); }); };
  const schedule=()=>{ if(window.requestIdleCallback) pianoBank.idle=requestIdleCallback(step,{timeout:4000}); else pianoBank.idle=setTimeout(step,120); };
  schedule();
}
function preparePiano(){
  if(!actx) return Promise.resolve(false);
  if(pianoBank.ctx===actx&&pianoBank.promise) return pianoBank.promise;
  const ctx=actx; pianoBank.ctx=ctx; pianoBank.buffers=new Map(); pianoBank.pending=new Map(); pianoBank.status='loading'; pianoStatus();
  const warm=pianoKeys().filter(k=>k>=PIANO_WARM[0]&&k<=PIANO_WARM[1]);
  pianoBank.promise=pianoEnsure(warm).then(ok=>{
    if(pianoBank.ctx!==ctx) return false;
    if(ok){ pianoBank.status='ready'; pianoStatus(); pianoIdleWarm(); }
    else { pianoBank.promise=null; pianoBank.status='idle'; pianoStatus(); }
    return ok;
  });
  return pianoBank.promise;
}
`;

function migrationPlugin() {
  const bridge = readFileSync(BRIDGE, 'utf8');
  return {
    name: 'etude-migration-runtime',
    enforce: 'pre',
    transformIndexHtml(html) {
      const osmd = '<script defer src="./vendor/osmd-1.9.9.min.js"></script>';
      return html.replace(osmd, '').replace('<head>', `<head>\n${osmd}`);
    },
    transform(source, id) {
      if (resolve(id) !== APP) return null;
      const start = source.indexOf('// Salamander Grand Piano v3 recordings');
      const end = source.indexOf('function sampledPianoVoice', start);
      if (start < 0 || end < 0) throw new Error('Cannot locate piano block in app.js');
      const transformed = `${bridge}${source.slice(0, start)}${pianoSource}${source.slice(end)}\nwindow.__etudeBooted?.();\n`;
      return { code: transformed, map: null };
    },
  };
}

export default defineConfig({
  base: './',
  publicDir: 'public',
  plugins: [migrationPlugin()],
  build: {
    outDir: 'dist/etude',
    emptyOutDir: true,
    rollupOptions: { input: resolve(ROOT, 'etude.html') },
  },
});
