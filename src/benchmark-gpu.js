/** Optional, nonblocking WebGL2 elapsed queries. Never wait for GPU completion. */
export class BenchmarkGPU {
  constructor(gl){
    this.gl=gl;this.ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.pending=[];this.active=null;this.disjoint=0;this.skipped=0;
  }
  begin(sample){
    if(!this.ext||this.pending.length>=8){this.skipped++;return}
    const query=this.gl.createQuery();if(!query){this.skipped++;return}
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT,query);this.active={query,sample};
  }
  end(){
    if(!this.active)return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);this.pending.push(this.active);this.active=null;
  }
  poll(){
    if(!this.ext)return;
    const gl=this.gl;
    if(gl.getParameter(this.ext.GPU_DISJOINT_EXT)){
      this.disjoint++;this.clear();return;
    }
    while(this.pending.length&&gl.getQueryParameter(this.pending[0].query,gl.QUERY_RESULT_AVAILABLE)){
      const {query,sample}=this.pending.shift();
      sample.gpuMs=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;gl.deleteQuery(query);
    }
  }
  snapshot(){return{supported:!!this.ext,disjointEvents:this.disjoint,skippedQueries:this.skipped,pendingQueries:this.pending.length}}
  clear(){
    if(this.active){this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);this.gl.deleteQuery(this.active.query);this.active=null}
    for(const {query} of this.pending)this.gl.deleteQuery(query);
    this.pending.length=0;
  }
}
