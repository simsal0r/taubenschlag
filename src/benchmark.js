export const BENCHMARK=Object.freeze({version:1,routeVersion:1,warmupMs:5000,durationMs:30000});
export const SECTIONS=['Skyline flyby','Station & river','Boost, flares & cockpit'];
export const sectionAt=seconds=>Math.min(2,Math.floor(Math.max(0,seconds)/10));
const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
export function distribution(values){
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  const percentile=p=>sorted.length?sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]:null;
  return {samples:sorted.length,mean:mean(sorted),p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:sorted.at(-1)??null};
}
export function summarizeFrames(frames){
  const times=frames.map(f=>f.frameMs),durationMs=times.reduce((a,b)=>a+b,0);
  const slowest=[...times].sort((a,b)=>b-a).slice(0,Math.ceil(times.length*.01));
  return {
    frames:frames.length,durationMs,averageFps:durationMs>0?frames.length*1000/durationMs:null,
    low1PercentFps:slowest.length?1000/mean(slowest):null,
    frameMs:distribution(times),jsMs:distribution(frames.map(f=>f.jsMs)),gpuMs:distribution(frames.map(f=>f.gpuMs)),
    over33ms:times.filter(t=>t>1000/30).length,over50ms:times.filter(t=>t>50).length,
    drawCalls:distribution(frames.map(f=>f.calls)),triangles:distribution(frames.map(f=>f.triangles)),
  };
}

/** Pair each rendered frame with the following rAF interval, including stalls.
 * The last complete interval may extend the nominal 30 seconds by one frame. */
export class BenchmarkRun {
  constructor(config){
    this.config=config;this.phase='warmup';this.frames=[];this.warmStart=null;this.startedAt=null;
    this.pending=null;this.elapsedMs=0;this.result=null;this.createdAt=new Date().toISOString();
  }
  begin(now){
    if(this.warmStart===null)this.warmStart=now;
    if(this.phase==='warmup'){
      this.elapsedMs=Math.max(0,now-this.warmStart);
      if(this.elapsedMs<BENCHMARK.warmupMs)return {seconds:this.elapsedMs/BENCHMARK.warmupMs*30,reset:false};
      this.phase='measuring';this.startedAt=now;this.elapsedMs=0;
      return {seconds:0,reset:true};
    }
    if(this.phase==='measuring'){
      if(this.pending){
        const frameMs=now-this.pending.timestamp;
        if(frameMs>0){this.pending.sample.frameMs=frameMs;this.frames.push(this.pending.sample)}
        this.pending=null;
      }
      this.elapsedMs=Math.max(0,now-this.startedAt);
      if(this.elapsedMs>=BENCHMARK.durationMs){this.phase='settling';this.settleStart=now}
    }
    return {seconds:Math.min(30,this.elapsedMs/1000),reset:false};
  }
  rendered(now,sample){
    if(this.phase==='measuring')this.pending={timestamp:now,sample};
  }
  finish(gpu){
    this.phase='complete';
    this.result={
      schemaVersion:BENCHMARK.version,routeVersion:BENCHMARK.routeVersion,createdAt:this.createdAt,
      config:this.config,warmupMs:BENCHMARK.warmupMs,targetDurationMs:BENCHMARK.durationMs,
      summary:summarizeFrames(this.frames),
      sections:SECTIONS.map((name,i)=>({name,...summarizeFrames(this.frames.filter(f=>f.section===i))})),
      gpu,frames:this.frames,
      definitions:{
        averageFps:'Rendered frames / total observed rAF interval seconds. Display refresh and browser scheduling can limit this.',
        low1PercentFps:'1000 / mean of the slowest ceil(frame count × 0.01) frame intervals in milliseconds.',
        frameMs:'Time between successive requestAnimationFrame callbacks; includes presentation pacing, not just rendering.',
        jsMs:'Elapsed JavaScript update + render submission time; not CPU utilization. Does not wait for the GPU or include browser compositing.',
        gpuMs:'Asynchronous WebGL elapsed query around all scene, shadow and cockpit render passes. Null when unavailable; excludes browser compositing.',
        workload:'Scripted VTOL render route, neutral AI and fixed flare events. Pilot physics, combat and city loading are excluded.',
        memory:'Geometry and texture counts are renderer resources, not bytes of VRAM. Optional JS heap is a browser estimate.',
      },
    };
    return this.result;
  }
}

// Compare render conditions, but deliberately not the build ID: this is useful
// across optimizations. Keep that ID in the report to identify what was tested.
export function comparisonKey(config){
  // These depth implementations provide the same visual precision. Switching
  // backend is an optimization to compare, rather than a quality setting.
  const {build,logarithmicDepth,reversedDepth,...conditions}=config;
  return JSON.stringify(conditions);
}
export function loadBaseline(config,storage){
  try{
    storage??=globalThis.localStorage;
    const value=JSON.parse(storage.getItem(`little-wings-benchmark-${config.map}`)||'null');
    return value?.schemaVersion===BENCHMARK.version&&value.routeVersion===BENCHMARK.routeVersion
      &&value.summary?.averageFps>0&&comparisonKey(value.config)===comparisonKey(config)?value:null;
  }catch{return null}
}
export function saveBaseline(result,storage){
  try{
    storage??=globalThis.localStorage;
    const {frames,...compact}=result;
    storage.setItem(`little-wings-benchmark-${result.config.map}`,JSON.stringify(compact));return true;
  }catch{return false}
}
