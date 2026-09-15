import * as THREE from 'three';
import { Builder, sign } from '../geometry.js';

// Frankfurt Hbf: original geometry loosely based on the real façade and halls.
// Five train sheds share the surveyed station axis.
export function buildFrankfurtStation(scene){
  const b=new Builder(),stone=b.mat('sandstone','#d2bd94'),light=b.mat('carvedStone','#e5d3ac');
  const dark=b.mat('recess','#596364'),steel=b.mat('steel','#557274',{metalness:.55,roughness:.45});
  const glass=b.mat('glass','#729ba9',{metalness:.25,roughness:.35,side:THREE.DoubleSide});
  const copper=b.mat('copper','#64877b',{metalness:.3,roughness:.7}),platform=b.mat('platform','#c6c6b5');
  const rail=b.mat('rail','#8a9997',{metalness:.6,roughness:.4}),ballast=b.mat('ballast','#73736c');
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#94b5bc';ctx.fillRect(0,0,128,128);
  ctx.fillStyle='#b4cccc';ctx.fillRect(3,3,57,122);ctx.fillStyle='#71969e';ctx.fillRect(65,3,60,122);
  ctx.fillStyle='#405d60';ctx.fillRect(0,0,128,3);ctx.fillRect(0,0,3,128);ctx.fillRect(62,0,3,128);ctx.fillRect(0,63,128,3);
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
  const roof=b.mat('glazedRoof','#ffffff',{map:texture,roughness:.48,metalness:.25,side:THREE.DoubleSide});
  for(let hall=0;hall<5;hall++){
    const z=(hall-2)*40,half=hall===0||hall===4?17:20,rise=hall===0||hall===4?13:19;
    for(let i=0;i<20;i++){
      const a=i/20*Math.PI,c=(i+1)/20*Math.PI,ya=9+Math.sin(a)*rise,yc=9+Math.sin(c)*rise,za=z+Math.cos(a)*half,zc=z+Math.cos(c)*half;
      const g=new THREE.BufferGeometry(),length=220,width=Math.hypot(yc-ya,zc-za);
      g.setAttribute('position',new THREE.Float32BufferAttribute([-140,ya,za,80,ya,za,80,yc,zc,-140,ya,za,80,yc,zc,-140,yc,zc],3));
      g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,length/5,0,length/5,width/3,0,0,length/5,width/3,0,width/3],2));g.computeVertexNormals();b.add(g,roof);
      for(let x=-140;x<=80;x+=20)b.beam([x,ya+.13,za],[x,yc+.13,zc],.14,steel);
      if(i%2===0)b.beam([-140,ya+.15,za],[80,ya+.15,za],.11,steel);
      // Thin stepped shell colliders allow flight through the open train sheds.
      b.collider(-30,(ya+yc)/2,z+(Math.cos(a)+Math.cos(c))*half/2,220,Math.abs(yc-ya)+.4,Math.abs(zc-za)+.25,'Hauptbahnhof glass roof');
    }
    for(const side of [-half,half]){
      b.box(-30,7,z+side,220,.65,.8,steel);
      for(let x=-138;x<82;x+=20){b.cylinder(x,4.2,z+side,.25,.35,8.4,steel,8);b.beam([x,5.5,z+side],[x+3,8,z+side],.13,steel)}
    }
    // Platforms, four rails per shed, buffer stops, edge markings and clocks.
    for(const dz of [-10,10]){
      b.solidBox(-35,.55,z+dz,225,1.1,7,platform,'Hauptbahnhof platform');
      for(const side of [-3.1,3.1])b.box(-35,1.12,z+dz+side,222,.04,.18,light);
      for(let x=-135;x<68;x+=24){
        b.box(x,2,z+dz,3,.25,.6,copper);b.box(x,2.45,z+dz+.3,3,.7,.13,copper);
        b.cylinder(x,3,z+dz-1.6,.055,.08,6,steel,6);b.box(x,6,z+dz-1.6,1.4,.2,.3,light);
      }
    }
    for(const dz of [-17,-3,3,17]){
      b.box(-40,.14,z+dz,240,.18,2.3,ballast);
      for(const side of [-.72,.72])b.box(-40,.32,z+dz+side,240,.16,.08,rail);
      for(let x=-159;x<76;x+=2.4)b.box(x,.21,z+dz,.2,.2,2.1,dark);
      b.box(77,1.1,z+dz,.5,1.8,2.6,steel);b.box(76.8,1.75,z+dz,.6,.25,2.8,light);
    }
    b.box(-28,9+rise+.25,z,190,.3,3.2,steel);
    sign(b,`${hall*4+1} – ${hall*4+4}`,64,5.7,z,4,1,{rotation:Math.PI/2,background:'#294550',color:'#fff4dc',size:125});
  }
  // Cross concourse and long sandstone side wings.
  b.solidBox(87,8,0,15,16,208,stone,'Hauptbahnhof concourse');
  for(const z of [-102,102])b.solidBox(-20,7,z,235,14,7,stone,'Hauptbahnhof outer wall');
  for(const side of [-1,1]){
    b.solidBox(94,10.5,side*68,22,21,66,stone,'Hauptbahnhof station wing');
    b.box(96,21.7,side*68,24,1.1,68,light);
    b.box(94,25,side*68,18,6,62,copper);b.box(94,28.3,side*68,12,.6,62,steel);
    for(let z=38;z<=96;z+=8){
      arch(106,.3,side*z,5.3,8.8);arch(106,12,side*z,4.5,6);
      b.box(106.25,10.5,side*z,.55,.6,7.2,light);
    }
  }
  // Central monumental portal: arched fanlight, rusticated piers and carved cornices.
  b.solidBox(98,6.8,0,14,13.6,61,stone,'Hauptbahnhof entrance');
  for(const z of [-24,-12,0,12,24])arch(105.1,.2,z,8.3,11.8);
  for(const z of [-30,-18,-6,6,18,30]){
    b.box(105.5,7,z,1.7,14,1.8,light);
    for(let y=1;y<14;y+=1.25)b.box(106.4,y,z,.3,.14,2,stone);
    b.box(106,13.2,z,2.2,.8,2.7,light);
  }
  for(const y of [13.8,14.6])b.box(103,y,0,20,.5,64,light);
  arch(103.9,14.5,0,45,22.5,2.7);
  for(const z of [-26,26]){
    b.solidBox(100,24,z,8,20,5.5,stone,'Hauptbahnhof portal pier');
    for(let y=16;y<34;y+=1.25)b.box(104.2,y,z,.4,.14,5.8,light);
    b.box(100,34.6,z,9,1,7,light);b.box(100,36.2,z,5.8,2.3,4.8,stone);
    b.sphere(100,38.5,z,2.6,2.7,2.6,copper,2);b.cylinder(100,41,z,.12,.35,2,steel,8);
  }
  clock(107,17.9,0,1.6);
  for(const z of [-26,26])clock(104.2,36.4,z,.7);
  // Atlas carries the globe; two smaller allegorical figures flank the pedestal.
  b.box(99,39.2,0,5,1.5,6,light);
  b.sphere(99,43.9,0,1.6,1.6,1.6,copper,2);
  b.sphere(99,41.6,0,.65,1.1,.85,steel,1);
  b.sphere(99,42.5,-.6,.4,.4,.4,steel,1);
  for(const side of [-1,1]){
    b.beam([99,40.8,side*.4],[99+side*.6,39.9,side*1.1],.23,steel);
    b.beam([99,42,side*.65],[99,43.5,side*1.1],.19,steel);
    b.sphere(99,40.8,side*2,.42,.85,.48,copper,1);b.sphere(99,41.6,side*2,.3,.3,.3,copper,1);
  }
  sign(b,'HAUPTBAHNHOF',104.7,29,0,15,1.5,{rotation:Math.PI/2,color:'#e4decc',background:'#365965',size:90});
  sign(b,'DB',104.8,31.6,0,2.5,1.8,{rotation:Math.PI/2,color:'#ffffff',background:'#c64b42',size:330});
  b.transform([-731,0,446],.28);const group=new THREE.Group();group.name='Frankfurt Hauptbahnhof · five halls';b.finish(group);scene.add(group);
  return b.colliders;

  function arch(x,y,z,width,height,rim=.45){
    const r=width/2,spring=Math.max(0,height-r),shape=new THREE.Shape();
    shape.moveTo(-r,0);shape.lineTo(r,0);shape.lineTo(r,spring);shape.absarc(0,spring,r,0,Math.PI,false);shape.lineTo(-r,0);
    b.add(new THREE.ShapeGeometry(shape,20),glass,[x,y,z],[1,1,1],[0,Math.PI/2,0]);
    for(let i=0;i<24;i++){
      const a=i/24*Math.PI,c=(i+1)/24*Math.PI;
      b.beam([x+.12,y+spring+Math.sin(a)*(r+rim/2),z+Math.cos(a)*(r+rim/2)],[x+.12,y+spring+Math.sin(c)*(r+rim/2),z+Math.cos(c)*(r+rim/2)],rim/2,light);
      if(rim>1&&i%2===0)b.beam([x+.2,y+spring+Math.sin(a)*r,z+Math.cos(a)*r],[x+.2,y+spring+Math.sin(a)*(r+rim),z+Math.cos(a)*(r+rim)],.11,stone);
    }
    for(let u=-r+width/6;u<r;u+=width/6){const top=spring+Math.sqrt(r*r-u*u);b.box(x+.08,y+top/2,z+u,.15,top,.12,steel)}
    for(let v=3;v<height;v+=3){const half=v<spring?r:Math.sqrt(Math.max(0,r*r-(v-spring)**2));b.box(x+.09,y+v,z,.16,.12,half*2,steel)}
    if(width>20)b.collider(x,y+height/2,z,.5,height,width,'Hauptbahnhof arched glass');
  }
  function clock(x,y,z,r){
    b.cylinder(x,y,z,r,r,.15,light,32,[0,0,Math.PI/2]);
    for(let i=0;i<12;i++){
      const a=i/12*Math.PI*2;b.beam([x+.12,y+Math.cos(a)*r*.72,z+Math.sin(a)*r*.72],[x+.12,y+Math.cos(a)*r*.88,z+Math.sin(a)*r*.88],r*.028,dark);
    }
    b.beam([x+.2,y,z],[x+.2,y+r*.52,z-r*.22],r*.05,dark);
    b.beam([x+.2,y,z],[x+.2,y-r*.22,z+r*.68],r*.035,dark);
  }
}
