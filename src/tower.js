import { Builder, F, OFFICE_Y, ROOF_Y, seededRandom, tree, plant, sign } from './geometry.js';
import { buildOffice } from './office.js';

export function buildTower(scene){
  const b=new Builder(),rand=seededRandom(619);
  const slab=b.mat('towerframe','#c3ccca',{roughness:.53,metalness:.25});
  const frame=b.mat('darkframe','#60716f',{roughness:.55,metalness:.25});
  const inset=b.mat('inset','#536969');
  const glass=[b.mat('glass1','#85a5ad',{roughness:.31,metalness:.28}),b.mat('glass2','#90aeb3',{roughness:.35,metalness:.22}),b.mat('glass3','#7d9fa9',{roughness:.3,metalness:.32}),b.mat('glass4','#9cafab',{roughness:.38,metalness:.25})];
  const concrete=b.mat('concrete','#dedbd0');
  const wood=b.mat('deck','#baa486');
  const lawn=b.mat('lawn','#adb98b');
  const dark=b.mat('roof','#8b9790');
  const pavement=b.mat('pavement','#d9d8c9');
  const road=b.mat('road','#b2b8b0');
  const roadline=b.mat('roadline','#e2e2cd');
  const water=b.mat('water','#89b6b3',{roughness:.26,metalness:.3});
  const brick=b.mat('bridgebrick','#b57c64');
  const waterShine=b.mat('watershine','#b0d1c2',{transparent:true,opacity:.48,depthWrite:false});
  const glow=b.mat('windowswarm','#b5b9a0',{emissive:'#ebc98a',emissiveIntensity:.025});
  b.box(0,.25,0,97,.45,73,pavement);
  // Tower: 36 storeys, 142m; four facade bays with diagonal one-storey recesses.
  for(let floor=0;floor<36;floor++){
    if(floor===19)continue;
    const y=floor*F;
    for(let col=0;col<4;col++){
      if(floor>32+col)continue;
      const x=-16.5+col*11;
      const recess=floor>=7&&((floor-col-7)%7===0);
      const podium=floor<7+col;
      const depth=podium?27:recess?26:34;
      const z=(podium||recess)?-1:0;
      const mat=recess?inset:glass[(floor+col)%3];
      b.solidBox(x,y+F/2,z,10.96,F-.15,depth,mat,'tower');
      b.box(x,y+.04,z,11.04,.23,depth+.3,podium?frame:slab);
      const front=z+depth/2+.05,back=z-depth/2-.05;
      for(const faceZ of [front,back]){
        b.box(x,y+F-.2,faceZ,11,.16,.1,podium?frame:slab);
        b.box(x,y+1.05,faceZ,11,podium?.45:.16,.12,podium?frame:slab);
        for(let k=0;k<=5;k++)b.box(x-5.5+k*2.2,y+F/2,faceZ,.085,F,.13,podium?frame:slab);
        for(let k=0;k<5;k++){
          const m=rand()>.965?glow:glass[Math.floor(rand()*3)];
          b.box(x-4.4+k*2.2,y+2.42,faceZ+.012,2.04,2.4,.045,m);
        }
      }
      if(col===0||col===3){
        const xx=x+(col===0?-5.52:5.52);
        b.box(xx,y+1.05,z,.12,.16,depth,slab);
        b.box(xx,y+F-.2,z,.12,.16,depth,slab);
        for(let zz=z-depth/2;zz<=z+depth/2;zz+=2.15)b.box(xx,y+F/2,zz,.13,F,.075,slab);
      }
      if(recess){
        b.box(x,y-.03,15,11,.23,4.3,wood);
        b.box(x,y+.65,17.1,10.8,.06,.07,frame);
        for(const dx of [-5,0,5])b.box(x+dx,y+.35,17.1,.05,.7,.05,frame);
        for(const dx of [-3.5,3.5])plant(b,x+dx,y+.1,15.2,.8);
      }
    }
  }
  for(let col=0;col<4;col++){
    const x=-16.5+col*11,y=(33+col)*F;
    b.solidBox(x,y,0,11,.35,34,slab,'roof');
    b.box(x,y+.22,0,10.5,.08,33,wood);
    b.box(x,y+.35,-5,7.5,.3,12,lawn);
    b.box(x,y+.65,16.7,11,.08,.12,frame);
    for(let xx=x-5;xx<x+5.5;xx+=2.5)b.box(xx,y+.43,16.7,.06,.7,.06,frame);
    for(const zz of [-10,-2])tree(b,x,y+.45,zz,.73);
    b.box(x,y+.6,7,5.7,.7,1,wood);
  }
  b.box(21.7,139.6,0,.1,4.3,34,frame);
  for(let z=-16;z<=16;z+=1.4)b.box(21.8,140,z,.14,3.8,.15,slab);
  // Accessible game terrace on the representative office floor.
  b.solidBox(11,OFFICE_Y,20,22,.36,7,wood,'terrace');
  for(let x=.5;x<22;x+=.75)b.box(x,OFFICE_Y+.19,20,.035,.012,7,b.mat('deckgap','#a18e75'));
  b.box(11,OFFICE_Y+1.22,23.5,22,.07,.1,frame);
  b.collider(11,OFFICE_Y+.68,23.5,22,1.1,.1,'railing');
  // Rendering a low railing with glass; collision allows flying over it.
  b.box(11,OFFICE_Y+.65,23.45,22,1.08,.035,b.mat('terraceglass','#b3d0c3',{transparent:true,opacity:.2,depthWrite:false}));
  for(let x=0;x<=22;x+=2.75)b.box(x,OFFICE_Y+.66,23.45,.05,1.1,.06,frame);
  b.solidBox(0,OFFICE_Y+.6,20,.16,1.1,7,frame,'railing');
  b.solidBox(22,OFFICE_Y+.6,20,.16,1.1,7,frame,'railing');
  for(const x of [2.2,20]){
    b.box(x,OFFICE_Y+.45,20,2.5,.7,2,concrete);
    tree(b,x,OFFICE_Y+.8,20,.65);
  }
  sign(b,'amazon',11,OFFICE_Y+3.12,17.1,3,.65,{amazon:true,size:145,background:'#e8e5d6'});
  buildOffice(b,scene);
  // Warm, publicly visible lobby.
  sign(b,'EDGE',-5,2.9,13.65,9,1.7,{background:'#617572',color:'#eff0da',size:145});
  b.box(0,4.2,18,39,.3,6,slab);
  for(const x of [-17,-8,1,10,19])b.cylinder(x,2,19,.12,.12,4,frame,8);
  for(const x of [-34,35])for(const z of [-25,5,28])tree(b,x,.5,z,1.8);
  for(const x of [-32,32])b.box(x,.8,16,7,.8,2,wood);

  return b.finish(scene);
}
