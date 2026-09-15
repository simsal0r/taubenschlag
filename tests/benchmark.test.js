import test from 'node:test';
import assert from 'node:assert/strict';
import {BenchmarkRun,BENCHMARK,summarizeFrames,distribution,loadBaseline,saveBaseline} from '../src/benchmark.js';
import {BenchmarkGPU} from '../src/benchmark-gpu.js';
import {BenchmarkFlight} from '../src/benchmark-flight.js';
import {BenchmarkUI} from '../src/benchmark-ui.js';

test('FPS uses elapsed time; percentile and 1% low expose a stall instead of averaging instantaneous FPS',()=>{
  const frames=Array.from({length:100},(_,i)=>({frameMs:i===99?100:10,jsMs:3,gpuMs:null,calls:12,triangles:42}));
  const s=summarizeFrames(frames);
  assert.equal(s.averageFps,100000/1090);assert.equal(s.low1PercentFps,10);
  assert.equal(s.frameMs.p95,10);assert.equal(s.frameMs.max,100);
  assert.equal(s.over33ms,1);assert.equal(s.over50ms,1);assert.equal(s.gpuMs.samples,0);assert.equal(s.gpuMs.mean,null);
  assert.equal(distribution([]).p95,null);
});
test('5s warm-up is excluded, a full 30s flight includes its final stall, and GPU results can arrive later',()=>{
  const run=new BenchmarkRun({map:'berlin'});
  run.begin(500);run.rendered(500,{jsMs:999});
  assert.equal(run.begin(5499).reset,false);assert.equal(run.phase,'warmup');
  assert.equal(run.begin(5500).reset,true);assert.equal(run.phase,'measuring');
  const first={t:0,section:0,gpuMs:null,jsMs:1,calls:10,triangles:20};
  run.rendered(5500,first);run.begin(5520);first.gpuMs=4;
  let now=5520;
  while(now<35500){
    run.rendered(now,{t:(now-5500)/1000,section:Math.min(2,Math.floor((now-5500)/10000)),gpuMs:null,jsMs:2,calls:10,triangles:20});
    now+=now>35400?150:20;run.begin(now);
  }
  assert.equal(run.phase,'settling');
  const result=run.finish({supported:false});
  assert.equal(result.summary.durationMs,now-5500);assert.ok(result.summary.durationMs>=BENCHMARK.durationMs);
  assert.equal(result.summary.frameMs.max,150);assert.equal(result.summary.gpuMs.mean,4);
  assert.equal(result.summary.jsMs.max,2);assert.equal(result.frames[0].frameMs,20);
  assert.equal(result.sections.reduce((n,s)=>n+s.frames,0),result.summary.frames);
});
test('baseline compares matching render conditions across builds; mismatches and bad storage are safe',()=>{
  const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
  const config={map:'berlin',build:'a',buffer:[1440,900],sound:false};
  const result={schemaVersion:1,routeVersion:1,config,summary:{averageFps:60},frames:[{many:'samples'}]};
  assert.equal(saveBaseline(result,storage),true);assert.equal(loadBaseline({...config,build:'b'},storage).summary.averageFps,60);
  assert.equal(loadBaseline({...config,buffer:[2880,1800]},storage),null);
  assert.equal(loadBaseline({...config,sound:true},storage),null);
  assert.equal(loadBaseline({...config,logarithmicDepth:false,reversedDepth:true},storage).summary.averageFps,60);
  assert.equal(loadBaseline({...config,map:'frankfurt'},storage),null);
  assert.ok(!JSON.parse([...data.values()][0]).frames,'baseline stays compact');
  data.set('little-wings-benchmark-berlin','invalid');assert.equal(loadBaseline(config,storage),null);
  assert.equal(saveBaseline(result,{setItem(){throw Error('blocked')}}),false);
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  try{
    Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('SecurityError')}});
    assert.equal(loadBaseline(config),null);assert.equal(saveBaseline(result),false);
  }finally{
    if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;
  }
});
test('baseline comparison exposes GPU savings even when average FPS is display limited',()=>{
  const comparison=BenchmarkUI.prototype.comparison.call({
    baseline:{createdAt:'2026-09-11T12:00:00Z',summary:{averageFps:60,gpuMs:{mean:10},jsMs:{mean:4}}},
    result:{summary:{averageFps:60,gpuMs:{mean:7.5},jsMs:{mean:2}}},
  });
  assert.match(comparison,/\+0\.0% average FPS/);assert.match(comparison,/-25\.0% GPU time/);
  assert.match(comparison,/-50\.0% JavaScript time/);
});
test('scripted routes stay within the flight speed limit and sample identically regardless of previous frames',()=>{
  for(const city of ['berlin','frankfurt']){
    const route=new BenchmarkFlight(city);
    const expected=route.sample(13.2).position.toArray();
    for(let t=0;t<=30;t+=.02){
      const pose=route.sample(t);
      assert.ok(pose.velocity.length()>20&&pose.velocity.length()*3.6<=500);
      assert.ok(Math.abs(pose.position.x)<950&&Math.abs(pose.position.z)<950&&pose.position.y>40&&pose.position.y<420);
    }
    assert.deepEqual(route.sample(13.2).position.toArray(),expected);
  }
});
function fakeGL(supported=true){
  return {QUERY_RESULT_AVAILABLE:1,QUERY_RESULT:2,ready:false,disjoint:false,deleted:0,active:0,resultsRead:0,
    getExtension:()=>supported?{TIME_ELAPSED_EXT:3,GPU_DISJOINT_EXT:4}:null,
    createQuery:()=>({}),beginQuery(){this.active++},endQuery(){this.active--},
    getParameter(){return this.disjoint},
    getQueryParameter(q,key){if(key===1)return this.ready;this.resultsRead++;return 7500000},
    deleteQuery(){this.deleted++},
  };
}
test('GPU timer never reads an unavailable result, bounds its queue, discards disjoint queries and cleans up',()=>{
  const gl=fakeGL(),gpu=new BenchmarkGPU(gl),sample={gpuMs:null};
  gpu.begin(sample);gpu.end();gpu.poll();assert.equal(gl.resultsRead,0);assert.equal(sample.gpuMs,null);
  gl.ready=true;gpu.poll();assert.equal(sample.gpuMs,7.5);assert.equal(gl.deleted,1);
  gl.ready=false;
  for(let i=0;i<10;i++){gpu.begin({gpuMs:null});gpu.end()}
  assert.equal(gpu.pending.length,8);assert.equal(gpu.skipped,2);
  gl.disjoint=true;gpu.poll();assert.equal(gpu.pending.length,0);assert.equal(gpu.disjoint,1);
  assert.equal(gl.resultsRead,1);assert.equal(gl.deleted,9);
  gpu.begin({});gpu.clear();assert.equal(gl.active,0);assert.equal(gl.deleted,10);
  const missing=new BenchmarkGPU(fakeGL(false));missing.begin({});missing.end();missing.poll();
  assert.equal(missing.snapshot().supported,false);assert.equal(missing.pending.length,0);
});
