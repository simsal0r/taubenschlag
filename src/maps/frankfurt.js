import * as THREE from 'three';
import { Builder, seededRandom, sign, spatialInstances } from '../geometry.js';
import { waterMaterial } from '../materials.js';
import data from './frankfurt-data.json';
import { detailedTowers } from './frankfurt-towers.js';
import { buildFrankfurtStation } from './frankfurt-station.js';
export { createFrankfurtPredators as createPredators } from './frankfurt-predators.js';

const center=p=>[p.reduce((s,v)=>s+v[0],0)/p.length,p.reduce((s,v)=>s+v[1],0)/p.length];
const edges=p=>p.map((a,i)=>[a,p[(i+1)%p.length]]);
const area=p=>edges(p).reduce((s,[a,b])=>s+a[0]*b[1]-b[0]*a[1],0)/2;
function contains(p,x,z){
  let inside=false;
  for(let i=0,j=p.length-1;i<p.length;j=i++){
    const a=p[i],b=p[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
function segmentDistance(x,z,a,b){
  const dx=b[0]-a[0],dz=b[1]-a[1],t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);
  return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
}
function strip(b,a,c,y,width,material){
  const dx=c[0]-a[0],dz=c[1]-a[1],length=Math.hypot(dx,dz);if(length<.01)return;
  const nx=-dz/length*width/2,nz=dx/length*width/2;
  b.polygon([[a[0]+nx,a[1]+nz],[c[0]+nx,c[1]+nz],[c[0]-nx,c[1]-nz],[a[0]-nx,a[1]-nz]],y,0,material);
}
function surface(b,record,y,material){
  const shape=new THREE.Shape(record.points.map(([x,z])=>new THREE.Vector2(x,-z)));
  for(const hole of record.holes||[])shape.holes.push(new THREE.Path(hole.map(([x,z])=>new THREE.Vector2(x,-z))));
  b.add(new THREE.ShapeGeometry(shape),material,[0,y,0],[1,1,1],[-Math.PI/2,0,0]);
}

function facadeTexture(tower=false){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const c=canvas.getContext('2d');
  c.fillStyle=tower?'#adced2':'#f0e9dd';c.fillRect(0,0,128,128);
  const gradient=c.createLinearGradient(0,0,120,100);
  gradient.addColorStop(0,tower?'#6894a5':'#607b83');gradient.addColorStop(.45,tower?'#709eac':'#536875');gradient.addColorStop(1,tower?'#8cb4bf':'#a6bfc0');
  c.fillStyle=gradient;c.fillRect(tower?3:24,10,tower?122:80,tower?109:82);
  c.fillStyle=tower?'#cedbdd':'#fbf3dc';c.fillRect(0,tower?125:120,128,tower?3:8);
  c.fillStyle='#cedade';c.fillRect(62,10,2,tower?109:82);
  c.fillStyle='#ffffff32';c.fillRect(tower?5:26,12,7,tower?101:76);
  if(!tower){c.fillStyle='#b4b5a2';c.fillRect(20,93,88,4)}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;return texture;
}
function facade(b,points,bottom,top,material,unit=3.3){
  if(top<=bottom)return;
  const direction=Math.sign(area(points));
  for(const [a,c] of edges(points)){
    const dx=c[0]-a[0],dz=c[1]-a[1],length=Math.hypot(dx,dz);
    if(length<1.5)continue;
    const nx=dz/length*direction,nz=-dx/length*direction,geo=new THREE.PlaneGeometry(length,top-bottom),uv=geo.getAttribute('uv');
    for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*length/unit,uv.getY(i)*(top-bottom)/3.7);
    b.add(geo,material,[(a[0]+c[0])/2+nx*.05,(bottom+top)/2,(a[1]+c[1])/2+nz*.05],[1,1,1],[0,Math.atan2(nx,nz),0]);
  }
}
function crown(b,part,glass,stone){
  const p=part.points,angle=part.roofDirection*Math.PI/180,d=[Math.sin(angle),-Math.cos(angle)];
  const dots=p.map(([x,z])=>x*d[0]+z*d[1]),min=Math.min(...dots),max=Math.max(...dots),base=part.h-part.roofHeight;
  const height=([x,z])=>part.h-(x*d[0]+z*d[1]-min)/(max-min)*part.roofHeight;
  b.polygon(p,0,base,glass,'TaunusTurm');
  const verts=[],tri=(a,c,d)=>verts.push(...a,...c,...d),point=a=>[a[0],height(a),a[1]];
  for(let i=1;i<p.length-1;i++)tri(point(p[0]),point(p[i]),point(p[i+1]));
  for(const [a,c] of edges(p)){
    tri([a[0],base,a[1]],[c[0],base,c[1]],point(c));tri([a[0],base,a[1]],point(c),point(a));
    b.beam(point(a),point(c),.27,stone);
    const n=Math.ceil(Math.hypot(c[0]-a[0],c[1]-a[1])/1.8);
    for(let j=0;j<=n;j++){const x=THREE.MathUtils.lerp(a[0],c[0],j/n),z=THREE.MathUtils.lerp(a[1],c[1],j/n),h=height([x,z]);b.box(x,h/2,z,.24,h,.24,stone)}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.computeVertexNormals();b.add(geo,glass);
  // Strip colliders follow the visible roof slope within 0.8 m.
  for(let i=0;i<20;i++){
    let polygon=p;
    for(const [threshold,above] of [[min+(max-min)*i/20,true],[min+(max-min)*(i+1)/20,false]]){
      const clipped=[];
      for(const [a,c] of edges(polygon)){
        const da=a[0]*d[0]+a[1]*d[1]-threshold,dc=c[0]*d[0]+c[1]*d[1]-threshold,ina=above?da>=0:da<=0,inc=above?dc>=0:dc<=0;
        if(ina)clipped.push(a);
        if(ina!==inc){const t=da/(da-dc);clipped.push([a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t])}
      }
      polygon=clipped;
    }
    if(polygon.length>2)b.polygonCollider(polygon,base,part.h-i/20*part.roofHeight,'TaunusTurm crown');
  }
}

function buildSkyline(scene,m){
  const b=new Builder(),records=[];
  const tower=(points,h,name,mat=m.glass,windows=m.facadeGlass,bottom=0)=>{
    b.polygon(points,bottom,h-bottom,mat,name);facade(b,points,Math.max(bottom,5),h,windows);b.polygon(points,h,.32,m.roof);
    const [x,z]=center(points);records.push({points,h,x,z,name});
  };
  records.push(...detailedTowers(b,m,data,{crown,center,edges}));
  for(const id of [1280720223,1280720230]){const p=data.parts[id];tower(p.points,p.h,'FOUR Frankfurt')}
  for(const [key,h] of [['gallileo',136],['marienturm',155],['opernTurm',170]]){
    const p=data.landmarks[key],warm=key==='opernTurm';tower(p.points,h,p.name,warm?m.stone:m.metal,warm?m.facadeStone:m.facadeGlass);
  }
  const oper=data.landmarks.alteOper,[ox,oz]=center(oper.points);
  tower(oper.points,19,'Alte Oper',m.stone,m.facadeStone);
  b.box(ox,23,oz,49,8,59,b.mat('operaRoof','#6c9386'));b.box(ox,28,oz,30,5,36,m.stone);
  b.cylinder(ox,33,oz,0,17,6,m.roof,4,[0,Math.PI/4,0]);
  for(let i=-3;i<=3;i++)b.cylinder(ox+i*5,11,oz+38,.6,.85,17,m.ivory,8);
  b.box(ox,20,oz+38,41,2,6,m.ivory);b.cylinder(ox,24,oz+38,0,19,6,m.stone,3,[0,Math.PI/2,0]);b.sphere(ox,35,oz,1,2,1,m.metal,0);
  const dom=data.landmarks.dom; tower(dom.points,22,'Frankfurt Cathedral',m.brick,m.facadeBrick);
  b.solidBox(867,35,24,15,70,15,m.brick,'Cathedral tower');b.cylinder(867,79,24,0,10,21,m.brick,8);b.cylinder(867,94,24,.15,.15,9,m.metal,6);
  const roemer=data.landmarks.roemer,[rx,rz]=center(roemer.points);tower(roemer.points,16.5,'Römer',m.stone,m.facadeStone);
  for(const x of [rx-10,rx,rx+10])for(let step=0;step<4;step++)b.box(x,18+step*1.7,rz+8,9-step*2,1.7,1.2,m.stone);
  b.finish(scene,{cellSize:256});return{colliders:b.colliders,buildings:records};
}

function buildBridges(b,m){
  const deck=b.mat('bridgeDeck','#8d9a94'),green=b.mat('bridgeGreen','#3d807b'),red=b.mat('bridgeRed','#ba6850');
  for(const [name,width,type] of [['Untermainbrücke',20,'road'],['Eiserner Steg',5.5,'truss'],['Holbeinsteg',5.5,'suspension']]){
    const mapped=data.roads.filter(r=>r.name===name&&r.bridge);
    const a=mapped[0].segments[0][0],c=mapped.at(-1).segments.at(-1)[1],dx=c[0]-a[0],dz=c[1]-a[1],len=Math.hypot(dx,dz),nx=-dz/len,nz=dx/len;
    const point=(t,side=0,y=8)=>[a[0]+dx*t+nx*side,y,a[1]+dz*t+nz*side];
    const line=(t,s=0)=>{const p=point(t,s);return[p[0],p[2]]};
    b.segment(a,c,8,width,1.1,deck,name);
    for(const side of [-width/2,width/2]){
      b.beam(point(0,side,9.4),point(1,side,9.4),.10,type==='road'?m.metal:green);
      for(let t=0;t<=1;t+=5/len)b.beam(point(t,side,8.4),point(t,side,9.4),.06,m.metal);
    }
    for(const t of [.2,.5,.8]){const p=point(t,0,3.6);b.solidBox(p[0],p[1],p[2],4.5,8,4.5,m.stone,name+' pier')}
    if(type==='road'){
      for(let t=.04;t<1;t+=12/len)b.segment(line(t),line(Math.min(1,t+5/len)),8.59,.25,.02,m.ivory);
      for(const side of [-8.8,8.8])b.segment(line(0,side),line(1,side),8.65,2.2,.2,m.stone);
    }else if(type==='truss'){
      for(const side of [-3,3])for(let i=0;i<12;i++){
        const t=i/12,next=(i+1)/12,y=11+6*Math.sin(t*Math.PI),ny=11+6*Math.sin(next*Math.PI);
        b.beam(point(t,side,y),point(next,side,ny),.3,green);
        b.beam(point(t,side,8.5),point(next,side,ny),.16,green);
        b.beam(point(t,side,8.5),point(t,side,y),.2,green);
      }
    }else{
      for(const t of [.2,.8])for(const side of [-5,5]){
        b.beam(point(t,side,2),point(t,-side*.2,27),.55,red);
        for(let j=0;j<=10;j++)b.beam(point(t,0,27),point(t+(j-5)*.034,side>0?2.8:-2.8,9),.085,m.ivory);
      }
    }
    for(const end of [0,1])for(let i=0;i<10;i++){
      const t=end+(end===0?-1:1)*(i+.5)*3/len,y=8-(i+.5)*.75;
      b.segment(line(t-1.5/len),line(t+1.5/len),y,width,.8,m.stone,name+' approach');
    }
  }
}

function buildCity(scene,m){
  const b=new Builder(),road=b.mat('asphalt','#84938d'),paving=b.mat('paving','#c7b8a0'),path=b.mat('path','#d6bf91'),grass=b.mat('park','#86ad51'),edge=b.mat('parkEdge','#a4b886');
  b.box(0,-2,0,6000,3,6000,edge);b.box(0,-.25,0,2200,.5,2200,paving);
  for(const park of data.parks)surface(b,park,.04,grass);
  const water=waterMaterial();water.material.color.set('#268fae');water.material.roughness=.24;water.material.metalness=.22;
  for(const p of data.water)surface(b,p,.08,water.material);
  const roads=[];
  for(const r of data.roads){
    if(r.bridge)continue;
    const foot=['footway','pedestrian','path','cycleway','service'].includes(r.kind);
    for(const [a,c] of r.segments){
      strip(b,a,c,foot?.15:.18,r.width,foot?path:road);
      if(!foot){
        roads.push({a,c,width:r.width});
        const len=Math.hypot(c[0]-a[0],c[1]-a[1]);
        if(r.width>=7&&len>12)for(let t=4;t<len-3;t+=13)strip(b,[a[0]+(c[0]-a[0])*t/len,a[1]+(c[1]-a[1])*t/len],[a[0]+(c[0]-a[0])*(t+4)/len,a[1]+(c[1]-a[1])*(t+4)/len],.21,.16,m.ivory);
      }
    }
  }
  for(const rail of data.rails)for(const [a,c] of rail.segments){
    strip(b,a,c,.24,1.9,m.roof);
    const len=Math.hypot(c[0]-a[0],c[1]-a[1]);if(len<.1)continue;
    const nx=-(c[1]-a[1])/len*.68,nz=(c[0]-a[0])/len*.68;
    for(const s of [-1,1])strip(b,[a[0]+nx*s,a[1]+nz*s],[c[0]+nx*s,c[1]+nz*s],.30,.1,m.metal);
  }
  buildBridges(b,m);const first=scene.children.length;b.finish(scene);
  for(const mesh of scene.children.slice(first))if([road,path,grass,paving,edge].includes(mesh.material))mesh.castShadow=false;
  const chunks=new Map(),buildings=[],colliders=[...b.colliders,...buildFrankfurtStation(scene)];
  for(const building of data.buildings){
    const p=building.points,[x,z]=center(p),h=building.h,key=`${Math.floor(x/320)},${Math.floor(z/320)}`;
    if(!chunks.has(key))chunks.set(key,new Builder());
    const chunk=chunks.get(key),palette=building.id%m.walls.length;
    chunk.polygon(p,.18,h,m.walls[palette],'Frankfurt building');
    const pitched=h<38&&!['flat','terrace','round'].includes(building.roof);
    chunk.polygon(p,h+.18,.4,m.roofs[building.id%m.roofs.length]);
    if(Math.hypot(x,z)<950)facade(chunk,p,1,h-.25,m.facades[palette],h>50?2.7:3.5);
    if(pitched&&p.length===4){
      const geo=new THREE.BufferGeometry(),[a,c,d,e]=p,mid1=[(a[0]+c[0])/2,h+3,(a[1]+c[1])/2],mid2=[(d[0]+e[0])/2,h+3,(d[1]+e[1])/2],v=[];
      const pt=q=>[q[0],h+.6,q[1]],tri=(a,c,d)=>v.push(...a,...c,...d);
      tri(pt(a),pt(e),mid2);tri(pt(a),mid2,mid1);tri(pt(c),mid1,mid2);tri(pt(c),mid2,pt(d));tri(pt(a),mid1,pt(c));tri(pt(e),pt(d),mid2);
      geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.computeVertexNormals();chunk.add(geo,m.roofs[building.id%m.roofs.length]);
      chunk.polygonCollider(p,h,h+3,'Frankfurt roof');
    }
    if(Math.hypot(x,z)<450&&h>12&&p.length<16&&Math.abs(area(p))>180){chunk.box(x,h+1,z,3,1.7,2,m.metal);chunk.box(x+3,h+.6,z,1,.8,1,m.ivory)}
    buildings.push({...building,x,z});
  }
  // Vertex colors keep the varied masonry/roof palette in just two draws per
  // city block. Blocks still cull independently when they leave the camera.
  const solid=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85,side:THREE.DoubleSide});
  const windows=new THREE.MeshStandardMaterial({vertexColors:true,map:m.facades[0].map,roughness:.72});
  for(const chunk of chunks.values()){
    const batches=new Map();
    for(const [material,geometries] of chunk.batches){
      const target=material.map?windows:solid;
      if(!batches.has(target))batches.set(target,[]);
      for(const geo of geometries){
        const count=geo.getAttribute('position').count,colors=new Float32Array(count*3);
        for(let i=0;i<count;i++)material.color.toArray(colors,i*3);
        geo.setAttribute('color',new THREE.BufferAttribute(colors,3));batches.get(target).push(geo);
      }
    }
    chunk.batches=batches;const first=scene.children.length;chunk.finish(scene);
    for(const mesh of scene.children.slice(first))if(mesh.material===windows)mesh.castShadow=false;
    colliders.push(...chunk.colliders);
  }
  return{buildings,colliders,roads,update:water.update};
}

function addLife(scene,buildings,roads,m,rand){
  const b=new Builder(),trees=[],occupancy=new Map(),used=new Set();
  for(const building of buildings){
    const p=building.points,minX=Math.floor(Math.min(...p.map(v=>v[0]))/35),maxX=Math.floor(Math.max(...p.map(v=>v[0]))/35),minZ=Math.floor(Math.min(...p.map(v=>v[1]))/35),maxZ=Math.floor(Math.max(...p.map(v=>v[1]))/35);
    for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
      const key=`${x},${z}`;if(!occupancy.has(key))occupancy.set(key,[]);occupancy.get(key).push(p);
    }
  }
  const clear=(x,z)=>!(occupancy.get(`${Math.floor(x/35)},${Math.floor(z/35)}`)||[]).some(p=>contains(p,x,z));
  const plant=(x,z,s)=>{
    const key=`${Math.floor(x/9)},${Math.floor(z/9)}`;
    if(used.has(key)||!clear(x,z)||data.water.some(w=>contains(w.points,x,z)))return;
    used.add(key);trees.push([x,z,s]);
  };
  const nearbyParks=[...data.parks].sort((a,b)=>Math.hypot(...center(a.points))-Math.hypot(...center(b.points)));
  for(const park of nearbyParks){
    const p=park.points,minX=Math.max(-1040,Math.min(...p.map(v=>v[0]))),maxX=Math.min(1040,Math.max(...p.map(v=>v[0]))),minZ=Math.max(-1040,Math.min(...p.map(v=>v[1]))),maxZ=Math.min(1040,Math.max(...p.map(v=>v[1])));
    for(let x=minX+5;x<maxX;x+=11)for(let z=minZ+5;z<maxZ;z+=11){
      const tx=x+(rand()-.5)*7,tz=z+(rand()-.5)*7;
      if(trees.length>2000||!contains(p,tx,tz)||(park.holes||[]).some(h=>contains(h,tx,tz))||roads.some(r=>segmentDistance(tx,tz,r.a,r.c)<r.width/2+3))continue;
      plant(tx,tz,1.1+rand()*.8);
    }
  }
  for(let i=0;i<roads.length;i+=3){
    const r=roads[i],dx=r.c[0]-r.a[0],dz=r.c[1]-r.a[1],len=Math.hypot(dx,dz);
    if(len<30)continue;
    for(let t=12;t<len;t+=30){
      const x=r.a[0]+dx*t/len-dz/len*(r.width/2+3.2),z=r.a[1]+dz*t/len+dx/len*(r.width/2+3.2);
      if(Math.abs(x)<980&&Math.abs(z)<980)plant(x,z,.9+rand()*.5);
    }
  }
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.18,.28,1,6),new THREE.MeshStandardMaterial({color:'#866442',roughness:1}),trees.length);
  const leaves=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.95}),trees.length);
  const obj=new THREE.Object3D(),color=new THREE.Color(),colors=['#548e48','#77a849','#9abb53','#c1bb58','#3e8156'];
  trees.forEach(([x,z,s],i)=>{
    obj.position.set(x,2.1*s,z);obj.scale.set(1,4.2*s,1);obj.rotation.set(0,0,0);obj.updateMatrix();trunks.setMatrixAt(i,obj.matrix);
    for(let j=0;j<1;j++){
      obj.position.set(x,4.6*s,z);obj.scale.set(2.6*s,2.9*s,2.5*s);obj.rotation.set(i*.19,i*.7,.1);obj.updateMatrix();leaves.setMatrixAt(i,obj.matrix);
      leaves.setColorAt(i,color.set(colors[i%colors.length]));
    }
  });
  trunks.castShadow=leaves.castShadow=true;trunks.receiveShadow=leaves.receiveShadow=true;
  scene.add(...spatialInstances(trunks),...spatialInstances(leaves));
  const bench=b.mat('bench','#be8553'),lamp=b.mat('lamp','#476562'),skin=b.mat('skin','#dcb792');
  const clothes=['#de8760','#548b9c','#d9bb50','#74709f'].map((c,i)=>b.mat(`coat${i}`,c));
  for(let i=0;i<trees.length;i+=22){
    const [x,z]=trees[i];
    b.box(x+3,.65,z,2,.16,.65,bench);b.box(x+3,1,z+.3,2,.6,.12,bench);
    for(const dx of [2.2,3.8])b.box(x+dx,.35,z,.12,.7,.5,lamp);
    b.cylinder(x-3,2.3,z,.05,.09,4.6,lamp,6);b.sphere(x-3,4.6,z,.28,.35,.28,m.ivory,1);
    b.sphere(x+1,1.5,z+3,.16,.2,.16,skin,1);b.box(x+1,1,z+3,.42,.7,.3,clothes[i%4]);
    b.box(x+.88,.4,z+3,.13,.7,.16,lamp);b.box(x+1.12,.4,z+3,.13,.7,.16,lamp);
  }
  for(let i=0;i<5;i++){
    const x=-39-i*4.5,z=23+i*2.7;
    b.cylinder(x,.8,z,.9,.9,.12,m.ivory,12);b.cylinder(x,.4,z,.08,.08,.8,m.metal,6);
    b.cylinder(x,2,z,.04,.04,4,m.ivory,6);b.cylinder(x,3.6,z,.05,2,.7,clothes[i%4],8);
    for(const dx of [-1.3,1.3])b.box(x+dx,.5,z,.5,.15,.5,bench);
  }
  const blue=b.mat('euroBlue','#2579ae'),yellow=b.mat('euroStars','#edc641',{emissive:'#e4a51c',emissiveIntensity:.15});
  b.add(new THREE.TorusGeometry(5,.43,6,32,Math.PI*1.5),blue,[17,7,209],[1,1,1],[0,0,Math.PI*.25]);
  b.box(16,8,209,8,.6,.7,blue);b.box(16,5.8,209,8,.6,.7,blue);
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;b.sphere(17+Math.cos(a)*7,7+Math.sin(a)*7,209,.38,.38,.25,yellow,0)}
  b.finish(scene);

  const carBuilder=new Builder(),carPaint=carBuilder.mat('taxi','#e9c665'),carGlass=carBuilder.mat('carGlass','#436b75');
  carBuilder.box(0,.65,0,1.8,.65,4,carPaint);carBuilder.box(0,1.15,-.2,1.5,.65,2.1,carGlass);
  for(const x of [-.85,.85])for(const z of [-1.25,1.25])carBuilder.box(x,.4,z,.22,.6,.65,m.roof);
  const template=new THREE.Group();carBuilder.finish(template);
  const routes=roads.filter(r=>r.width>=7&&Math.hypot(r.c[0]-r.a[0],r.c[1]-r.a[1])>75).slice(0,24);
  const cars=template.children.map(mesh=>{
    const instances=new THREE.InstancedMesh(mesh.geometry,mesh.material,routes.length);
    instances.castShadow=instances.receiveShadow=true;instances.frustumCulled=false;scene.add(instances);return instances;
  });
  const carTransform=new THREE.Object3D();
  const boat=new THREE.Group(),bb=new Builder();
  bb.box(0,1,0,8,2,27,m.ivory);bb.box(0,2.4,-2,6.8,1.7,16,m.glass);bb.box(0,3.5,-2,7,.4,17,m.ivory);bb.finish(boat);scene.add(boat);
  const river=data.rivers[0].segments,riverPoints=[river[0][0],...river.map(s=>s[1])].filter(p=>Math.abs(p[0])<950&&Math.abs(p[1])<1000);
  const route=new THREE.CatmullRomCurve3(riverPoints.map(([x,z])=>new THREE.Vector3(x,.2,z)));
  // An ICE-like white train rolls along the terminal approach.
  const train=new THREE.Group(),tb=new Builder();
  for(let i=0;i<5;i++){tb.box(i*23,2,0,21,3.5,3,m.ivory);tb.box(i*23,2.6,0,19,.9,3.06,m.glass);tb.box(i*23,1.5,0,21,.25,3.08,m.brick)}
  tb.finish(train);scene.add(train);
  return time=>{
    for(let i=0;i<routes.length;i++){
      const r=routes[i],phase=i*.17;
      const dx=r.c[0]-r.a[0],dz=r.c[1]-r.a[1],length=Math.hypot(dx,dz),t=(time*6/length+phase)%1;
      carTransform.position.set(r.a[0]+dx*t-dz/length*1.8,.12,r.a[1]+dz*t+dx/length*1.8);carTransform.rotation.y=Math.atan2(dx,dz);carTransform.updateMatrix();
      for(const instances of cars)instances.setMatrixAt(i,carTransform.matrix);
    }
    for(const instances of cars)instances.instanceMatrix.needsUpdate=true;
    const t=(time*.002+.32)%1,direction=route.getTangent(t);boat.position.copy(route.getPoint(t));boat.rotation.y=Math.atan2(direction.x,direction.z);
    const travel=Math.sin(time*.04)*65;
    train.position.set(-880+travel,.1,492-travel*.287);train.rotation.y=.28;
  };
}

function addSky(scene,rand){
  const sky=new THREE.Mesh(new THREE.SphereGeometry(2300,24,16),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,toneMapped:false,
    uniforms:{top:{value:new THREE.Color('#55ace4')},bottom:{value:new THREE.Color('#c6dfe5')}},
    vertexShader:'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`varying vec3 vDirection;uniform vec3 top;uniform vec3 bottom;void main(){
      float h=pow(max(normalize(vDirection).y,0.0),0.55);gl_FragColor=vec4(mix(bottom,top,h),1.0);
      #include <colorspace_fragment>
    }`,
  }));sky.renderOrder=-100;scene.add(sky);
  const b=new Builder(),cloud=b.mat('cloud','#fff9e6',{roughness:1});
  for(let i=0;i<16;i++){
    const a=i/16*Math.PI*2,r=850+rand()*300,x=Math.cos(a)*r,z=Math.sin(a)*r,y=320+rand()*90;
    for(let j=0;j<4;j++)b.sphere(x+j*24,y+Math.sin(j)*9,z,32,12+j*2,20,cloud,1);
  }
  const first=scene.children.length;b.finish(scene);
  for(const mesh of scene.children.slice(first))mesh.castShadow=false;
  return sky;
}

export function createMap(scene){
  const rand=seededRandom(6011),b=new Builder(),normal=facadeTexture(),high=facadeTexture(true);
  const m={
    glass:b.mat('glass','#74afbf',{roughness:.27,metalness:.38,side:THREE.DoubleSide}),
    ivory:b.mat('ivory','#f2ecd7',{roughness:.65}),stone:b.mat('stone','#dac99f'),
    brick:b.mat('brick','#b7745a'),metal:b.mat('metal','#a6bec0',{metalness:.38,roughness:.38}),
    roof:b.mat('roof','#607c7c'),walls:[],facades:[],roofs:[],
    facadeGlass:b.mat('facadeGlass','#e2edf0',{map:high,roughness:.4,metalness:.25}),
    facadeStone:b.mat('facadeStone','#efdbb4',{map:normal}),facadeBrick:b.mat('facadeBrick','#c08465',{map:normal}),
  };
  for(const color of ['#e3c6a1','#e8d7b7','#dba890','#c9cab0','#e3bca3','#d5c9b5']){
    m.walls.push(new THREE.MeshStandardMaterial({color,roughness:.85}));
    m.facades.push(new THREE.MeshStandardMaterial({color,map:normal,roughness:.72}));
  }
  for(const color of ['#be775c','#93766a','#939e92','#697f7d'])m.roofs.push(new THREE.MeshStandardMaterial({color,roughness:.88,side:THREE.DoubleSide}));
  const city=buildCity(scene,m),skyline=buildSkyline(scene,m),buildings=[...city.buildings,...skyline.buildings];
  const life=addLife(scene,buildings,city.roads,m,rand),sky=addSky(scene,rand);
  const terrace=new THREE.Vector3(-44,2.1,34),spawn=[-65,112,140],vtolSpawn=[-70,132,145];
  return {
    id:'frankfurt',data,sky,buildings,colliders:[...city.colliders,...skyline.colliders],
    update(time){city.update(time);life(time)},
    theme:{background:'#c6dfe5',fog:'#c6dfe5',fogNear:650,fogFar:1800,sky:'#d1eeff',ground:'#c6bb84',sun:'#fff0ce',sunIntensity:2.5,ambientIntensity:.95,exposure:.99},
    officeY:0,roofY:169.5,terrace,storageKey:'little-wings-crumbs-frankfurt-v1',riverWidth:155,
    pigeonSpawn:spawn,pigeonYaw:-.44,vtolSpawn,vtolYaw:-.44,nearOffice:()=>false,inside:()=>false,zone:'Bankenviertel',
    officeLabel:'TaunusTurm plaza',waypointLabel:'TAUNUSTURM PLAZA',
    questHint:'Golden crumbs follow the park, skyline, and river.',lateHint:'Try the rooftop, Alte Oper, and the Main bridges.',
    mapLabels:[['TaunusTurm',0,0],['MAIN TOWER',-50,-240],['Hbf',-680,440],['Main',300,570],['Alte Oper',-60,-655]],
    minimapOffset:90,landmarks:{tower:{x:0,z:0,height:169.5},bridge:{x:278,z:469},station:{x:-731,z:446}},
    location(p){
      if(Math.hypot(p.x,p.z)<65)return p.y>145?'TaunusTurm · the twin crowns':'TaunusTurm · Gallusanlage';
      if(Math.hypot(p.x+50,p.z+203)<65)return'MAIN TOWER · above the skyline';
      if(Math.hypot(p.x+60,p.z+591)<90)return'Alte Oper · Opernplatz';
      if(Math.hypot(p.x+731,p.z-446)<180)return'Frankfurt Hauptbahnhof';
      if(data.water.some(w=>w.river&&contains(w.points,p.x,p.z)))return'Above the Main';
      return p.z>300?'Mainufer · the river promenade':'Frankfurt · Bankenviertel';
    },
    jump(where,mode){
      const vtol=mode==='vtol';
      if(where==='roof')return{position:[-3,vtol?190:172,0],yaw:-.4,message:'TaunusTurm. A whole skyline at your feet.'};
      if(where==='station')return{position:[-585,vtol?60:42,465],yaw:1.3,message:'Frankfurt Hauptbahnhof. Follow the five great train halls.'};
      if(where==='bridge')return{position:[247,vtol?45:19,455],yaw:-1.8,message:'Untermainbrücke. Follow the blue Main toward the old town.'};
      if(vtol)return{position:vtolSpawn,yaw:-.44};
      return{position:terrace.toArray(),yaw:.5,message:'Gallusanlage. A little shade beside TaunusTurm.'};
    },
    crumbPositions:[
      [-44,2.1,34],[-60,2.3,48],[-81,2.3,64],[-98,3,91],
      [-3,171,0],[8,70.1,35],[-50,204,-195],
      [-60,2.5,-523],[-582,3,455],[262,10,442],[676,10,340],[-31,10,771],
    ],
  };
}
