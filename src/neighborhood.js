import * as THREE from 'three';
import { Builder, seededRandom, tree, sign } from './geometry.js';
import { windowTexture, pavementTexture, waterMaterial } from './materials.js';
import { pointInPolygon } from './physics.js';
import data from './neighborhood-data.json';

export { data as neighborhoodData };
// The bridge's OSM building ways describe its arcade and turrets, not houses.
const special=new Set([43704344,297153147,288514445,439029208,373626454,373626455,373626456,373626460,373626461,373626464]);
const area=points=>points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+a[0]*b[1]-b[0]*a[1]},0)/2;
export function buildNeighborhood(scene){
  const b=new Builder(),random=seededRandom(641),updates=[];
  const ground=b.mat('ground','#bfc7a9'),paving=b.mat('paving','#eee6d3',{map:pavementTexture()}),asphalt=b.mat('asphalt','#9a9d91'),footpath=b.mat('footpath','#d0c5ac'),railSteel=b.mat('railsteel','#607172',{metalness:.45,roughness:.5}),railWood=b.mat('railwood','#8c8472'),ballast=b.mat('ballast','#a7a99b'),stone=b.mat('stone','#c4bdad'),roof=b.mat('roof','#9b9d91');
  b.box(0,-.5,0,6000,1,6000,ground);
  // River centerlines, road traces and footprints are transformed from the same OSM snapshot.
  const water=waterMaterial();updates.push(water.update);
  for(const river of data.rivers)for(const [a,c]of river.segments){
    const dx=c[0]-a[0],dz=c[1]-a[1],length=Math.hypot(dx,dz);
    const nx=-dz/length*71.5,nz=dx/length*71.5;
    b.polygon([[a[0]+nx,a[1]+nz],[c[0]+nx,c[1]+nz],[c[0]-nx,c[1]-nz],[a[0]-nx,a[1]-nz]],.12,0,water.material);
    b.add(new THREE.CircleGeometry(71.5,32),water.material,[a[0],.12,a[1]],[1,1,1],[-Math.PI/2,0,0]);
    for(const side of [-1,1]){
      const offset=[-dz/length*side*76,dx/length*side*76];
      const aa=[a[0]+offset[0],a[1]+offset[1]],cc=[c[0]+offset[0],c[1]+offset[1]];
      b.segment(aa,cc,.28,8,.35,paving);
      b.segment([aa[0]+dz/length*side*3.3,aa[1]-dx/length*side*3.3],[cc[0]+dz/length*side*3.3,cc[1]-dx/length*side*3.3],.4,.65,.7,stone);
      if(length<600)for(let t=18;t<length;t+=26){
        const x=aa[0]+dx/length*t,z=aa[1]+dz/length*t;
        if(!data.buildings.some(v=>pointInPolygon(x,z,v.points)))tree(b,x,.5,z,1.15,Math.floor(t)%3===0);
      }
    }
  }
  let streetDetails=0;
  for(const road of data.roads){
    if(road.name==='Oberbaumbrücke')continue;
    const pedestrian=['footway','pedestrian','cycleway'].includes(road.kind);
    const width=road.width||({primary:8,secondary:8,tertiary:7,residential:6,unclassified:6,service:4,pedestrian:7,footway:1.7,cycleway:2.1}[road.kind]);
    for(const [a,c]of road.segments){
      const dx=c[0]-a[0],dz=c[1]-a[1],length=Math.hypot(dx,dz),cx=(a[0]+c[0])/2,cz=(a[1]+c[1])/2;
      const y=road.bridge?7.62:.1;
      if(!pedestrian)b.segment(a,c,y-.03,width+3.5,.1,paving);
      b.segment(a,c,y,width,.06,pedestrian?footpath:asphalt);
      if(road.bridge&&length>8){
        b.segment(a,c,7.1,width,.9,stone,'road-bridge');
        for(const side of [-1,1]){
          const nx=-dz/length*side*(width/2+.3),nz=dx/length*side*(width/2+.3);
          b.segment([a[0]+nx,a[1]+nz],[c[0]+nx,c[1]+nz],8.3,.07,.07,railSteel);
        }
      }
      if(!pedestrian&&length>12&&width>=6){
        for(let d=4;d<length-4;d+=10)b.segment([a[0]+dx*d/length,a[1]+dz*d/length],[a[0]+dx*(d+4)/length,a[1]+dz*(d+4)/length],y+.045,.13,.02,b.mat('markings','#e9e4cd'));
      }
      if(streetDetails<120&&length>18&&Math.hypot(cx,cz)<460&&!road.bridge&&!pedestrian){
        streetDetails++;
        const nx=-dz/length*(width/2+2),nz=dx/length*(width/2+2);
        const x=cx+nx,z=cz+nz;
        b.cylinder(x,3.6,z,.065,.1,7.1,railSteel,6);
        b.box(x,7.15,z,1.45,.12,.45,b.mat('lamps','#d0d3c0'));
        if(streetDetails%2===0&&!data.buildings.some(v=>pointInPolygon(x+nx*.4,z+nz*.4,v.points)))tree(b,x+nx*.4,.1,z+nz*.4,1.1+random()*.45,streetDetails%7===0);
      }
    }
  }
  for(const rail of data.rails){
    if(rail.kind==='tram')continue;
    for(const [a,c]of rail.segments){
      const dx=c[0]-a[0],dz=c[1]-a[1],length=Math.hypot(dx,dz),x=(a[0]+c[0])/2,z=(a[1]+c[1])/2;
      if(rail.kind==='subway'&&z>427&&z<597)continue;
      if(rail.kind==='subway'&&z>50&&z<199&&x>30&&x<90)continue;
      const y=rail.kind==='subway'?8.5+Math.max(0,Math.min(1,(z-320)/110))*6.5:1.01;
      b.segment(a,c,y-.34,3.6,.35,ballast);
      for(const side of [-1,1]){
        const ox=-dz/length*side*.75,oz=dx/length*side*.75;
        b.segment([a[0]+ox,a[1]+oz],[c[0]+ox,c[1]+oz],y,.075,.13,railSteel);
      }
      if(Math.hypot(x,z)<350||rail.kind==='subway'){
        for(let d=0;d<length;d+=2.4){
          const px=a[0]+dx*d/length,pz=a[1]+dz*d/length;
          b.box(px,y-.15,pz,2.6,.14,.23,railWood,[0,-Math.atan2(dz,dx)+Math.PI/2,0]);
        }
      }
      if(rail.kind==='subway'){
        b.segment(a,c,y-.85,4.1,.8,railSteel,'viaduct');
        for(let d=10;d<length;d+=22){
          const px=a[0]+dx*d/length,pz=a[1]+dz*d/length;
          b.cylinder(px,y/2-.5,pz,.35,.45,y-1,railSteel,8);
        }
      }
    }
  }
  const windowMats=[false,true].map(warm=>new THREE.MeshStandardMaterial({map:windowTexture(warm),alphaTest:.4,roughness:.55,userData:{surfaceOverlay:true}}));
  const wallColors=['#ccbd9f','#c3bcab','#c1a68d','#d4c6ad','#aeb9ac','#cbb298','#b4b6a4'];
  const buildings=[];
  for(const building of data.buildings){
    if(special.has(building.id)||building.kind==='bridge')continue;
    const points=area(building.points)>0?[...building.points].reverse():building.points;
    const cx=points.reduce((s,p)=>s+p[0],0)/points.length,cz=points.reduce((s,p)=>s+p[1],0)/points.length;
    const distance=Math.hypot(cx,cz),near=distance<470,height=building.height;
    if(Math.abs(area(points))<12)continue;
    const color=wallColors[building.id%wallColors.length],wall=b.mat(`facade-${color}`,color);
    const bottom=building.kind==='train_station'?1:.1;
    b.polygon(points,bottom,height,wall,'building');
    b.polygon(points,bottom+height+.015,.3,roof);
    for(let i=0;i<points.length;i++){
      const a=points[i],c=points[(i+1)%points.length],dx=c[0]-a[0],dz=c[1]-a[1],length=Math.hypot(dx,dz);
      if(length<1)continue;
      if(near){
        b.segment(a,c,height+.4,.6,.25,b.mat('cornice','#d4ccbb'));
        b.segment(a,c,1.1,.25,.35,stone);
      }
      if(length>3&&height>5&&distance<670){
        const geo=new THREE.PlaneGeometry(length,height-2.6),uv=geo.getAttribute('uv');
        for(let j=0;j<uv.count;j++)uv.setXY(j,uv.getX(j)*length/3.6,uv.getY(j)*(height-2.6)/3.25);
        b.add(geo,windowMats[building.id%5===0?1:0],[(a[0]+c[0])/2-dz/length*.06,(height+2.6)/2,(a[1]+c[1])/2+dx/length*.06],[1,1,1],[0,-Math.atan2(dz,dx),0]);
      }
    }
    if(near&&height>8&&pointInPolygon(cx,cz,points)){
      b.box(cx,height+1.2,cz,3.8,1.4,2.3,b.mat('hvac','#b7baad'));
      for(let j=0;j<5;j++)b.box(cx-1.5+j*.65,height+1.92,cz,.2,.025,1.9,railSteel);
      if(building.id%3===0){
        for(let j=0;j<3;j++)if(pointInPolygon(cx+6,cz+j*2.2,points))b.box(cx+6,height+.65,cz+j*2.2,4.1,.12,1.8,b.mat('solar','#527278',{metalness:.2}),[-.15,0,0]);
      }
    }
    if(building.id===615700425){
      sign(b,'EAST SIDE MALL',-112,12.4,-20,45,3.2,{size:76,background:'#7b847d',color:'#f5ecda',rotation:Math.PI});
      for(let x=-185;x<-45;x+=2.6)b.box(x,10,-20,.12,15,.17,b.mat('mallfins','#aaac8e'));
      for(let x=-170;x<-50;x+=23)tree(b,x,height+.4,5,1.1);
    }
    if(building.kind==='arena'){
      for(let x=-366;x<-286;x+=5)b.box(x,28.5,64,.3,.3,101,b.mat('arenaribs','#c3c7be'));
      sign(b,'UBER ARENA',-321,20,-22,39,3.2,{rotation:Math.PI,size:93,background:'#aeb9ac',color:'#3d6765'});
    }
    buildings.push({x:cx,z:cz,w:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),d:Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1])),h:height,points});
  }
  // Small human-scale details on the paved station approach.
  for(let i=0;i<32;i++){
    const x=72+random()*157,z=i<16?-57:-78,y=1.75;
    const jacket=b.mat(`coat${i%4}`,['#7b8d86','#bc8f76','#b6a76e','#758694'][i%4]);
    b.cylinder(x,y+.72,z,.18,.2,.7,jacket,7);b.sphere(x,y+1.23,z,.16,.2,.16,b.mat('skin','#ccaa89'),1);
    for(const dx of [-.095,.095])b.box(x+dx,y+.23,z,.1,.48,.13,railSteel);
  }
  for(let i=0;i<16;i++){
    const x=33+i*1.65,z=25;
    for(const dz of [-.63,.63])b.add(new THREE.TorusGeometry(.35,.036,5,12),railSteel,[x,.57,z+dz],[1,1,1],[0,Math.PI/2,0]);
    b.beam([x,.56,z-.6],[x,1.05,z],.027,railSteel);b.beam([x,1.05,z],[x,.56,z+.6],.027,railSteel);
    b.box(x,1.11,z,.26,.05,.21,railWood);
  }
  for(let i=0;i<13;i++){
    const x=-14-i*14,z=36+i*2;
    if(!buildings.some(v=>pointInPolygon(x,z,v.points))){
      tree(b,x,.1,z,1.3);
      b.box(x+3,.7,z,3,.15,.75,railWood);
      for(const dx of [2,4])b.box(x+dx,.37,z,.08,.6,.65,railSteel);
    }
  }
  // Low gallery wall follows Mühlenstraße; the paintings are original abstractions.
  const gallery=data.roads.find(r=>r.name==='Mühlenstraße'&&r.segments.length>3);
  if(gallery)for(const [a,c]of gallery.segments){
    const length=Math.hypot(c[0]-a[0],c[1]-a[1]);
    if(length<8)continue;
    for(let d=0;d<length;d+=4){
      const t=d/length,x=a[0]+(c[0]-a[0])*t,z=a[1]+(c[1]-a[1])*t+9;
      b.box(x,1.65,z,3.8,3,.2,b.mat(`mural${Math.floor(d)%4}`,['#b58675','#a5b5a3','#c6b174','#929caf'][Math.floor(d)%4]),[0,-Math.atan2(c[1]-a[1],c[0]-a[0]),0]);
    }
  }
  const boat=new THREE.Group(),bb=new Builder(),ivory=bb.mat('boatwhite','#ebe4cc'),teal=bb.mat('boatteal','#638c8e');
  bb.box(0,.7,0,22,1.4,6,ivory);bb.box(0,2,0,15,1.6,4.4,teal);bb.box(0,2.9,0,16,.25,5.2,ivory);
  for(let x=-6;x<7;x+=1.7)for(const z of [-2.23,2.23])bb.box(x,2,z,1.3,.95,.035,bb.mat('boatglass','#a2c5c3'));
  bb.finish(boat);scene.add(boat);
  const riverSegment=data.rivers.flatMap(r=>r.segments).find(([a,c])=>Math.abs((a[0]+c[0])/2)<400)||data.rivers[0].segments[0];
  updates.push(time=>{const [a,c]=riverSegment,t=(Math.sin(time*.017)+1)/2;boat.position.set(a[0]+(c[0]-a[0])*t,.14+Math.sin(time)*.04,a[1]+(c[1]-a[1])*t);boat.rotation.y=-Math.atan2(c[1]-a[1],c[0]-a[0])});
  // These untextured materials differ only in base color. Vertex colors retain
  // the entire palette while avoiding a separate draw for each color per cell.
  const colored=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8});
  const combined=[];
  for(const [material,geometries] of b.batches){
    if(!material.isMeshStandardMaterial||material.map||material.transparent||material.vertexColors||
      material.metalness!==0||material.roughness!==.8||material.emissive.getHex()!==0||material.side!==THREE.FrontSide)continue;
    for(const geometry of geometries){
      const count=geometry.attributes.position.count,colors=new Float32Array(count*3);
      for(let i=0;i<count;i++)material.color.toArray(colors,i*3);
      geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));combined.push(geometry);
    }
    b.batches.delete(material);
  }
  b.batches.set(colored,combined);
  return{colliders:b.finish(scene,{cellSize:640}),buildings,update:time=>updates.forEach(fn=>fn(time))};
}
