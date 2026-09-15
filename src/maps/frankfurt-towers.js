import * as THREE from 'three';
import { sign } from '../geometry.js';
const clamp01=value=>Math.max(0,Math.min(1,value));

// Original procedural artwork loosely based on the real towers. No photographs ship in the game.
export const TOWER_PROFILES=Object.freeze({
  taunus:{name:'TaunusTurm',frame:'#e8e1ce',glass:'#507c91',band:.07,bay:1.8,floor:4.1},
  main:{name:'MAIN TOWER',frame:'#a5bfc2',glass:'#6596aa',band:.045,bay:2.5,floor:3.5},
  commerz:{name:'Commerzbank Tower',frame:'#ced1c7',glass:'#719397',band:.26,bay:2.8,floor:4.25},
  japan:{name:'Japan Center',frame:'#9b5742',glass:'#537381',band:.30,bay:3.0,floor:3.6},
  euro:{name:'Eurotower',frame:'#d5d5c6',glass:'#729b99',band:.12,bay:2.1,floor:3.5},
  omni:{name:'Omniturm',frame:'#dbe0d9',glass:'#557b87',band:.10,bay:2.7,floor:3.8},
  silber:{name:'Silberturm',frame:'#c9d3d3',glass:'#587482',band:.38,bay:2.4,floor:4.05},
  skyper:{name:'Skyper',frame:'#aebfbd',glass:'#4f8397',band:.18,bay:2.5,floor:3.6},
  trianon:{name:'Trianon',frame:'#dedfd8',glass:'#56809b',band:.22,bay:2.7,floor:3.7},
  westend:{name:'Westend Tower',frame:'#e4e1d4',glass:'#6592a6',band:.24,bay:2.6,floor:3.6},
});

function panelTexture(key,p){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=512;
  const c=canvas.getContext('2d');
  c.fillStyle=p.frame;c.fillRect(0,0,256,512);
  // Four storeys / four bays: varied blinds and reflections break up repetition.
  for(let row=0;row<4;row++)for(let col=0;col<4;col++){
    const x=col*64,y=row*128,w=key==='euro'?48:key==='japan'?42:59,h=128*(1-p.band);
    const left=x+(64-w)/2,top=y+4;
    const g=c.createLinearGradient(left,top,left+w,top+h);
    g.addColorStop(0,p.glass);g.addColorStop(.58,p.glass);g.addColorStop(1,'#afc5c8');
    c.fillStyle=g;c.fillRect(left,top,w,h);
    c.fillStyle='#253f4b';c.fillRect(left,top,1.5,h);c.fillRect(left,top,w,2);
    c.fillStyle='#e6eff01a';c.fillRect(left+3,top+3,5,h-6);
    if((col*7+row*11)%5===0){
      c.fillStyle='#d7d3b875';c.fillRect(left+2,top+3,w-4,h*.36);
      c.fillStyle='#5a6e6e44';for(let j=5;j<h*.36;j+=6)c.fillRect(left+2,top+j,w-4,1);
    }
    if(key==='main'&&(row+col)%2===0){c.strokeStyle='#d0dede';c.lineWidth=2;c.strokeRect(left+w*.52,top+h*.44,w*.4,h*.51)}
    if(key==='silber'){c.fillStyle='#eff5f540';c.fillRect(x,y+114,64,2);c.fillStyle='#718a9638';c.fillRect(x,y+110,64,2)}
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=8;return texture;
}
export function detailedTowers(b,m,data,{crown,center,edges}){
  const records=[],profiles={};
  for(const [key,p] of Object.entries(TOWER_PROFILES)){
    profiles[key]={
      ...p,wall:b.mat(`${key} wall`,p.glass,{roughness:.4,metalness:.22}),
      panel:b.mat(`${key} panels`,'#ffffff',{map:panelTexture(key,p),roughness:key==='japan'?.58:.36,metalness:key==='silber'?.45:.22}),
      trim:b.mat(`${key} cladding`,p.frame,{roughness:key==='silber'?.34:.65,metalness:key==='silber'?.55:.15}),
    };
    profiles[key].panel.userData.surfaceOverlay=true;
  }
  const signed=p=>edges(p).reduce((s,[a,c])=>s+a[0]*c[1]-c[0]*a[1],0);
  const shifted=(p,scale,dx=0,dz=0)=>{const [x,z]=center(p);return p.map(v=>[x+(v[0]-x)*scale+dx,z+(v[1]-z)*scale+dz])};
  function panels(points,bottom,top,p){
    const winding=Math.sign(signed(points));
    for(const [a,c] of edges(points)){
      const dx=c[0]-a[0],dz=c[1]-a[1],len=Math.hypot(dx,dz);if(len<.4)continue;
      const nx=dz/len*winding,nz=-dx/len*winding,g=new THREE.PlaneGeometry(len,top-bottom),uv=g.attributes.uv;
      for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*len/(p.bay*4),uv.getY(i)*(top-bottom)/(p.floor*4));
      b.add(g,p.panel,[(a[0]+c[0])/2+nx*.07,(top+bottom)/2,(a[1]+c[1])/2+nz*.07],[1,1,1],[0,Math.atan2(nx,nz),0]);
    }
  }
  function bands(points,bottom,top,p,step=p.floor,depth=.3,height=.18){
    for(let y=bottom;y<top-.1;y+=step)for(const [a,c] of edges(points))b.segment(a,c,y,depth,height,p.trim);
  }
  function ribs(points,bottom,top,p,spacing=p.bay,width=.2){
    for(const [a,c] of edges(points)){
      const len=Math.hypot(c[0]-a[0],c[1]-a[1]);if(len<1)continue;
      const count=Math.max(1,Math.round(len/spacing));
      for(let j=0;j<=count;j++)b.box(a[0]+(c[0]-a[0])*j/count,(bottom+top)/2,a[1]+(c[1]-a[1])*j/count,width,top-bottom,width,p.trim);
    }
  }
  function tower(points,top,key,bottom=0,{floors=true,ribSpacing=0}={}){
    const p=profiles[key],[x,z]=center(points);
    b.polygon(points,bottom,top-bottom,p.wall,p.name);
    panels(points,bottom,top,p);
    b.polygon(points,top,.25,m.roof);
    if(floors)bands(points,Math.max(bottom+.1,7.5),top,p);
    if(ribSpacing)ribs(points,bottom,top,p,ribSpacing);
    records.push({points,h:top,x,z,name:p.name,detailed:true,profile:key});
  }
  function lobby(points,height,p){
    // Recessed glazing, stone portals and a projecting rain canopy.
    panels(shifted(points,1.004),.3,height,{...p,panel:m.glass});
    ribs(points,.2,height,p,5,.5);
    for(const [a,c] of edges(points))b.segment(a,c,height,1.5,.32,p.trim);
  }

  const tt=profiles.taunus;
  b.polygon(data.landmarks.taunus.points,0,8.3,m.glass,'TaunusTurm podium');
  for(const id of [368975736,368975737,368975744]){
    const part=data.parts[id];tower(part.points,part.h,'taunus',0,{ribSpacing:1.8});
    lobby(part.points,8.3,tt);
  }
  crown(b,data.parts[368975738],tt.wall,tt.trim);crown(b,data.parts[368975740],tt.wall,tt.trim);
  for(const id of [368975738,368975740]){
    const part=data.parts[id];
    panels(part.points,8.3,part.h-part.roofHeight,tt);
    bands(part.points,8.3,part.h-part.roofHeight,tt);
  }
  const residential=data.parts[368975750];tower(residential.points,residential.h,'taunus');
  bands(residential.points,5,residential.h,tt,3.15,1.2,.5);
  for(const [a,c] of edges(residential.points))for(let y=6;y<residential.h;y+=3.15)b.segment(a,c,y,.15,.65,m.metal);
  sign(b,'TAUNUSTURM',-11,5,23,12,1.7,{color:'#365c5e',background:'#eee8d5',rotation:-.54,size:85});

  // MAIN TOWER: circular shaft + lower orthogonal shaft and operable window grid.
  const main=data.parts[183071928],mp=profiles.main,[mx,mz]=center(main.points);
  tower(main.points,200,'main',0,{ribSpacing:2.5});
  const mainRect=data.parts[183071941];tower(mainRect.points,193,'main');
  const rectangular=[[-58.3,-207.02],[-67.57,-218.71],[-43.23,-233.3],[-33.27,-216.66]];
  const bronze={...mp,frame:'#827b64',glass:'#566d6c'};
  bronze.trim=b.mat('MAIN TOWER bronze','#827b64',{metalness:.45,roughness:.45});
  bronze.panel=b.mat('MAIN TOWER bronze panels','#ffffff',{map:panelTexture('main',bronze),metalness:.3,roughness:.4});
  bronze.panel.userData.surfaceOverlay=true;
  b.polygon(rectangular,0,170,bronze.trim,'MAIN TOWER rectangular shaft');
  panels(rectangular,8,170,bronze);bands(rectangular,8,170,bronze);
  b.polygon(rectangular,170,.3,m.roof);
  lobby(data.landmarks.mainTower.points,10,mp);
  b.cylinder(mx,201,mz,16.5,16.5,1.1,mp.trim,48);
  for(let i=0;i<48;i++){
    const a=i/48*Math.PI*2,c=(i+1)/48*Math.PI*2;
    b.beam([mx+Math.cos(a)*16.2,203,mz+Math.sin(a)*16.2],[mx+Math.cos(c)*16.2,203,mz+Math.sin(c)*16.2],.08,mp.trim);
    b.cylinder(mx+Math.cos(a)*16.2,202,mz+Math.sin(a)*16.2,.07,.07,2,mp.trim,4);
  }
  b.cylinder(mx,220,mz,.4,.7,38,m.ivory,8);b.cylinder(mx,240,mz,.2,.35,4,m.brick,6);
  b.collider(mx,221,mz,1.5,40,1.5,'MAIN TOWER antenna');

  const cp=profiles.commerz,foot=data.landmarks.commerzbank.points;
  // The footprint's rounded triangular corners are retained from the survey.
  tower(foot,239,'commerz',0,{floors:false});
  bands(foot,10,239,cp,4.25,.4,.62);
  const [cx,cz]=center(foot),tri=[[108,-83],[136,-39],[86,-45]];
  // Nine four-storey gardens spiral around the three façades.
  for(let tier=0;tier<9;tier++){
    const [a,c]=edges(tri)[tier%3],y=30+tier*22.5,dx=c[0]-a[0],dz=c[1]-a[1],len=Math.hypot(dx,dz);
    const out=new THREE.Vector2(dz/len,-dx/len);
    for(const [v,w] of edges(foot)){
      const ex=w[0]-v[0],ez=w[1]-v[1],el=Math.hypot(ex,ez);if(el<.4)continue;
      const nx=ez/el*Math.sign(signed(foot)),nz=-ex/el*Math.sign(signed(foot));
      if(nx*out.x+nz*out.y<.9)continue;
      const project=q=>((q[0]-a[0])*dx+(q[1]-a[1])*dz)/(len*len),va=project(v),vc=project(w);
      if(Math.abs(vc-va)<1e-6)continue;
      const t1=clamp01((.22-va)/(vc-va)),t2=clamp01((.78-va)/(vc-va)),lo=Math.min(t1,t2),hi=Math.max(t1,t2);
      if(hi-lo<.01)continue;
      const p1=[v[0]+ex*lo+nx*.5,v[1]+ez*lo+nz*.5],p2=[v[0]+ex*hi+nx*.5,v[1]+ez*hi+nz*.5];
      b.segment(p1,p2,y,.3,15,b.mat('garden glazing','#345b5c',{roughness:.4,metalness:.15}));
      for(const level of [-7.6,7.6])b.segment(p1,p2,y+level,1.4,.7,cp.trim);
      const count=Math.max(1,Math.round(el*(hi-lo)/3));
      for(let j=0;j<count;j++){
        const x=THREE.MathUtils.lerp(p1[0],p2[0],(j+.5)/count),z=THREE.MathUtils.lerp(p1[1],p2[1],(j+.5)/count);
        b.box(x,y,z,.18,15,.18,cp.trim);
        b.sphere(x+nx*.6,y-5,z+nz*.6,.85,1.2,.85,b.mat('garden foliage','#6f9456'),1);
      }
    }
  }
  for(const [x,z] of tri){
    b.cylinder(x,129,z,3.1,3.1,258,cp.trim,8);
    b.beam([x,254,z],[cx,270,cz],.55,m.metal);
  }
  const top=data.parts[183060773];tower(top.points,259,'commerz',239,{floors:false});
  for(const y of [241,244,247,250,253,256])bands(top.points,y,y+.1,cp,3,.5,.3);
  b.cylinder(cx,273,cz,.35,.8,54,m.ivory,8);b.cylinder(cx,299,cz,.18,.25,3,m.brick,6);
  b.collider(cx,271,cz,1.8,60,1.8,'Commerzbank spire');
  lobby(foot,10,cp);

  const jp=profiles.japan,japan=data.landmarks.japanCenter.points;
  tower(japan,108,'japan');lobby(japan,8,jp);
  // Red granite piers, recessed square windows, exposed top colonnade and deep eaves.
  ribs(japan,8,103,jp,9,.65);bands(japan,8,104,jp,27,1,.85);
  const inset=shifted(japan,.87);
  tower(inset,113,'japan',108,{floors:false});ribs(japan,106,113,jp,3.1,.52);
  b.polygon(shifted(japan,1.14),113,1.4,m.roof,'Japan Center crown');
  b.polygon(shifted(japan,1.16),114.4,.6,m.metal);

  const euro=data.parts[74730506].points;
  tower(euro,148,'euro',0,{ribSpacing:2.1});
  bands(euro,12,148,profiles.euro,3.5,.5,.36);lobby(euro,10,profiles.euro);
  b.polygon(shifted(euro,.88),148,1.8,profiles.euro.trim);

  const op=data.landmarks.omniturm.points,om=profiles.omni;
  tower(op,62,'omni');lobby(op,10,om);
  for(let floor=0;floor<8;floor++){
    const offset=Math.sin((floor+1)/9*Math.PI)*12,p=shifted(op,1,offset,offset*.3),bottom=62+floor*4;
    tower(p,bottom+4,'omni',bottom,{floors:false});
    for(const [a,c] of edges(p)){
      b.segment(a,c,bottom+3.95,1.2,.3,om.trim);
      b.segment(a,c,bottom+1,.1,.65,m.metal);
    }
  }
  tower(op,183,'omni',94);ribs(op,94,183,om,5.4,.18);
  b.polygon(shifted(op,.82),183,3,m.roof,'Omniturm roof plant');

  // Silberturm's two rounded high cores emerge above the lower silver wings.
  const silver=data.landmarks.silberturm.points,sp=profiles.silber;
  tower(silver,151,'silber');
  for(const id of [1333665178,1333665179]){
    const core=shifted(data.parts[id].points,1.025),[x,z]=center(core);
    b.polygon(core,0,166,sp.trim,'Silberturm silver core');
    bands(core,7,166,sp,4.05,.22,.1);
    records.push({points:core,h:166,x,z,name:sp.name,detailed:true,profile:'silber'});
  }
  bands(silver,7,151,sp,4.05,.48,.48);lobby(silver,7,sp);

  const skyper=data.landmarks.skyper.points;
  tower(skyper,154,'skyper',0,{ribSpacing:5});lobby(skyper,9,profiles.skyper);
  bands(skyper,9,154,profiles.skyper,3.6,.32,.35);
  b.polygon(shifted(skyper,.82),154,2.5,m.roof,'Skyper roof plant');

  const tr=profiles.trianon;
  tower(data.parts[183076912].points,176,'trianon');
  for(const id of [174437750,174437751,174437752])tower(data.parts[id].points,186,'trianon',0,{ribSpacing:5.4});
  const tp=data.parts[183076912].points,[tx,tz]=center(tp);
  // Inverted three-sided glass pyramid, not a generic pointed spire.
  const pyramid=new THREE.BufferGeometry(),verts=[];
  for(const [a,c] of edges(shifted(tp,.64))){
    verts.push(tx,178,tz,a[0],186,a[1],c[0],186,c[1]);
    b.beam([tx,178,tz],[a[0],186,a[1]],.22,tr.trim);
    b.beam([a[0],186,a[1]],[c[0],186,c[1]],.22,tr.trim);
    for(const t of [.33,.66])b.beam([tx+(a[0]-tx)*t,178+8*t,tz+(a[1]-tz)*t],[tx+(c[0]-tx)*t,178+8*t,tz+(c[1]-tz)*t],.07,tr.trim);
  }
  shifted(tp,.64).forEach((p,i)=>b.beam([p[0],186,p[1]],[tp[i][0],186,tp[i][1]],.38,tr.trim));
  pyramid.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));pyramid.computeVertexNormals();b.add(pyramid,m.glass);
  lobby(data.landmarks.trianon.points,9,tr);

  const wp=profiles.westend,roof=data.parts[1177171890].points;
  // OSM's parent outline includes the projecting crown, not just the shaft.
  // Its inner survey arc defines the round glass front; the broad stone wing
  // stops below it, as visible in KPF's elevations and photographs.
  const inner=roof.slice(0,19),shaft=[...inner,[-768.55,3.38],[-765.48,-7.28],[-755.74,-11.16]];
  const wing=[[-783,-6],[-757,-16],[-737,36],[-763,46]];
  tower(wing,146,'westend',0,{ribSpacing:2.6});
  tower(shaft,198,'westend',0,{ribSpacing:5.2});lobby(wing,10,wp);
  b.polygon(roof,206.7,.9,wp.trim,'Westend open crown');
  for(let i=0;i<inner.length;i+=2){
    const p=inner[i],r=new THREE.Vector2(p[0]+757,p[1]-14).normalize();
    b.cylinder(p[0],202.5,p[1],.32,.32,9,wp.trim,6);
    b.beam([p[0],206.5,p[1]],[p[0]+r.x*10,206.5,p[1]+r.y*10],.35,wp.trim);
  }
  return records;
}
