import * as THREE from 'three';
import { Builder } from './geometry.js';
import { VTOL } from './vtol-flight.js';

export const COCKPIT=Object.freeze({fov:78,zoom:1.25,exposure:.96});
const mono='Consolas, "SFMono-Regular", Menlo, monospace';

export function createCockpit(){
  // A separate interior pass keeps the dashboard fixed while the optics zoom the world.
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(COCKPIT.fov,1,.035,8);
  scene.matrixAutoUpdate=false;
  scene.add(new THREE.HemisphereLight('#d2e6dd','#142c30',2.2));
  const light=new THREE.DirectionalLight('#ffe0ac',3);light.position.set(-2,3,1);scene.add(light);
  const interior=new THREE.Group();scene.add(interior);
  const b=new Builder();
  const frame=b.mat('cockpit-frame','#203338',{metalness:.65,roughness:.42});
  const edge=b.mat('cockpit-edge','#556f70',{metalness:.7,roughness:.3});
  const panel=b.mat('cockpit-panel','#30474b',{metalness:.42,roughness:.58});
  const rubber=b.mat('cockpit-rubber','#0e1b20',{roughness:.92});
  const brass=b.mat('cockpit-brass','#b7a477',{metalness:.65,roughness:.38});
  const green=b.mat('cockpit-green','#97ddb9',{emissive:'#76cda8',emissiveIntensity:.65});
  const amber=b.mat('cockpit-amber','#d7a967',{emissive:'#a56f32',emissiveIntensity:.28});

  // Faceted canopy rails, window seals and the roof arch frame a clear windscreen.
  for(const side of [-1,1]){
    const rail=[[side*2.1,-.78,-1.28],[side*1.72,.08,-1.5],[side*1.47,1.02,-1.62],[side*.7,1.22,-1.68]];
    for(let i=1;i<rail.length;i++){
      b.beam(rail[i-1],rail[i],.085,frame);
      b.beam(rail[i-1].map((v,j)=>j===0?v-side*.065:v),rail[i].map((v,j)=>j===0?v-side*.065:v),.018,edge);
    }
    b.beam([side*2.1,-.72,-1.25],[side*.5,-.51,-1.3],.047,rubber);
    for(const p of rail.slice(0,3))b.sphere(p[0],p[1],p[2]+.064,.027,.027,.02,brass,1);
    b.box(side*1.57,.07,-1.43,.12,.24,.07,panel,[0,0,-side*.2]);
    b.box(side*1.57,.07,-1.389,.025,.12,.009,amber,[0,0,-side*.2]);
    b.box(side*1.8,-.94,-.96,.6,.48,.6,frame,[0,side*.12,side*-.15]);
  }
  b.beam([-.7,1.22,-1.68],[.7,1.22,-1.68],.085,frame);
  b.box(0,1.12,-1.57,.5,.12,.08,panel);
  for(let i=-1;i<=1;i++)b.box(i*.13,1.12,-1.52,.05,.016,.008,i===1?amber:green);

  const hood=new THREE.Shape();
  [[-2.2,-1.25],[-2.2,-.67],[-1.55,-.48],[-.58,-.52],[-.36,-.41],[.36,-.41],[.58,-.52],[1.55,-.48],[2.2,-.67],[2.2,-1.25]]
    .forEach(([x,y],i)=>i?hood.lineTo(x,y):hood.moveTo(x,y));
  hood.closePath();
  b.add(new THREE.ExtrudeGeometry(hood,{depth:.4,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:1,steps:1}),panel,[0,0,-1.7]);
  b.beam([-1.55,-.48,-1.27],[-.58,-.52,-1.27],.025,rubber);
  b.beam([.58,-.52,-1.27],[1.55,-.48,-1.27],.025,rubber);

  for(const side of [-1,1]){
    b.box(side*.87,-.73,-1.23,.97,.45,.09,rubber);
    b.box(side*.87,-.73,-1.176,.88,.38,.026,edge);
    for(let i=0;i<5;i++)b.box(side*.87-.33+i*.165,-.978,-1.187,.08,.035,.025,i===0?green:rubber);
    for(const dx of [-.48,.48])b.cylinder(side*.87+dx,-.73,-1.155,.024,.024,.023,brass,8,[Math.PI/2,0,0]);
    for(let i=0;i<4;i++)b.box(side*1.53,-.69-i*.067,-1.245,.13,.013,.04,rubber);
  }
  b.box(0,-.75,-1.23,.59,.55,.12,frame);
  b.cylinder(0,-.66,-1.155,.173,.173,.035,rubber,40,[Math.PI/2,0,0]);
  b.add(new THREE.TorusGeometry(.169,.012,5,40),brass,[0,-.66,-1.12]);
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6;
    b.box(Math.sin(a)*.138,-.66+Math.cos(a)*.138,-1.122,.006,.018,.006,green,[0,0,-a]);
  }
  for(let i=-1;i<=1;i++)b.box(i*.08,-.87,-1.14,.035,.012,.008,i===1?amber:green);
  for(let i=-1;i<=1;i++)b.cylinder(i*.14,-.99,-1.1,.035,.035,.055,i===1?amber:rubber,12,[Math.PI/2,0,0]);
  b.finish(interior);

  const needle=new THREE.Group();needle.position.set(0,-.66,-1.1);
  const nb=new Builder();nb.box(0,.055,0,.014,.12,.009,green);nb.sphere(0,0,.003,.025,.025,.01,brass,1);nb.finish(needle);interior.add(needle);
  const stick=new THREE.Group();stick.position.set(.4,-1.03,-.84);
  const sb=new Builder();sb.cylinder(0,.12,0,.025,.035,.25,frame,8);
  sb.box(0,.265,0,.1,.14,.09,rubber,[0,0,-.12]);sb.box(0,.33,.048,.043,.026,.012,amber);sb.finish(stick);interior.add(stick);

  function screen(x){
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=280;
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.815,.325),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));
    mesh.position.set(x,-.73,-1.157);interior.add(mesh);
    return {canvas,ctx:canvas.getContext('2d'),texture};
  }
  const flight=screen(-.87),systems=screen(.87);
  function base(display,title){
    const {ctx}=display;
    ctx.fillStyle='#081c20';ctx.fillRect(0,0,640,280);
    ctx.strokeStyle='#41685f';ctx.lineWidth=2;ctx.strokeRect(12,12,616,256);
    ctx.font=`18px ${mono}`;ctx.textAlign='left';ctx.fillStyle='#9cdcb4';ctx.fillText(title,29,43);
    ctx.fillStyle='#65a58d';ctx.fillRect(29,58,582,1);
    return ctx;
  }
  let displayAge=1;
  function update(state,attitude,dt){
    needle.rotation.z=-attitude.roll;
    stick.rotation.set(THREE.MathUtils.clamp(-state.angularVelocity.x*.12,-.18,.18),0,THREE.MathUtils.clamp(state.angularVelocity.z*.1,-.18,.18));
    displayAge+=dt;if(displayAge<.1)return;displayAge=0;
    const ctx=base(flight,'01 / FLIGHT DIRECTOR');
    ctx.save();ctx.beginPath();ctx.rect(28,75,275,178);ctx.clip();ctx.translate(164,161);
    ctx.rotate(-attitude.roll);ctx.translate(0,attitude.pitch*90);
    ctx.fillStyle='#234c50';ctx.fillRect(-340,-340,680,340);ctx.fillStyle='#384936';ctx.fillRect(-340,0,680,340);
    ctx.strokeStyle='#b7e2b4';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-340,0);ctx.lineTo(340,0);ctx.stroke();
    ctx.lineWidth=1;for(const y of [-60,-30,30,60]){ctx.beginPath();ctx.moveTo(-45,y);ctx.lineTo(45,y);ctx.stroke()}ctx.restore();
    ctx.strokeStyle='#e8d58a';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(118,163);ctx.lineTo(151,163);ctx.lineTo(164,173);ctx.lineTo(177,163);ctx.lineTo(210,163);ctx.stroke();
    ctx.fillStyle='#8acda7';ctx.font=`17px ${mono}`;ctx.fillText('ALTITUDE / M',337,98);ctx.fillText('AIRSPEED / KMH',337,191);
    ctx.font=`42px ${mono}`;ctx.fillStyle='#c0ebca';ctx.fillText(String(Math.round(state.position.y)).padStart(3,'0'),337,147);ctx.fillText(String(Math.round(state.velocity.length()*3.6)).padStart(3,'0'),337,238);
    flight.texture.needsUpdate=true;
    const sys=base(systems,'02 / DUCTED LIFT SYSTEM');
    const lift=state.collective;
    sys.font=`18px ${mono}`;
    for(let i=0;i<2;i++){
      const y=92+i*52;sys.fillStyle='#9bd7b0';sys.fillText(i?'RIGHT FAN':'LEFT FAN',29,y);
      sys.fillStyle='#204338';sys.fillRect(210,y-16,277,15);sys.fillStyle='#91caaa';sys.fillRect(210,y-16,277*Math.min(1,lift/VTOL.fullCollective),15);
      sys.fillText('ONLINE',518,y);
    }
    sys.fillStyle='#75a28d';sys.fillText('VERTICAL',29,208);sys.fillText('COLLECTIVE',337,208);
    sys.font=`29px ${mono}`;sys.fillStyle='#c0ebca';
    sys.fillText(`${state.velocity.y>=0?'+':''}${state.velocity.y.toFixed(1)} M/S`,29,248);sys.fillText(`${Math.round(lift*100)} %`,337,248);
    systems.texture.needsUpdate=true;
  }
  function resize(aspect){camera.aspect=aspect;camera.updateProjectionMatrix();interior.scale.x=aspect/1.6}
  resize(innerWidth/innerHeight);
  return {scene,camera,update,resize};
}
