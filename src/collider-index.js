// Static map broad phase. Candidates retain their original order and identity:
// collision response, nearest-hit ties and damage attribution stay unchanged.
const indexes=new WeakMap();
const cellKey=(x,z)=>(x+32768)*65536+(z+32768);
export class ColliderIndex {
  constructor(colliders,cellSize=64){
    this.colliders=colliders;this.cellSize=cellSize;this.cells=new Map();this.large=[];
    // Per-query de-duplication uses a generation stamp instead of a fresh Set.
    this.stamps=new Uint32Array(colliders.length);this.generation=0;this.ids=[];
    colliders.forEach((box,id)=>{
      const x0=Math.floor(box.min.x/cellSize),x1=Math.floor(box.max.x/cellSize);
      const z0=Math.floor(box.min.z/cellSize),z1=Math.floor(box.max.z/cellSize);
      if((x1-x0+1)*(z1-z0+1)>256){this.large.push(id);return}
      for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
        const key=cellKey(x,z);
        if(!this.cells.has(key))this.cells.set(key,[]);
        this.cells.get(key).push(id);
      }
    });
  }
  query(minX,minY,minZ,maxX,maxY,maxZ){
    const size=this.cellSize,x0=Math.floor(minX/size),x1=Math.floor(maxX/size),z0=Math.floor(minZ/size),z1=Math.floor(maxZ/size);
    const overlaps=b=>b.min.x<=maxX&&b.max.x>=minX&&b.min.y<=maxY&&b.max.y>=minY&&b.min.z<=maxZ&&b.max.z>=minZ;
    // Huge rays/queries are cheaper as a single scan than thousands of cells.
    if((x1-x0+1)*(z1-z0+1)>1024)return this.colliders.filter(overlaps);
    const stamps=this.stamps,ids=this.ids;ids.length=0;
    if(++this.generation===0xffffffff){stamps.fill(0);this.generation=1}
    const generation=this.generation;
    for(const id of this.large){stamps[id]=generation;ids.push(id)}
    for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
      const cell=this.cells.get(cellKey(x,z));if(!cell)continue;
      for(let i=0;i<cell.length;i++){const id=cell[i];if(stamps[id]!==generation){stamps[id]=generation;ids.push(id)}}
    }
    ids.sort((a,b)=>a-b);
    const result=[];
    for(let i=0;i<ids.length;i++){const box=this.colliders[ids[i]];if(overlaps(box))result.push(box)}
    return result;
  }
}
export function indexColliders(colliders){
  let index=indexes.get(colliders);
  if(!index){index=new ColliderIndex(colliders);indexes.set(colliders,index)}
  return index;
}
export function nearbyColliders(colliders,x,y,z,radius,verticalRadius=radius){
  return indexColliders(colliders).query(x-radius,y-verticalRadius,z-radius,x+radius,y+verticalRadius,z+radius);
}
export function segmentColliders(colliders,a,b){
  if(colliders.length<32)return colliders;
  return indexColliders(colliders).query(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.min(a.z,b.z),
    Math.max(a.x,b.x),Math.max(a.y,b.y),Math.max(a.z,b.z));
}
