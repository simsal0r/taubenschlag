import { BENCHMARK,SECTIONS,loadBaseline,saveBaseline } from './benchmark.js';
import { MAPS } from './maps/catalog.js';

const format=(n,digits=1)=>Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:digits,minimumFractionDigits:digits}):'Unavailable';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class BenchmarkUI {
  constructor({cancel,retry,resume,home}){
    this.overlay=document.createElement('section');this.overlay.id='benchmark-flight';this.overlay.className='hidden';
    this.overlay.setAttribute('aria-label','Automatic benchmark flight');
    this.overlay.innerHTML='<div><small>PERFORMANCE FLIGHT</small><strong id="benchmark-stage"></strong><span id="benchmark-progress-text"></span></div><progress id="benchmark-progress" max="30" value="0" aria-label="Benchmark progress"></progress><button class="secondary-button" id="cancel-benchmark">Cancel · Esc</button>';
    this.dialog=document.createElement('dialog');this.dialog.id='benchmark-results';this.dialog.setAttribute('aria-labelledby','benchmark-title');
    document.body.append(this.overlay,this.dialog);
    this.overlay.querySelector('button').onclick=()=>cancel('Cancelled by you.');
    this.dialog.addEventListener('cancel',e=>{e.preventDefault();resume()});
    this.actions={retry,resume,home};this.lastUpdate=-Infinity;
  }
  start(){
    this.dialog.close();this.overlay.classList.remove('hidden');
    document.body.classList.add('benchmark-active');this.lastUpdate=-Infinity;
  }
  progress(run,now){
    if(now-this.lastUpdate<100)return;
    this.lastUpdate=now;
    const warm=run.phase==='warmup',settling=run.phase==='settling',seconds=run.elapsedMs/1000;
    document.getElementById('benchmark-stage').textContent=warm?'Warming up the route':settling?'Finishing measurements':SECTIONS[Math.min(2,Math.floor(seconds/10))];
    document.getElementById('benchmark-progress-text').textContent=warm?`${Math.max(0,Math.ceil(BENCHMARK.warmupMs/1000-seconds))}s warm-up · 30s measured flight follows`
      :settling?'Flight complete · reading GPU timers':`${Math.min(30,seconds).toFixed(1)} / 30s · Autopilot`;
    document.getElementById('benchmark-progress').value=warm?0:Math.min(30,seconds);
  }
  stop(){
    this.overlay.classList.add('hidden');document.body.classList.remove('benchmark-active');
  }
  show(result,reason){
    this.stop();this.result=result;document.body.classList.add('benchmark-finished');
    let content;
    if(!result){
      content=`<div class="modal-eyebrow">PERFORMANCE FLIGHT</div><h2 id="benchmark-title">Flight interrupted.</h2><p>${escape(reason)}</p><p>No result or baseline was saved. Keep this window visible and its size unchanged for the entire run.</p>`;
    }else{
      const s=result.summary,c=result.config,gpu=s.gpuMs.samples?`${format(s.gpuMs.mean)} ms`:'Unavailable';
      this.baseline=loadBaseline(c);
      let first=false;
      try{first=!localStorage.getItem(`little-wings-benchmark-${c.map}`)}catch{}
      this.saved=first&&saveBaseline(result);
      const stat=(label,value,note)=>`<div><small>${label}</small><strong>${value}</strong><span>${note}</span></div>`;
      // One peak per half-second keeps spikes visible without thousands of SVG points.
      const buckets=Array.from({length:60},()=>0);
      for(const f of result.frames)buckets[Math.min(59,Math.floor(f.t*2))]=Math.max(buckets[Math.min(59,Math.floor(f.t*2))],f.frameMs);
      const ceiling=Math.max(50,...buckets),points=buckets.map((n,i)=>`${i/59*600},${80-n/ceiling*70}`).join(' ');
      content=`<div class="modal-eyebrow">${MAPS[c.map].city.toUpperCase()} · PERFORMANCE FLIGHT</div>
        <h2 id="benchmark-title">Your flight, measured.</h2>
        <p class="benchmark-subtitle">${format(s.durationMs/1000,2)} seconds · ${format(s.frames,0)} frames · ${c.buffer[0]} × ${c.buffer[1]} render pixels</p>
        <div class="benchmark-stats">
          ${stat('Average FPS',format(s.averageFps),'Higher is smoother')}
          ${stat('1% low FPS',format(s.low1PercentFps),'Slowest 1% of frames')}
          ${stat('95th percentile',`${format(s.frameMs.p95)} ms`,'Frame time · lower is better')}
          ${stat('JavaScript / frame',`${format(s.jsMs.mean)} ms`,'Update + render submission')}
          ${stat('GPU / frame',gpu,s.gpuMs.samples?`${format(s.gpuMs.samples/s.frames*100,0)}% of frames timed`:'Browser did not provide timings')}
          ${stat('Frames over 50 ms',format(s.over50ms,0),`${format(s.over50ms/s.frames*100)}% of the flight`)}
        </div>
        <div class="benchmark-chart"><div><span>FRAME TIME · HALF-SECOND PEAKS</span><span>${format(ceiling,0)} ms ceiling</span></div>
          <svg viewBox="0 0 600 90" role="img" aria-label="Peak frame times across the 30 second flight; lower is smoother"><line x1="0" x2="600" y1="${80-1000/60/ceiling*70}" y2="${80-1000/60/ceiling*70}" stroke="#88a795" stroke-dasharray="4 5"/><polyline points="${points}" fill="none" stroke="#366958" stroke-width="2"/></svg>
          <div><span>0s</span><span>Dashed line: 16.7 ms / 60 FPS</span><span>30s</span></div>
        </div>
        <table class="benchmark-table"><thead><tr><th>Route section</th><th>Avg FPS</th><th>1% low</th><th>p95 ms</th></tr></thead><tbody>${result.sections.map(part=>`<tr><td>${part.name}</td><td>${format(part.averageFps)}</td><td>${format(part.low1PercentFps)}</td><td>${format(part.frameMs.p95)}</td></tr>`).join('')}</tbody></table>
        <p id="baseline-comparison" class="benchmark-baseline">${this.baseline?this.comparison():this.saved?'Saved as your first baseline for this city.':'No baseline with matching render conditions. You can save this run below.'}</p>
        <details class="benchmark-details"><summary>Workload & measurement details</summary>
          <p>${format(s.drawCalls.mean,0)} draw calls / frame · ${format(s.triangles.mean,0)} triangles / frame<br>
          Frame times: median ${format(s.frameMs.p50)} · p99 ${format(s.frameMs.p99)} · worst ${format(s.frameMs.max)} ms<br>
          ${format(s.over33ms,0)} frames over 33.3 ms · JS p95 ${format(s.jsMs.p95)} ms · GPU p95 ${format(s.gpuMs.p95)} ms<br>
          ${result.resources.geometries} geometries · ${result.resources.textures} textures (counts, not VRAM bytes)<br>
          ${result.jsHeapBytes?`JS heap estimate: ${format(result.jsHeapBytes/1048576)} MiB · `:''}Sound ${c.sound?'on':'off'} · pixel ratio ${format(c.pixelRatio,2)} · ${c.shadows.size}px shadows<br>
          Route v${result.routeVersion} · build ${escape(c.build)}</p>
          <p>Five-second warm-up, then a fixed VTOL camera route with neutral wildlife, afterburners, two flare bursts and a cockpit pass. Pilot physics, combat and map loading are excluded. The 1% low is 1000 divided by the average of the slowest 1% of frame times.</p>
          <p>FPS includes display pacing. JavaScript time measures update and render submission; GPU time is optional and excludes browser compositing. Neither measures CPU utilization, power, temperature or fan speed. GPU samples: ${s.gpuMs.samples} / ${s.frames}; disjoint events: ${result.gpu.disjointEvents}; unresolved queries: ${result.gpu.pendingQueries}.</p>
        </details>
        <p class="modal-note">For a useful comparison, keep the browser, window size, power mode and other apps the same. Try three runs on a warmed-up machine. Rendering is stopped while this screen is open.</p>
        <div class="benchmark-exports"><button class="secondary-button" id="copy-benchmark">Copy JSON</button><button class="secondary-button" id="download-benchmark">Download JSON</button><button class="text-button" id="save-benchmark">Set as baseline</button></div>
        <p class="benchmark-feedback" id="benchmark-feedback" role="status"></p>`;
    }
    this.dialog.innerHTML=content+`<div class="modal-buttons"><button class="primary-button" id="retry-benchmark">Run again ↗</button><button class="secondary-button" id="resume-benchmark">Return to flight</button></div><button class="text-button" id="benchmark-home">← Change city</button>`;
    this.dialog.querySelector('#retry-benchmark').onclick=()=>this.actions.retry();
    this.dialog.querySelector('#resume-benchmark').onclick=()=>this.actions.resume();
    this.dialog.querySelector('#benchmark-home').onclick=()=>this.actions.home();
    if(result){
      const feedback=text=>{this.dialog.querySelector('#benchmark-feedback').textContent=text};
      this.dialog.querySelector('#copy-benchmark').onclick=async()=>{
        try{await navigator.clipboard.writeText(JSON.stringify(result,null,2));feedback('Report copied.')}
        catch{feedback('Clipboard unavailable. Use Download JSON to save the report.')}
      };
      this.dialog.querySelector('#download-benchmark').onclick=()=>{
        const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));
        const link=document.createElement('a');link.href=url;link.download=`little-wings-${result.config.map}-${result.createdAt.replace(/[:.]/g,'-')}.json`;link.click();
        setTimeout(()=>URL.revokeObjectURL(url),1000);feedback('Report downloaded.');
      };
      this.dialog.querySelector('#save-benchmark').onclick=()=>{
        const saved=saveBaseline(result);
        feedback(saved?'Baseline saved on this device.':'Storage unavailable; download this report to keep it.');
        if(saved)this.dialog.querySelector('#baseline-comparison').textContent='This run is now your baseline for this city and render configuration.';
      };
    }
    this.dialog.showModal();
  }
  comparison(){
    const delta=(this.result.summary.averageFps/this.baseline.summary.averageFps-1)*100;
    const parts=[`${delta>=0?'+':''}${format(delta)}% average FPS (${format(this.baseline.summary.averageFps)} → ${format(this.result.summary.averageFps)})`];
    for(const [key,label] of [['gpuMs','GPU time'],['jsMs','JavaScript time']]){
      const before=this.baseline.summary[key]?.mean,after=this.result.summary[key]?.mean;
      if(before>0&&Number.isFinite(after)){
        const change=(after/before-1)*100;
        parts.push(`${change>=0?'+':''}${format(change)}% ${label} (${format(before)} → ${format(after)} ms; lower is better)`);
      }
    }
    return `${parts.join(' · ')} vs baseline from ${new Date(this.baseline.createdAt).toLocaleString()}.`;
  }
  close(){this.stop();this.dialog.close();document.body.classList.remove('benchmark-finished')}
  dispose(){this.close();this.dialog.remove();this.overlay.remove()}
}
