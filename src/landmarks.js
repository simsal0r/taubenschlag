import * as THREE from 'three';
import { Builder, sign, plant, tree } from './geometry.js';
import { masonryTexture } from './materials.js';
import map from './neighborhood-data.json';

export const STATION={x:93,z:-67};
export const BRIDGE={x:map.bridge.center[0],z:map.bridge.center[1],angle:map.bridge.rotation};
export const bridgePoint=(x,z,y=0)=>new THREE.Vector3(BRIDGE.x+x*Math.cos(BRIDGE.angle)+z*Math.sin(BRIDGE.angle),y,BRIDGE.z-x*Math.sin(BRIDGE.angle)+z*Math.cos(BRIDGE.angle));

function arch(b,x,y,z,width,rise,depth,mat,rotation=0){
  const shape=new THREE.Shape();
  shape.moveTo(-width/2,0);shape.lineTo(-width/2,rise+.8);shape.lineTo(width/2,rise+.8);shape.lineTo(width/2,0);
  for(let i=0;i<=24;i++){
    const theta=i/24*Math.PI;
    shape.lineTo(Math.cos(theta)*width/2,Math.sin(theta)*rise);
  }
  shape.closePath();
  b.add(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false}),mat,[x,y,z-depth/2],[1,1,1],[0,rotation,0]);
  // Thin collision slices preserve the opening under the curved masonry.
  const slices=24,step=width/slices;
  for(let i=0;i<slices;i++){
    const localX=-width/2+(i+.5)*step;
    const bottom=rise*Math.sqrt(Math.max(0,1-(localX/(width/2))**2));
    const height=rise+.8-bottom;
    b.collider(x+localX,y+bottom+height/2,z,step,height,depth,'arch-masonry');
  }
}
function train(scene,type){
  const b=new Builder(),group=new THREE.Group();
  const yellow=b.mat('trainyellow',type==='U'?'#d7ab35':'#d9bf77'),red=b.mat('trainred','#ac483d'),dark=b.mat('traindark','#344c55'),roof=b.mat('trainroof','#bdc4bf');
  for(let car=0;car<4;car++){
    const x=car*15.5-23.25;
    b.box(x,1.7,0,14.9,2.8,2.75,type==='U'?yellow:red);
    b.box(x,2.4,0,14.9,1.05,2.79,yellow);
    b.box(x,3.2,0,14.9,.24,2.85,roof);
    for(const z of [-1.41,1.41]){
      b.box(x,2.45,z,13.6,.8,.035,dark);
      for(const dx of [-4.8,0,4.8]){
        b.box(x+dx,1.65,z,1.45,2.6,.055,yellow);
        b.box(x+dx,2.42,z+Math.sign(z)*.035,1.1,.85,.025,dark);
        b.box(x+dx,1.6,z+Math.sign(z)*.04,.035,2.6,.03,roof);
      }
    }
    for(const dx of [-4.9,4.9]){
      b.cylinder(x+dx,.42,0,.36,.36,2.9,dark,10,[Math.PI/2,0,0]);
      b.box(x+dx,.63,0,1.4,.38,2.45,dark);
    }
  }
  for(const x of [-30.85,30.85]){
    b.box(x,2.45,0,.06,.85,2.1,dark);
    for(const z of [-.8,.8])b.sphere(x,1.4,z,.06,.1,.15,b.mat('headlight','#fff4bf',{emissive:'#ffe6a4',emissiveIntensity:.7}),1);
  }
  b.finish(group);scene.add(group);return group;
}

export function buildStations(scene){
  const b=new Builder();
  const white=b.mat('stationcream','#e4e4d7'),steel=b.mat('stationsteel','#5a7271'),slate=b.mat('stationslate','#7c8d86'),floor=b.mat('stationfloor','#c1bbaa');
  const glass=b.mat('stationglass','#adc9c6',{transparent:true,opacity:.3,roughness:.22,depthWrite:false});
  const yellow=b.mat('stationyellow','#d9c376'),blue=b.mat('stationsign','#23485b');
  // Two separate S-Bahn island platforms, east-west below the street concourse.
  for(const z of [-78,-57]){
    b.solidBox(152,1.15,z,177,1.0,10.5,floor,'platform');
    for(const side of [-1,1]){
      b.box(152,1.68,z+side*4.65,176,.035,.48,white);
      b.box(152,1.705,z+side*4.31,176,.025,.14,yellow);
    }
    b.box(153,5.85,z,145,.2,12.3,white);
    b.box(153,6.04,z,145,.13,1.2,slate);
    for(let x=86;x<224;x+=14){
      b.box(x,3.77,z,.18,4.2,.2,steel);
      b.beam([x,5.1,z],[x,5.75,z+4.4],.06,steel);b.beam([x,5.1,z],[x,5.75,z-4.4],.06,steel);
      b.box(x,5.61,z,1.8,.06,.2,b.mat('stationlight','#fff1c6',{emissive:'#fff1c6',emissiveIntensity:.5}));
      if(x%28===2)sign(b,'Warschauer Straße',x,4.45,z+.2,7.2,.85,{size:92,background:'#23485b',color:'#f6f3e4'});
    }
    for(const x of [135,175,207]){
      b.box(x,2.15,z,3.2,.16,.7,steel);b.box(x,2.5,z+.3,3.2,.64,.13,steel);
      for(const dx of [-1.1,1.1])b.box(x+dx,1.87,z,.09,.4,.4,steel);
      b.cylinder(x+4.2,2.05,z,.28,.24,.8,steel,12);
    }
    // Real circulation is legible: stair treads, escalator and transparent lift.
    for(let i=0;i<24;i++)b.solidBox(119-i*.65,1.72+i*.24,z, .68,.28,3.3,floor,'stairs');
    for(const side of [-1,1])b.beam([119,2.7,z+side*1.7],[103.4,8.4,z+side*1.7],.055,steel);
    b.solidBox(94,4.15,z,3.1,5.1,3.3,glass,'elevator');
    for(const dx of [-1.6,1.6])for(const dz of [-1.7,1.7])b.box(94+dx,4.7,z+dz,.09,6.5,.09,steel);
    b.box(94,8,z,3.6,.2,3.7,white);
    sign(b,z===-78?'1  ·  2':'3  ·  4',133,4.6,z+.12,2.2,.8,{size:100,background:'#23485b',color:'#fff5d9'});
  }
  // The broad glazed station concourse joins Warschauer Brücke at its western end.
  b.solidBox(92,7.6,-68.5,59,.5,30,white,'concourse');
  b.solidBox(92,12,-68.5,62,.38,33,white,'roof');
  for(const z of [-83.5,-53.5]){
    b.box(92,9.8,z,58,4.1,.06,glass);
    for(let x=64;x<=121;x+=3.2)b.box(x,9.8,z,.085,4.1,.14,steel);
    b.box(92,10.15,z,58,.06,.08,steel);
  }
  for(const x of [65,91,119])for(const z of [-81,-55])b.solidBox(x,4.05,z,.48,7,.48,steel,'pillar');
  sign(b,'Warschauer Straße',92,10.25,-51.78,24,1.8,{size:65,background:'#23485b',color:'#fff9e9'});
  sign(b,'S',66.5,13.25,-51.75,2.6,2.6,{size:670,background:'#37844d',color:'#ffffff'});
  sign(b,'S3   S5   S7   S9',115,10.4,-51.7,9,1.2,{size:75,background:'#23485b',color:'#f4eaca'});
  for(const x of [75,108]){
    b.box(x,8.8,-63,1.15,1.95,.65,yellow);
    b.box(x,9.15,-62.65,.8,.6,.03,blue);
  }
  // U-Bahn terminus: separate elongated train hall with a glazed gable.
  const ub=new Builder();
  const brick=ub.mat('ubrick','#a36f51',{map:masonryTexture()}),metal=ub.mat('umetal','#476b69'),uglass=ub.mat('uglass','#91b9b7',{transparent:true,opacity:.32,depthWrite:false}),tile=ub.mat('utile','#d8ceaa');
  ub.solidBox(0,7.9,0,25,.7,142,tile,'platform');
  for(const x of [-11.8,11.8]){
    ub.solidBox(x,9.2,0,1.1,2,142,brick,'wall');
    for(let z=-69;z<71;z+=6){
      ub.solidBox(x,12.1,z,.4,5,.45,metal,'pillar');
      ub.box(x,12.1,z+2.9,.06,3.9,5.35,uglass);
    }
    ub.box(x,14.8,0,.28,.28,142,metal);
  }
  for(let z=-71;z<=71;z+=6){
    ub.beam([-12,14.8,z],[0,19,z],.075,metal);ub.beam([0,19,z],[12,14.8,z],.075,metal);
    ub.beam([-12,14.5,z],[12,14.5,z],.05,metal);
  }
  for(const side of [-1,1])ub.box(side*6,16.9,0,12.7,.15,145,metal,[0,0,side*-.337]);
  for(const x of [-3.7,3.7])ub.box(x,8.35,0,4.4,.16,136,tile);
  for(const x of [-8.8,-7.3,-.75,.75,7.3,8.8])ub.box(x,8.53,0,.06,.1,141,metal);
  for(const z of [-71,71]){
    for(const x of [-12,-6,6,12])ub.solidBox(x,11.6,z,.6,7,.6,brick,'wall');
    ub.box(0,14.7,z,25,.9,.7,brick);
  }
  sign(ub,'WARSCHAUER STRASSE',0,13.05,-71.5,19,1.25,{rotation:Math.PI,size:62,background:'#b08a65',color:'#f7ead0'});
  sign(ub,'U',-13,16,-73,2.4,2.4,{rotation:Math.PI,size:600,background:'#226698',color:'#ffffff'});
  ub.transform([61,0,126],-.166);const subwayColliders=ub.finish(scene);
  const sTrain=train(scene,'S'),uTrain=train(scene,'U');
  const uPoints=[[68,75],[62,120],[46,218],[25,335],[-5,397]];
  const north=bridgePoint(3.15,-79,14.95),south=bridgePoint(3.15,79,14.95);
  const route=new THREE.CatmullRomCurve3([...uPoints.map(p=>new THREE.Vector3(p[0],8.5,p[1])),north,south,bridgePoint(3.15,190,9)]);
  return {colliders:[...b.finish(scene),...subwayColliders],update(time){
    // Match the S-Bahn track through the station (OSM way 654481297).
    const x=((time*10+760)%1350)-650;sTrain.position.set(x,1,-73.35+x*.027);sTrain.rotation.y=-.027;
    const t=(time*.014)%1,p=route.getPointAt(t),direction=route.getTangentAt(t);
    uTrain.position.copy(p);uTrain.rotation.y=-Math.atan2(direction.z,direction.x);
    uTrain.rotation.z=Math.atan2(direction.y,Math.hypot(direction.x,direction.z));
  }};
}

export function buildBridge(scene){
  const b=new Builder(),brick=b.mat('bridgebrick','#efd0b7',{map:masonryTexture(),roughness:.92}),sand=b.mat('bridgesand','#d3b38b'),stone=b.mat('bridgestone','#b29d83'),metal=b.mat('bridgesteel','#70827d'),road=b.mat('bridgeasphalt','#8b9690');
  b.solidBox(-2.5,6.8,0,26,1.1,158,stone,'bridge');
  b.box(-6,7.4,0,15,.08,158,road);
  for(const x of [-12.7,-1.3])b.box(x,7.5,0,1.5,.045,158,b.mat('cycle','#ad9b85'));
  for(let z=-74;z<78;z+=12)b.box(-6,7.47,z,.15,.03,5,b.mat('roadline','#e7dfc1'));
  for(const z of [-79,-63,-47,-27,27,47,63,79]){
    b.solidBox(0,2.9,z,29,6.5,3.6,stone,'bridge-pier');
    for(const x of [-15,15])b.cylinder(x,2.4,z,2.1,2.8,5,stone,8);
  }
  // Seven broad lower arches, formed in the true longitudinal elevation.
  for(const x of [-15,15])for(const [z,width]of [[-71,12],[-55,12],[-37,16],[0,49],[37,16],[55,12],[71,12]]){
    const ab=new Builder(),m=brick;arch(ab,z,1,0,width,z===0?4.2:3.1,1.2,m);
    ab.transform([x,0,0],-Math.PI/2);
    for(const [mat,geometries]of ab.batches){if(!b.batches.has(mat))b.batches.set(mat,[]);b.batches.get(mat).push(...geometries)}
    b.colliders.push(...ab.colliders);
  }
  // Pedestrian arcade under the raised U-Bahn deck, with a steel middle span.
  for(const side of [-1,1])for(let z=side<0?-73:29;z<(side<0?-27:75);z+=6.7){
    b.solidBox(11.6,10.45,z,1.1,6.1,.95,brick,'arcade-pier');
    const ab=new Builder();arch(ab,z+3.35,9.1,0,5.75,3.95,1.1,brick);ab.transform([11.6,0,0],-Math.PI/2);
    for(const [mat,geometries]of ab.batches){if(!b.batches.has(mat))b.batches.set(mat,[]);b.batches.get(mat).push(...geometries)}
    b.colliders.push(...ab.colliders);
  }
  b.solidBox(6.4,14.45,0,11.5,.75,156,brick,'upper-deck');
  b.box(6.4,14.86,0,10.5,.06,156,stone);
  for(const x of [2.4,3.9,8.5,10])b.box(x,15.01,0,.075,.12,157,metal);
  for(let z=-77;z<78;z+=1.1)b.box(6.3,14.97,z,10.3,.1,.18,stone);
  for(const x of [1,11.9]){
    b.box(x,15.55,0,.48,1.3,158,brick);
    for(let z=-77;z<78;z+=2.4)b.box(x,16.35,z,.52,.65,.85,brick);
  }
  for(const x of [1.3,11.5]){
    for(let i=0;i<20;i++){
      const z0=-26+i*2.6,z1=z0+2.6,y0=8.1+4.9*(1-(z0/26)**2),y1=8.1+4.9*(1-(z1/26)**2);
      b.beam([x,y0,z0],[x,y1,z1],.24,metal);
      if(i%2===0){b.beam([x,y0,z0],[x,14.15,z0],.11,metal);b.beam([x,y0,z0],[x,14.15,z1+2.6],.1,metal)}
    }
  }
  // The two towers sit ALONG the span, on either side of its steel center section.
  for(const z of [-27,27]){
    b.solidBox(11.6,17.2,z,7.7,20.5,6.8,brick,'tower');
    b.cylinder(11.6,27,z,4.8,4.1,3.8,brick,8);
    b.cylinder(11.6,29.3,z,3.1,4.7,1.0,sand,8);
    b.cylinder(11.6,31.5,z,2.8,3.1,4.2,brick,8);
    b.cylinder(11.6,34.1,z,3.25,3.25,.65,sand,8);
    b.cylinder(11.6,38.2,z,0,3.3,7.9,b.mat('bridgespire','#74866e'),8);
    b.cylinder(11.6,42.8,z,.055,.055,2.1,metal,6);
    for(const h of [9,16.5,23.5,25.5])b.box(11.6,h,z,8,.3,7.1,sand);
    for(const side of [-1,1]){
      b.box(11.6+side*3.91,21,z,.04,2.8,1.1,b.mat('archdark','#665b4a'));
      b.box(11.6+side*3.92,21,z,.05,.12,1.3,sand);
      b.box(11.6+side*3.92,12,z,.04,1.9,2.1,sand);
    }
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4;b.cylinder(11.6+Math.cos(a)*4.25,28.8,z+Math.sin(a)*4.25,.23,.3,1.7,brick,8);
    }
  }
  // Stone balustrade, little lamps and corner turrets anchor the lower road deck.
  for(const x of [-15,15]){
    b.box(x,8.3,0,.45,.3,157,sand);
    for(let z=-77;z<=77;z+=3.7)b.box(x,7.95,z,.3,.7,.3,brick);
  }
  for(const z of [-77,77])for(const x of [-15,15]){
    b.cylinder(x,10.7,z,1.45,1.7,6,brick,8);b.cylinder(x,15.1,z,0,1.8,3.1,b.mat('bridgespire'),8);
  }
  b.transform([BRIDGE.x,0,BRIDGE.z],BRIDGE.angle);
  return b.finish(scene);
}
