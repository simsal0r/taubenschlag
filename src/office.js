import * as THREE from 'three';
import { OFFICE_Y as Y, F, plant, sign, seededRandom } from './geometry.js';

export function buildOffice(b,scene) {
  const oak=b.mat('oak','#ccb28b');
  const oakDark=b.mat('oakdark','#b49872');
  const cream=b.mat('cream','#eee9dc');
  const white=b.mat('officewhite','#f6f3e7');
  const charcoal=b.mat('charcoal','#3c4645');
  const carpet=b.mat('carpet','#b3b6a7');
  const sage=b.mat('sage','#9da88b');
  const terra=b.mat('terracotta','#c18368');
  const mustard=b.mat('mustard','#c6ad70');
  const black=b.mat('screenframe','#303d40');
  const glass=b.mat('officeglass','#b7d9d3',{transparent:true,opacity:.16,roughness:.22,depthWrite:false,side:THREE.DoubleSide});
  const glow=b.mat('warmled','#fff1cf',{emissive:'#ffe3a1',emissiveIntensity:.6});
  const blue=b.mat('screenblue','#95b7b7',{emissive:'#4f8284',emissiveIntensity:.3});
  const random=seededRandom(707);
  const timberCanvas=document.createElement('canvas');timberCanvas.width=512;timberCanvas.height=512;
  const timber=timberCanvas.getContext('2d');
  for(let row=0;row<8;row++){
    timber.fillStyle=['#c6af88','#d0ba98','#cbb38e'][row%3];timber.fillRect(row*64,0,64,512);
    for(let grain=0;grain<90;grain++){
      timber.strokeStyle=`rgba(100,75,44,${.015+random()*.075})`;timber.lineWidth=.4+random();
      const x=row*64+random()*64;
      timber.beginPath();timber.moveTo(x,0);timber.bezierCurveTo(x+random()*6,160,x-random()*4,350,x,512);timber.stroke();
    }
    timber.fillStyle='#9e886536';timber.fillRect(row*64,0,1,512);timber.fillRect(row*64,(row%3)*170,64,1);
  }
  const timberMap=new THREE.CanvasTexture(timberCanvas);timberMap.colorSpace=THREE.SRGBColorSpace;timberMap.wrapS=timberMap.wrapT=THREE.RepeatWrapping;timberMap.repeat.set(3,5);timberMap.anisotropy=4;
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=64;shadowCanvas.height=64;
  const shadowCtx=shadowCanvas.getContext('2d'),gradient=shadowCtx.createRadialGradient(32,32,4,32,32,32);
  gradient.addColorStop(0,'rgba(58,65,48,.24)');gradient.addColorStop(1,'rgba(58,65,48,0)');
  shadowCtx.fillStyle=gradient;shadowCtx.fillRect(0,0,64,64);
  const shadowMat=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});

  b.solidBox(0,Y,0,44,.28,34,carpet,'floor');
  b.solidBox(0,Y+F-.1,0,44,.24,34,cream,'ceiling');
  // An oak promenade connects the open terrace, kitchen and shared spaces.
  b.box(11,Y+.15,0,12,.025,33,oak);
  b.add(new THREE.PlaneGeometry(12,33),new THREE.MeshStandardMaterial({map:timberMap,roughness:.82}),[11,Y+.168,0],[1,1,1],[-Math.PI/2,0,0]);
  b.solidBox(0,Y+F/2,-16.8,44,F,.2,glass,'window');
  b.solidBox(-21.8,Y+F/2,0,.2,F,34,glass,'window');
  b.solidBox(21.8,Y+F/2,0,.2,F,34,glass,'window');
  b.solidBox(-7,Y+F/2,16.8,30,F,.18,glass,'window');
  b.solidBox(19.5,Y+F/2,16.8,5,F,.18,glass,'window');
  // The opening at x=8..17 is intentionally wide enough for first-time pilots.
  for(let x=-21.5;x<=22;x+=2.75){
    b.box(x,Y+F/2,-16.75,.09,F,.12,charcoal);
    if(x<8||x>17)b.box(x,Y+F/2,16.75,.09,F,.12,charcoal);
  }
  for(let z=-16;z<17;z+=2.75){
    b.box(-21.7,Y+F/2,z,.12,F,.09,charcoal);
    b.box(21.7,Y+F/2,z,.12,F,.09,charcoal);
  }
  for(const x of [-21.7,21.7])b.box(x,Y+.85,0,.13,.05,34,charcoal);
  for(const z of [-16.75,16.75])b.box(z>0?-7:0,Y+.85,z,z>0?30:44,.05,.12,charcoal);
  // Structural columns, lift core and a pair of glass meeting rooms.
  for(const x of [-17.5,17.5])for(const z of [-12,10])b.solidBox(x,Y+F/2,z,.6,F,.6,cream,'column');
  b.solidBox(-1,Y+F/2,-12.6,9,F,7.6,oak,'core');
  for(let x=-5.35;x<3.5;x+=.18)b.box(x,Y+F/2,-8.77,.055,F,.035,oakDark);
  sign(b,'amazon',-1,Y+2.45,-8.71,4.5,1.45,{size:172,amazon:true,background:'#cfb48f',color:'#2e3b39'});
  sign(b,'BERLIN · DAY 1',-1,Y+.95,-8.7,3.3,.34,{size:54,background:'#cfb48f'});
  sign(b,'WORK HARD. HAVE FUN. MAKE HISTORY.',-10,Y+2.1,-16.61,8,.55,{size:46,background:'#eeebdf'});
  b.solidBox(11,Y+1.6,-5,10,3.05,.08,glass,'partition');
  b.solidBox(6,Y+1.6,-8,.08,3.05,6,glass,'partition');
  b.box(11,Y+3.16,-5,10,.065,.07,charcoal);
  for(const x of [6,9,12,16])b.box(x,Y+1.7,-5,.055,2.9,.07,charcoal);
  sign(b,'SPREE',14.5,Y+2.5,-4.92,1.9,.45,{size:85,background:'#eaeadd'});
  b.solidBox(11,Y+.81,-9,5.6,.13,2.5,oak,'table');
  for(const x of [8.8,13.2])b.box(x,Y+.43,-9,.12,.75,1.9,charcoal);
  for(const x of [9,11,13])for(const z of [-7.05,-10.95])chair(x,z,z>-9?0:Math.PI,sage);
  b.box(16.4,Y+1.85,-10, .1,1.3,2.3,black);
  b.box(16.32,Y+1.85,-10,.015,1.13,2.12,blue);

  // Shared desk islands, adjustable screens, task chairs and everyday clutter.
  for(const x of [-14,-7,.2])for(const z of [-3,4,11]){
    b.add(new THREE.PlaneGeometry(6,4),shadowMat,[x,Y+.172,z],[1,1,1],[-Math.PI/2,0,0]);
    b.solidBox(x,Y+.79,z,4.4,.13,1.85,oak,'desk');
    for(const dx of [-1.85,1.85])for(const dz of [-.65,.65])b.box(x+dx,Y+.42,z+dz,.08,.72,.08,white);
    b.box(x,Y+1.12,z,4.1,.6,.08,sage);
    for(const dx of [-1.06,1.06])for(const side of [-1,1]){
      const mx=x+dx,mz=z+side*.45;
      b.box(mx,Y+1.15,mz,.065,.55,.065,charcoal);
      b.box(mx,Y+1.49,mz,.92,.55,.075,black);
      b.box(mx,Y+1.49,mz+side*.046,.83,.46,.014,blue);
      b.box(mx-.1,Y+.87,mz+side*.3,.66,.035,.22,charcoal);
      b.box(mx+.55,Y+.87,mz+side*.31,.13,.045,.19,cream);
      // Tiny screen content reads as windows instead of flat monitor blocks.
      b.box(mx-.28,Y+1.49,mz+side*.057,.16,.38,.009,sage);
      for(let line=0;line<4;line++)b.box(mx+.09,Y+1.6-line*.07,mz+side*.058,.4-line*.05,.025,.01,white);
      chair(mx,z+side*1.6,side>0?0:Math.PI,charcoal);
    }
    mug(x+1.73,z+.64,white);
    b.box(x-1.8,Y+.879,z-.66,.37,.035,.48,terra,[0,.14,0]);
  }

  // Neighborhood café with timber cabinetry, coffee machine and fruit bowl.
  b.solidBox(17.7,Y+.68,-13.7,5.6,1.05,1.4,oak,'counter');
  b.box(17.7,Y+1.24,-13.7,5.8,.12,1.55,cream);
  for(let x=15.2;x<20.5;x+=.9){b.box(x,Y+.66,-12.98,.018,.95,.015,oakDark);b.box(x+.35,Y+.91,-12.94,.23,.035,.04,charcoal)}
  b.box(16.2,Y+1.63,-13.6,1.1,.7,.63,charcoal);
  b.box(16.2,Y+1.65,-13.26,.74,.2,.03,black);
  b.box(16.2,Y+1.38,-13.11,.85,.05,.32,white);
  for(const x of [15.97,16.35])b.cylinder(x,Y+1.4,-13.16,.09,.07,.19,cream);
  b.cylinder(19.5,Y+1.37,-13.5,.45,.31,.17,terra);
  for(let i=0;i<7;i++)b.sphere(19.5+Math.sin(i*2.4)*.26,Y+1.55,-13.5+Math.cos(i*2.4)*.26,.13,.14,.13,mustard,1);
  sign(b,'BUT FIRST, COFFEE.',17.6,Y+2.6,-16.62,5.2,.75,{size:87,background:'#f0ecde'});
  b.solidBox(16,Y+1.08,-.6,7,.14,1.1,oak,'table');
  for(const x of [13.5,18.5])b.box(x,Y+.58,-.6,.1,1,.6,charcoal);
  for(const x of [13.5,15.2,16.9,18.5]){
    b.cylinder(x,Y+.73,1,.3,.31,.13,sage,12);
    b.cylinder(x,Y+.4,1,.045,.045,.62,charcoal,8);
    b.cylinder(x,Y+.1,1,.3,.3,.06,charcoal,12);
  }
  mug(14,-.5,terra);mug(18,-.6,white);

  // Lounge in muted terracotta, moss and warm wood.
  b.box(13.2,Y+.17,8.5,9.3,.025,9,cream);
  b.add(new THREE.PlaneGeometry(8,7),shadowMat,[13,Y+.19,8],[1,1,1],[-Math.PI/2,0,0]);
  sofa(11.5,6.1,0,terra);sofa(16.8,9,Math.PI/2,sage);
  b.solidBox(12.6,Y+.52,9,2.4,.12,1.6,oak,'table');
  for(const x of [11.7,13.5])for(const z of [8.5,9.5])b.box(x,Y+.3,z,.07,.4,.07,charcoal);
  b.box(12.2,Y+.61,9.1,.55,.055,.7,mustard,[0,.2,0]);
  mug(13.2,9.15,white,.59);
  b.cylinder(9,Y+.5,11.8,.67,.67,.7,mustard,16);
  b.cylinder(15.7,Y+.5,12.9,.67,.67,.7,terra,16);
  // Three quiet phone booths, with a visible opening in front of each.
  for(let x=-17;x<=-9;x+=4){
    b.solidBox(x,Y+1.53,-13.4,2.5,2.9,.12,sage,'booth');
    b.solidBox(x-1.25,Y+1.53,-12.2,.12,2.9,2.5,oak,'booth');
    b.solidBox(x+1.25,Y+1.53,-12.2,.12,2.9,2.5,oak,'booth');
    b.box(x,Y+3.01,-12.2,2.6,.12,2.5,oak);
    b.box(x,Y+1.1,-12.75,2.25,.1,.8,oak);
    sign(b,x===-17?'FOCUS':x===-13?'THINK':'BUILD',x,Y+2.5,-13.3,1.8,.5,{size:100,background:'#9da88b'});
  }
  // Exposed services and suspended acoustic rafts echo public office photographs.
  for(const x of [-14,-7,0,12]){
    for(const z of [-11,-4,3,10]){
      b.box(x,Y+F-.4,z,2.8,.1,4.9,cream);
      b.box(x,Y+F-.47,z,2.25,.045,.13,glow);
      for(const dz of [-1.6,1.6])b.box(x,Y+F-.19,z+dz,.02,.3,.02,charcoal);
    }
  }
  for(const x of [-18,-3,19])b.cylinder(x,Y+F-.3,0,.095,.095,32,charcoal,8,[Math.PI/2,0,0]);
  for(const x of [-20,4,20])for(const z of [-14,3,14])plant(b,x,Y+.16,z,.95);
  plant(b,8,Y+.16,12.5,.95);plant(b,20,Y+.16,6,1.2);

  // An original small geometric print; the actual Unfold mural is on the KiezLab floor.
  const art=document.createElement('canvas');art.width=512;art.height=256;
  const ctx=art.getContext('2d');ctx.fillStyle='#e7dfcb';ctx.fillRect(0,0,512,256);
  ['#738f82','#d5ae65','#c17e70','#7b93a5'].forEach((c,i)=>{ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(i*110,256);ctx.lineTo(i*110+130,20+i*18);ctx.lineTo(i*110+220,256);ctx.fill()});
  const map=new THREE.CanvasTexture(art);map.colorSpace=THREE.SRGBColorSpace;
  b.box(4.6,Y+2.1,-11.5,.12,1.55,3.2,oakDark);
  b.add(new THREE.PlaneGeometry(3,1.35),new THREE.MeshStandardMaterial({map}),[4.68,Y+2.1,-11.5],[1,1,1],[0,Math.PI/2,0]);

  for(const p of [[-10,Y+2.8,4],[12,Y+2.8,7],[12,Y+2.8,-9]]){
    const light=new THREE.PointLight('#ffeac4',12,18,2);light.position.set(...p);scene.add(light);
  }

  function chair(x,z,rotation,material){
    const side=Math.cos(rotation);
    b.box(x,Y+.5,z,.63,.13,.65,material);
    b.box(x,Y+.86,z+side*.3,.63,.7,.09,material);
    b.cylinder(x,Y+.27,z,.045,.045,.43,charcoal,8);
    b.box(x,Y+.11,z,.68,.055,.09,charcoal);
    b.box(x,Y+.11,z,.09,.055,.68,charcoal);
    for(const dx of [-.3,.3])for(const dz of [-.3,.3])b.sphere(x+dx,Y+.08,z+dz,.06,.06,.06,charcoal,0);
  }
  function mug(x,z,material,base=.86){
    b.cylinder(x,Y+base+.105,z,.085,.07,.21,material,10);
    b.cylinder(x,Y+base+.212,z,.063,.063,.006,b.mat('coffee','#5b4738'),10);
    b.add(new THREE.TorusGeometry(.069,.023,5,10),material,[x+.092,Y+base+.12,z]);
  }
  function sofa(x,z,rotation,material){
    const group=new THREE.Group();
    const specs=[
      [0,.42,0,3,.55,1.2], [0,.87,-.53,3,1.1,.25],
      [-1.42,.72,0,.22,.8,1.3],[1.42,.72,0,.22,.8,1.3]
    ];
    for(const [dx,dy,dz,w,h,d]of specs){
      const px=x+dx*Math.cos(rotation)+dz*Math.sin(rotation);
      const pz=z-dx*Math.sin(rotation)+dz*Math.cos(rotation);
      b.box(px,Y+dy,pz,w,h,d,material,[0,rotation,0]);
    }
    const width=rotation?1.5:3.1,depth=rotation?3.1:1.5;
    b.collider(x,Y+.65,z,width,1.3,depth,'sofa');
  }
}
