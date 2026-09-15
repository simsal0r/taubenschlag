import * as THREE from 'three';
import { pointInPolygon } from './collision.js';

export const CAT_GAIT={bodyHeight:3.35,stride:3.8,climbSpeed:13,descentSpeed:10,walkSpeed:7,runSpeed:12};
const up=new THREE.Vector3(0,1,0),forward=new THREE.Vector3(),normal=new THREE.Vector3(),right=new THREE.Vector3();
const mix=THREE.MathUtils.lerp,clamp=THREE.MathUtils.clamp;
export function edgeDistance(x,z,a,b){
  const dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);
  return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
}
export function clearOfBuildings(x,z,colliders,radius=3.6){
  return !colliders.some(c=>{
    if(c.min.y>4||c.max.y<1||x<c.min.x-radius||x>c.max.x+radius||z<c.min.z-radius||z>c.max.z+radius)return false;
    const p=c.polygon||[[c.min.x,c.min.z],[c.max.x,c.min.z],[c.max.x,c.max.z],[c.min.x,c.max.z]];
    return pointInPolygon(x,z,p)||p.some((a,i)=>edgeDistance(x,z,a,p[(i+1)%p.length])<radius);
  });
}

// Small, map-local grids built once at launch. Eight-way A* checks the two
// adjacent cells on diagonals, so street patrols never cut a building corner.
export function navigationGrid(bounds,walkable,step=3){
  const [x0,z0,x1,z1]=bounds,w=Math.ceil((x1-x0)/step)+1,h=Math.ceil((z1-z0)/step)+1;
  const cells=new Uint8Array(w*h),position=i=>[x0+(i%w)*step,z0+Math.floor(i/w)*step];
  for(let i=0;i<cells.length;i++){const [x,z]=position(i);cells[i]=walkable(x,z)?1:0}
  const nearest=p=>{
    let best=-1,distance=Infinity;
    for(let i=0;i<cells.length;i++)if(cells[i]){
      const q=position(i),d=(q[0]-p[0])**2+(q[1]-p[1])**2;
      if(d<distance){distance=d;best=i}
    }
    return best;
  };
  const path=(from,to)=>{
    const start=nearest(from),goal=nearest(to);if(start<0||goal<0)return [];
    const cost=new Float64Array(cells.length).fill(Infinity),came=new Int32Array(cells.length).fill(-1),open=new Set([start]);
    cost[start]=0;
    const gx=goal%w,gz=Math.floor(goal/w),score=i=>cost[i]+Math.hypot(i%w-gx,Math.floor(i/w)-gz);
    while(open.size){
      let current=-1,best=Infinity;
      for(const i of open){const s=score(i);if(s<best){best=s;current=i}}
      if(current===goal){
        const route=[];for(let i=goal;i!==-1;i=came[i])route.push(position(i));return route.reverse();
      }
      open.delete(current);const x=current%w,z=Math.floor(current/w);
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
        const nx=x+dx,nz=z+dz,n=nz*w+nx;
        if(nx<0||nx>=w||nz<0||nz>=h||!cells[n]||dx&&dz&&(!cells[z*w+nx]||!cells[nz*w+x]))continue;
        const distance=cost[current]+Math.hypot(dx,dz);
        if(distance<cost[n]){cost[n]=distance;came[n]=current;open.add(n)}
      }
    }
    return [];
  };
  return{path,nearest:p=>{const i=nearest(p);return i<0?null:position(i)},cells,position};
}
const boundsOf=p=>[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))];
function routeThrough(grid,anchors,y){
  const result=[];
  for(let i=0;i<anchors.length-1;i++){
    const part=grid.path(anchors[i],anchors[i+1]);if(!part.length)return [];
    result.push(...part.slice(result.length?1:0).map(([x,z])=>new THREE.Vector3(x,y,z)));
  }
  return result;
}
export function catTerritory(points,height,groundOutline,colliders,view=[-100,140]){
  const signed=points.reduce((s,a,i)=>{const b=points[(i+1)%points.length];return s+a[0]*b[1]-b[0]*a[1]},0);
  const candidates=points.map((a,i)=>{
    const b=points[(i+1)%points.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
    const n=[dz/len*Math.sign(signed),-dx/len*Math.sign(signed)],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    const entry=[mid[0]+n[0]*3.6,mid[1]+n[1]*3.6];
    return{a,b,normal:n,height,mid,entry,score:len>14&&clearOfBuildings(...entry,colliders,3.4)?len+(n[0]*(view[0]-mid[0])+n[1]*(view[1]-mid[1]))*.1:-Infinity};
  }).filter(w=>Number.isFinite(w.score)).sort((a,b)=>b.score-a.score);
  const w=candidates[0];if(!w)throw new Error('No exterior climbing face with street clearance');
  const [x0,z0,x1,z1]=boundsOf(points);
  const roofGrid=navigationGrid([x0,z0,x1,z1],(x,z)=>pointInPolygon(x,z,points)&&points.every((a,i)=>edgeDistance(x,z,a,points[(i+1)%points.length])>1.8),1.5);
  const roofEntry=roofGrid.nearest([w.mid[0]-w.normal[0]*4,w.mid[1]-w.normal[1]*4]);
  const anchors=[roofEntry];
  // Farthest connected corners give a route through the roof, including narrow
  // TaunusTurm's central spine, without crossing its lower sloping side roofs.
  for(const p of [[x0,z0],[x1,z1],[x0,z1],[x1,z0]]){const q=roofGrid.nearest(p);if(q&&roofGrid.path(anchors.at(-1),q).length)anchors.push(q)}
  anchors.push(roofEntry);
  const roofY=height+.35,roofRoute=routeThrough(roofGrid,anchors,roofY+CAT_GAIT.bodyHeight);
  const [gx0,gz0,gx1,gz1]=boundsOf(groundOutline);
  const nearby=colliders.filter(c=>c.min.x<gx1+90&&c.max.x>gx0-90&&c.min.z<gz1+90&&c.max.z>gz0-90);
  const grid=navigationGrid([gx0-75,gz0-75,gx1+75,gz1+75],(x,z)=>clearOfBuildings(x,z,nearby,4.2),2.5);
  const street=grid.nearest([w.mid[0]+w.normal[0]*10,w.mid[1]+w.normal[1]*10]);
  const corners=[[gx0-12,gz0-12],[gx1+12,gz0-12],[gx1+12,gz1+12],[gx0-12,gz1+12]];
  // Start with the nearest corner, then make one complete circuit.
  let first=0;corners.forEach((p,i)=>{if(Math.hypot(p[0]-street[0],p[1]-street[1])<Math.hypot(corners[first][0]-street[0],corners[first][1]-street[1]))first=i});
  const groundRoute=routeThrough(grid,[street,...corners.slice(first),...corners.slice(0,first),corners[first],street],CAT_GAIT.bodyHeight+.15);
  if(!roofRoute.length||!groundRoute.length)throw new Error('Cat patrol route is disconnected');
  return{...w,roofY,roofPoints:points,roofEntry:new THREE.Vector3(roofEntry[0],roofY+CAT_GAIT.bodyHeight,roofEntry[1]),roofRoute,groundRoute};
}
function orient(e,n,f,dt){
  normal.copy(n).normalize();forward.copy(f).normalize();
  right.crossVectors(normal,forward).negate().normalize();
  const q=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,normal,forward.clone().negate()));
  e.orientation.slerp(q,1-Math.exp(-dt*10));e.surfaceNormal.copy(normal);
}
export function resetCatPatrol(e){
  e.patrol={stage:'climb',progress:0,index:0,rooftopTime:0,cycles:0,dwell:58+(e.phase%3)*13};
  e.surfaceNormal=new THREE.Vector3(e.wall.normal[0],0,e.wall.normal[1]);e.travel=0;
}
function follow(e,route,speed,dt){
  const p=e.patrol;let budget=speed*dt;
  while(budget>0&&p.index<route.length){
    const d=route[p.index].clone().sub(e.position),length=d.length();
    if(length<.03){p.index++;continue}
    orient(e,up,d,dt);
    const step=Math.min(length,budget);e.position.addScaledVector(d,step/length);budget-=step;
    if(step===length)p.index++;
  }
  return p.index>=route.length;
}
export function advanceCatPatrol(e,dt){
  if(!e.patrol)resetCatPatrol(e);
  const p=e.patrol,w=e.wall,n=new THREE.Vector3(w.normal[0],0,w.normal[1]);
  // Legacy synthetic test walls have a simple rectangular rooftop route.
  if(!w.roofRoute){
    w.mid=[(w.a[0]+w.b[0])/2,(w.a[1]+w.b[1])/2];w.roofY=w.height;
    w.roofEntry=new THREE.Vector3(w.mid[0]-n.x*5,w.height+3.35,w.mid[1]-n.z*5);
    w.roofRoute=[w.roofEntry.clone(),w.roofEntry.clone().add(new THREE.Vector3(8,0,-5)),w.roofEntry.clone()];
    w.groundRoute=[new THREE.Vector3(w.mid[0]+n.x*10,3.5,w.mid[1]+n.z*10)];
  }
  const stage=s=>{p.stage=s;p.progress=0;p.index=0};
  if(p.stage==='climb'||p.stage==='descend'){
    const climbing=p.stage==='climb',end=climbing?w.roofY-5.5:7;
    const speed=(climbing?CAT_GAIT.climbSpeed:CAT_GAIT.descentSpeed)*(.85+.15*Math.sin(e.travel*1.7)**2);
    e.position.x=w.mid[0]+n.x*CAT_GAIT.bodyHeight;e.position.z=w.mid[1]+n.z*CAT_GAIT.bodyHeight;
    e.position.y+=clamp(end-e.position.y,-speed*dt,speed*dt);orient(e,n,up,dt);
    if(Math.abs(end-e.position.y)<.01)stage(climbing?'mantle':'dismount');
  }else if(p.stage==='mantle'||p.stage==='unmantle'){
    p.progress=Math.min(1,p.progress+dt/1.8);
    const t=p.stage==='mantle'?p.progress:1-p.progress,s=t*t*(3-2*t),a=s*Math.PI/2;
    const start=new THREE.Vector3(w.mid[0]+n.x*CAT_GAIT.bodyHeight,w.roofY-5.5,w.mid[1]+n.z*CAT_GAIT.bodyHeight);
    // Front paws crest first, hind feet retain their anchors during the pull-up.
    e.position.lerpVectors(start,w.roofEntry,s);e.position.y+=Math.sin(Math.PI*s)*3;
    orient(e,n.clone().multiplyScalar(Math.cos(a)).addScaledVector(up,Math.sin(a)),up.clone().multiplyScalar(Math.cos(a)).addScaledVector(n,-Math.sin(a)),dt);
    if(p.progress===1){if(p.stage==='mantle'){stage('roof');p.rooftopTime=0}else stage('descend')}
  }else if(p.stage==='roof'){
    p.rooftopTime+=dt;
    if(follow(e,w.roofRoute,CAT_GAIT.walkSpeed,dt)){
      if(p.rooftopTime>=p.dwell)stage('unmantle');else p.index=0;
    }
  }else if(p.stage==='dismount'||p.stage==='mount'){
    p.progress=Math.min(1,p.progress+dt/1.1);
    const t=p.stage==='dismount'?p.progress:1-p.progress,s=t*t*(3-2*t);
    e.position.lerpVectors(new THREE.Vector3(w.mid[0]+n.x*CAT_GAIT.bodyHeight,7,w.mid[1]+n.z*CAT_GAIT.bodyHeight),w.groundRoute[0],s);
    orient(e,n.clone().lerp(up,s).normalize(),up.clone().multiplyScalar(1-s).addScaledVector(n,-s).normalize(),dt);
    if(p.progress===1)stage(p.stage==='dismount'?'ground':'climb');
  }else if(p.stage==='ground'&&follow(e,w.groundRoute,CAT_GAIT.runSpeed,dt)){
    p.cycles++;stage('mount');
  }
}
