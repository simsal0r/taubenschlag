import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPigeon } from './pigeon.js';
import { moveWithCollisions, surfaceBelow, raycastCollider } from './physics.js';
import { UI } from './ui.js';
import { Ambience } from './audio.js';
import { createFlightState, flap, stopFlight, advanceFlight, flightVelocity } from './flight.js';
import { VTOL, createVTOLState, resetVTOL, advanceVTOL, vtolAttitude, damageVTOL } from './vtol-flight.js';
import { createCyborgPigeon } from './cyborg-pigeon.js';
import { PoopCannon } from './poop-cannon.js';
import { normalizePilotSettings } from './pilot-settings.js';
import { VTOLChaseCamera, VTOL_CAMERA } from './vtol-camera.js';
import { createCockpit, COCKPIT } from './cockpit.js';
import { ImpactEffects } from './impact-effects.js';
import { Flares } from './vtol-flares.js';
import { fireThrusters } from './vtol-thrusters.js';
import { StableSun } from './stable-sun.js';
import { indexColliders,segmentColliders } from './collider-index.js';
import { reversedOpaqueOrder,reversedTransparentOrder } from './render-order.js';
import { BenchmarkRun,sectionAt } from './benchmark.js';
import { BenchmarkGPU } from './benchmark-gpu.js';
import { BenchmarkFlight } from './benchmark-flight.js';
import { BenchmarkUI } from './benchmark-ui.js';

import { disposeResources } from './dispose-scene.js';

export async function createGame({mapId,initialMode='pigeon',initialBenchmark=false,onHome,audio,onSoundChange=()=>{}}) {
const events=new AbortController();
const listen=(target,type,handler,options={})=>target.addEventListener(type,handler,{...options,signal:events.signal});
let disposed=false,frame=0,overview=null,needsRender=true,renderedFrames=0;
let benchmark=null,benchmarkGPU=null,benchmarkReturnMode='vtol',benchmarkTick=0,benchmarkResult=null,benchmarkReason=null;
const benchmarkFlight=new BenchmarkFlight(mapId);
const benchmarkRunning=()=>benchmark&&['warmup','measuring','settling'].includes(benchmark.phase);
const mapModule=mapId==='frankfurt'?await import('./maps/frankfurt.js'):await import('./maps/berlin.js');
const $=id=>document.getElementById(id);
let renderer;
try {
  // Reverse depth retains distant façade precision without fragment-depth
  // writes. Keep log depth on browsers without EXT_clip_control.
  const canvas=$('world'),context=canvas.getContext('webgl2',{alpha:true,depth:true,stencil:false,antialias:true,
    premultipliedAlpha:true,preserveDrawingBuffer:false,powerPreference:'high-performance'});
  if(!context)throw new Error('WebGL 2 is unavailable');
  const reversedDepthBuffer=!!context.getExtension('EXT_clip_control');
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',
    reversedDepthBuffer,logarithmicDepthBuffer:!reversedDepthBuffer});
} catch(error) {
  $('loading').classList.add('hidden');$('error').classList.remove('hidden');
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.65));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.03;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.info.autoReset=false;
if(renderer.capabilities.reversedDepthBuffer){
  renderer.setOpaqueSort(reversedOpaqueOrder);renderer.setTransparentSort(reversedTransparentOrder);
}

const scene=new THREE.Scene();
scene.matrixAutoUpdate=false;
scene.background=new THREE.Color('#dce7e1');
scene.fog=new THREE.Fog('#dce7d9',430,1350);
const camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.12,3000);
const pmrem=new THREE.PMREMGenerator(renderer);
const environment=new RoomEnvironment();
const environmentTarget=pmrem.fromScene(environment,.04);
scene.environment=environmentTarget.texture;
scene.environmentIntensity=.32;environment.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight('#e3f0f3','#b9ad8c',1.15));
const sun=new THREE.DirectionalLight('#fff0d4',3.0);sun.position.set(-95,200,130);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-140;sun.shadow.camera.right=140;sun.shadow.camera.top=150;sun.shadow.camera.bottom=-150;sun.shadow.camera.near=1;sun.shadow.camera.far=500;
sun.shadow.bias=-.0003;sun.shadow.normalBias=.2;sun.shadow.radius=3;
sun.target.position.set(0,40,0);scene.add(sun,sun.target);
const stableSun=new StableSun(sun);

let world;
try{world=mapModule.createMap(scene)}catch(error){
  disposeResources(scene,environmentTarget);renderer.dispose();throw error;
}
indexColliders(world.colliders);
const theme=world.theme;
scene.background.set(theme.background);scene.fog=new THREE.Fog(theme.fog,theme.fogNear,theme.fogFar);
const hemisphere=scene.children.find(o=>o.isHemisphereLight);hemisphere.color.set(theme.sky);hemisphere.groundColor.set(theme.ground);sun.color.set(theme.sun);
hemisphere.intensity=theme.ambientIntensity??1.15;sun.intensity=theme.sunIntensity??3;
const TERRACE=world.terrace;
const avatar=new THREE.Group(),bird=createPigeon(.8);avatar.add(bird);scene.add(avatar);
const cyborg=createCyborgPigeon();cyborg.visible=false;scene.add(cyborg);
const cockpitView=createCockpit();
const vtol=createVTOLState();vtol.spawn=world.vtolSpawn;vtol.spawnYaw=world.vtolYaw;
let mode='pigeon',vtolArmed=false,cockpit=false,firing=false,rightMouse=false,lookYaw=0,lookPitch=0;
let crashCount=0;
const mouseMotion={x:0,y:0},pilotSettings=normalizePilotSettings();
try{
  Object.assign(pilotSettings,normalizePilotSettings(JSON.parse(localStorage.getItem('little-wings-pilot')||'{}')));
}catch{}
const flock=[];
for(let i=0;i<(mapId==='frankfurt'?2:5);i++){
  const parent=new THREE.Group(),pigeon=createPigeon(1.4);parent.add(pigeon);scene.add(parent);flock.push({parent,pigeon,phase:i*1.4});
}
const player={position:new THREE.Vector3(...world.pigeonSpawn),velocity:new THREE.Vector3(),yaw:.55,perched:false,flight:createFlightState()};
let started=false,paused=false,inside=false,nearOffice=false,wasInside=false,discoveredOffice=false;
let time=0,last=performance.now(),cameraSnap=true,dragging=false,dragLast=0,orbit=0,toastCooldown=0;
let frameCount=0,frameTime=0,fps=60;
const keys=new Set();
const sound=audio||new Ambience();
const impacts=new ImpactEffects(scene);
const flares=new Flares(scene,world.colliders);
const cannon=new PoopCannon(scene,world.colliders,(hit,weapon)=>{
  ui.hit();
  if(weapon.explosive){impacts.burst(hit.point,{kind:'poop',radius:weapon.splashRadius});sound.boom(weapon.id===3?'bomb':'poop')}
  else sound.splat();
});
const ui=new UI({
  start,home,benchmark:beginBenchmark,pause(value){
    paused=value;needsRender=true;keys.clear();dragging=false;firing=false;rightMouse=false;mouseMotion.x=mouseMotion.y=0;
    if(value){releasePilot();ui.clearPlayerHit()}
    sound.rotor(0);
  },
  vtolSettings:()=>pilotSettings,
  configureVTOL(settings){
    Object.assign(pilotSettings,normalizePilotSettings({...pilotSettings,...settings}));
    try{localStorage.setItem('little-wings-pilot',JSON.stringify(pilotSettings))}catch{}
  },
  teleport,selectWeapon,sound:async()=>{try{const enabled=await sound.toggle();ui.setSound(enabled);onSoundChange(enabled)}catch{ui.toast('Sound is unavailable in this browser.')}},
  reset(){for(const c of crumbs){c.collected=false;c.mesh.visible=true}save();ui.progress(0,inside);ui.toast('A fresh scattering of crumbs. Happy exploring!')}
},world,events.signal);
ui.setSound(sound.enabled);
const predators=mapModule.createPredators?.(scene,world,{
  onPlayerHit,
  onEvent(event,enemy){
    if(event==='hit')sound.predatorHit(enemy.type,enemy.position.distanceTo(vtol.position));
    if(event==='provoked'&&enemy.type!=='eagle')ui.toast(enemy.type==='godzilla'?'Godzilla activated. Close attack runs beat its armor repair.':`${enemy.type==='cat'?'Climber cat':enemy.type==='hawk'?'Hawk':'Raccoon'} is retaliating.`,3500);
    if(event==='nest')ui.toast('The Westend eagles are hunting you. Burst away to open a gap, turn and shoot, then escape again.',4200);
    if(event==='defeated'){
      impacts.burst(enemy.position,{kind:'poop',radius:enemy.type==='godzilla'?18:5});
      ui.toast(enemy.type==='godzilla'?'Cyborg Godzilla neutralized. Silberturm is clear for 90 seconds.':'Predator driven off. It will return peacefully.',3500);
    }
  },
});
if(predators)cannon.actors=predators.simulation;
const storageKey=world.storageKey;
let saved=[];
try{const data=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(data))saved=data.filter(i=>Number.isInteger(i)&&i>=0&&i<12)}catch{}
const crumbPositions=world.crumbPositions;
const crumbMat=new THREE.MeshStandardMaterial({color:'#f0c775',emissive:'#e3b54d',emissiveIntensity:.35,roughness:.55});
const ringMat=new THREE.MeshBasicMaterial({color:'#e9d59b',transparent:true,opacity:.55,depthWrite:false,side:THREE.DoubleSide});
const crumbs=crumbPositions.map((p,i)=>{
  const group=new THREE.Group();group.position.set(...p);
  const nugget=new THREE.Mesh(new THREE.IcosahedronGeometry(.18,0),crumbMat);nugget.scale.set(1.35,.8,1);group.add(nugget);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.46,.019,5,32),ringMat);group.add(ring);
  scene.add(group);group.visible=!saved.includes(i);
  return {position:new THREE.Vector3(...p),mesh:group,ring,collected:saved.includes(i)};
});
ui.progress(saved.length,false);
const benchmarkUI=new BenchmarkUI({cancel:cancelBenchmark,retry:()=>beginBenchmark(true),resume:leaveBenchmark,home});
const sparkles=[];
const sparkleGeo=new THREE.IcosahedronGeometry(.065,0);
function save(){try{localStorage.setItem(storageKey,JSON.stringify(crumbs.flatMap((c,i)=>c.collected?[i]:[])))}catch{}}

function start(nextMode='pigeon'){
  needsRender=true;
  mode=nextMode;releasePilot();cannon.clear();impacts.clear();flares.clear();crashCount=0;cockpit=false;lookYaw=lookPitch=0;
  started=true;paused=false;ui.showGame();
  ui.setMode(mode);camera.up.set(0,1,0);avatar.rotation.set(0,0,0);
  ui.crash(0);ui.weapon(cannon);
  cyborg.visible=mode==='vtol';resetVTOL(vtol);ui.thrusters(vtol.thrusters);
  predators?.simulation.reset();
  player.position.set(...world.pigeonSpawn);player.yaw=world.pigeonYaw;player.velocity.set(0,0,0);player.perched=false;
  stopFlight(player.flight);
  cameraSnap=true;keys.clear();orbit=0;camera.fov=64;camera.updateProjectionMatrix();
  ui.setCapture(false);
  ui.toast(mode==='vtol'?(predators?'Click to pilot. Silberturm’s cyborg giant and wildlife stay peaceful until hit.':'PJN–01 ready. Click the scene to take control.'):'Tap Space to flap. W / S aim up and down. A / D turn.',5200);
}
function benchmarkConfig(){
  const buffer=renderer.getDrawingBufferSize(new THREE.Vector2());
  return {
    map:mapId,build:import.meta.env.PROD?__BUILD_ID__:`dev server startup ${__BUILD_ID__}`,runtime:import.meta.env.PROD?'production':'development',
    viewport:[innerWidth,innerHeight],buffer:buffer.toArray(),devicePixelRatio:window.devicePixelRatio,
    pixelRatio:renderer.getPixelRatio(),antialias:renderer.getContext().getContextAttributes().antialias,
    logarithmicDepth:renderer.capabilities.logarithmicDepthBuffer,
    reversedDepth:renderer.capabilities.reversedDepthBuffer,
    shadows:{enabled:renderer.shadowMap.enabled,type:renderer.shadowMap.type,size:sun.shadow.mapSize.x},
    sound:sound.enabled,userAgent:navigator.userAgent,platform:navigator.platform,
  };
}
function resetBenchmarkWorld(){
  time=0;benchmarkTick=0;predators?.simulation.reset();cannon.clear();impacts.clear();flares.clear();
  for(const s of sparkles)scene.remove(s.mesh);sparkles.length=0;
  for(const c of crumbs){c.mesh.visible=true;c.mesh.position.copy(c.position);c.mesh.rotation.set(0,0,0);c.ring.rotation.set(0,0,0)}
}
function beginBenchmark(retry=false){
  if(!retry)benchmarkReturnMode=mode;
  benchmarkGPU?.clear();benchmarkUI.close();ui.close();start('vtol');overview=null;
  benchmarkResult=null;benchmarkReason=null;resetBenchmarkWorld();
  benchmarkGPU=new BenchmarkGPU(renderer.getContext());
  benchmark=new BenchmarkRun({...benchmarkConfig(),gpuTiming:!!benchmarkGPU.ext});
  benchmarkUI.start();ui.setCapture(true);last=performance.now();
}
function cancelBenchmark(reason){
  if(!benchmarkRunning())return;
  benchmark.phase='cancelled';benchmark.pending=null;benchmarkReason=reason;benchmarkGPU?.clear();
  paused=true;releasePilot();ui.setCockpit(false);benchmarkUI.show(null,reason);
}
function leaveBenchmark(){
  benchmarkGPU?.clear();benchmark=null;benchmarkUI.close();
  for(const c of crumbs)c.mesh.visible=!c.collected;
  start(benchmarkReturnMode);
}
function finishBenchmark(){
  const gpu=benchmarkGPU.snapshot();benchmarkGPU.clear();
  const result=benchmark.finish(gpu);
  result.resources={...renderer.info.memory};
  result.jsHeapBytes=performance.memory?.usedJSHeapSize??null;
  benchmarkResult=result;paused=true;releasePilot();ui.setCockpit(false);benchmarkUI.show(result);
}
function benchmarkPose(seconds){
  const pose=benchmarkFlight.sample(seconds);
  vtol.position.copy(pose.position);vtol.velocity.copy(pose.velocity);vtol.orientation.copy(pose.orientation);
  vtol.afterburner=pose.boost;vtol.collective=1;
  return pose;
}
function updateBenchmark(seconds,dt){
  inside=nearOffice=false;
  const targetTick=Math.floor(seconds*60+1e-7);
  // Fixed simulation steps keep neutral wildlife and flares at the same point
  // along the route regardless of the machine's display refresh or frame rate.
  while(benchmarkTick<targetTick){
    benchmarkTick++;const t=benchmarkTick/60;benchmarkPose(t);
    predators?.update(1/60,{position:vtol.position,velocity:vtol.velocity,active:false});
    flares.update(1/60);
    if(benchmarkTick===21*60||benchmarkTick===24.5*60){flares.deploy(vtol);sound.flares()}
  }
  const pose=benchmarkPose(seconds);
  if(cockpit!==pose.cockpit){cockpit=pose.cockpit;ui.setCockpit(cockpit)}
  cyborg.position.copy(vtol.position);cyborg.quaternion.copy(vtol.orientation);
  cyborg.userData.animate(seconds,vtol,dt);time=seconds;
  sound.update(false,vtol.velocity.length(),'vtol');sound.rotor(1,vtol.velocity.length(),0,dt,vtol.afterburner);
}
function home(){
  dispose();onHome();
}
function teleport(where){
  if(benchmarkRunning())return;
  if(!started)start();
  const target=world.jump(where,mode);
  if(mode==='vtol'){
    if(vtol.crashed)return;
    resetVTOL(vtol,target.position,target.yaw);flares.clear();ui.clearPlayerHit();ui.integrity(vtol.health);cameraSnap=true;lookYaw=lookPitch=0;keys.clear();firing=false;
    predators?.simulation.ceasefire();
    ui.toast('Airspace clear. W / S throttle · Mouse pitch / roll.');return;
  }
  player.position.set(...target.position);player.yaw=target.yaw;ui.toast(target.message);
  player.velocity.set(0,0,0);player.perched=false;keys.clear();cameraSnap=true;orbit=0;
  stopFlight(player.flight);
}

function selectWeapon(slot){
  if(benchmarkRunning())return;
  if(!started||mode!=='vtol'||paused||vtol.crashed)return;
  if(cannon.select(slot))ui.weapon(cannon);
}

const controlledCodes=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyC','KeyX','KeyQ','ControlLeft','ControlRight','ShiftLeft','ShiftRight','KeyE','KeyR','KeyB','Digit1','Digit2','Digit3','Numpad1','Numpad2','Numpad3']);
listen(window,'keydown',e=>{
  if(benchmarkRunning()){
    if(e.code==='Escape'){cancelBenchmark('Cancelled by you.');e.preventDefault()}
    else if(controlledCodes.has(e.code))e.preventDefault();
    return;
  }
  if(benchmarkUI.dialog.open)return;
  if(e.code==='Escape'&&started&&!$('modal').open){ui.open('pause');e.preventDefault();return}
  if(!started||paused)return;
  if(controlledCodes.has(e.code))e.preventDefault();
  if(e.repeat||(mode==='vtol'&&vtol.crashed))return;
  keys.add(e.code);
  if(mode==='vtol'){
    if(e.code==='KeyX'&&vtolArmed&&flares.deploy(vtol)){sound.flares();predators?.simulation.flare()}
    if(e.code==='KeyQ'&&vtolArmed){
      const misfires=vtol.thrusters.misfires;
      if(fireThrusters(vtol))sound.thruster();
      else if(vtol.thrusters.misfires>misfires)sound.thrusterMisfire();
      ui.thrusters(vtol.thrusters);
    }
    if(e.code==='Digit1'||e.code==='Numpad1')selectWeapon(1);
    if(e.code==='Digit2'||e.code==='Numpad2')selectWeapon(2);
    if(e.code==='Digit3'||e.code==='Numpad3')selectWeapon(3);
    if(e.code==='KeyR'&&cannon.reload())ui.ammo(cannon);
    if(e.code==='KeyC'){
      cockpit=!cockpit;cameraSnap=true;lookYaw=lookPitch=0;mouseMotion.x=mouseMotion.y=0;
      document.body.classList.toggle('cockpit',cockpit);ui.setCockpit(cockpit);
    }
    return;
  }
  if(e.code==='Space')flapOnce();
  if(e.code==='KeyR')teleport('office');
  if(e.code==='KeyE')perch();
  if(e.code==='KeyB'){sound.coo();ui.toast('Coo. A perfectly reasonable contribution to the meeting.',2500)}
});
listen(window,'keyup',e=>keys.delete(e.code));
listen(window,'blur',()=>{keys.clear();dragging=false;if(benchmarkRunning()){cancelBenchmark('The game window lost focus.');return}if(started&&!paused)ui.open('pause')});
listen(document,'visibilitychange',()=>{if(document.hidden&&benchmarkRunning())cancelBenchmark('The game tab was hidden.');else if(document.hidden&&started&&!paused)ui.open('pause');last=performance.now()});
listen($('world'),'pointerdown',e=>{
  if(!started||paused)return;
  if(mode==='vtol')return;
  dragging=true;dragLast=e.clientX;$('world').setPointerCapture(e.pointerId);
});
listen($('world'),'pointermove',e=>{if(dragging){orbit-=(e.clientX-dragLast)*.006;dragLast=e.clientX}});
listen($('world'),'pointerup',()=>dragging=false);
listen($('world'),'pointercancel',()=>dragging=false);
// Mouse events report each button in a chord; pointerdown/up only report its
// first press / final release, which previously blocked LMB during RMB freelook.
function pilotButtons(e){firing=!vtol.crashed&&Boolean(e.buttons&1);rightMouse=!vtol.crashed&&Boolean(e.buttons&2)}
listen($('world'),'mousedown',e=>{
  if(benchmarkRunning())return;
  if(mode!=='vtol'||!started||paused)return;
  if(!vtolArmed){capturePilot();return}
  pilotButtons(e);
});
listen(window,'mouseup',e=>{if(mode==='vtol'&&vtolArmed)pilotButtons(e)});
listen($('world'),'contextmenu',e=>{if(mode==='vtol')e.preventDefault()});
listen(document,'mousemove',e=>{
  if(mode!=='vtol'||!vtolArmed||paused||vtol.crashed)return;
  if(rightMouse&&!cockpit){
    lookYaw-=e.movementX*.003;lookPitch=THREE.MathUtils.clamp(lookPitch-e.movementY*.003,-1.1,1.1);
  }else{mouseMotion.x+=e.movementX;mouseMotion.y+=e.movementY}
});
listen(document,'pointerlockchange',()=>{
  const locked=document.pointerLockElement===$('world');
  vtolArmed=locked&&mode==='vtol';ui.setCapture(vtolArmed);
  mouseMotion.x=mouseMotion.y=0;keys.clear();firing=false;rightMouse=false;
  if(!locked&&mode==='vtol'&&started&&!paused&&hadPilotLock)ui.open('pause');
  hadPilotLock=locked;
});
let hadPilotLock=false;
function releasePilot(){
  vtolArmed=false;firing=false;rightMouse=false;hadPilotLock=false;
  vtol.afterburner=0;vtol.thrusters.flash=vtol.thrusters.spark=0;sound.rotor(0);
  mouseMotion.x=mouseMotion.y=0;
  if(document.pointerLockElement===$('world'))document.exitPointerLock();
}
async function capturePilot(){
  if(mode!=='vtol'||paused||!started||benchmarkRunning())return;
  try{await $('world').requestPointerLock()}catch{ui.toast('Click the scene again to enable mouse flight.')}
}
for(const button of document.querySelectorAll('[data-key]')){
  const key=button.dataset.key;
  listen(button,'pointerdown',e=>{e.preventDefault();if(paused||!started||mode==='vtol')return;button.setPointerCapture(e.pointerId);keys.add(key);if(key==='KeyE')perch();if(key==='Space')flapOnce()});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(button,type,()=>keys.delete(key));
}
function perch(){
  if(player.perched){player.perched=false;player.position.y+=.3;ui.toast('Back to the breeze.');return}
  const surface=surfaceBelow(player.position,world.colliders,2.7);
  if(surface!==null){player.position.y=surface+.33;player.velocity.set(0,0,0);stopFlight(player.flight);player.perched=true;sound.coo();ui.toast('Lovely spot. Tap Space when you’re ready to fly.')}
  else ui.toast('Find a ledge, desk or rooftop a little closer below.');
}
function flapOnce(){
  if(!started||paused||mode==='vtol')return;
  const p=player.position;
  const tight=world.nearOffice(p);
  if(!flap(player.flight,tight))return;
  if(player.perched){player.perched=false;player.position.y+=.25}
  sound.flap();
  document.getElementById('flap-indicator')?.animate([{transform:'scale(1.2)',opacity:1},{transform:'scale(1)',opacity:.6}],{duration:380});
}

function updateFlight(dt){
  const p=player.position;
  nearOffice=world.nearOffice(p);
  inside=world.inside(p);
  const turn=(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)-(keys.has('KeyD')||keys.has('ArrowRight')?1:0);
  const pitch=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
  const brake=keys.has('ShiftLeft')||keys.has('ShiftRight')||keys.has('KeyC')||keys.has('ControlLeft')||keys.has('ControlRight');
  if(!player.perched){
    player.yaw+=turn*dt*(nearOffice?1.45:1.28);
    advanceFlight(player.flight,dt,{pitch,brake,indoors:nearOffice});
    flightVelocity(player.flight.speed,player.yaw,player.flight.pitch,player.velocity);
    const result=moveWithCollisions(p,player.velocity,dt,world.colliders);
    if(result.hit){
      player.flight.speed=Math.min(player.flight.speed,player.velocity.length());
      if(toastCooldown<=0){
        ui.toast(nearOffice?'A gentle landing. Aim with W / S, then flap.':'Aim up with W and tap Space to clear the rooftops.',2300);toastCooldown=6;
      }
    }
    if(result.grounded&&pitch<0){player.perched=true;player.position.y+=.03;stopFlight(player.flight);player.velocity.set(0,0,0)}
  }else player.yaw+=turn*dt;
  if(inside&&!discoveredOffice){discoveredOffice=true;ui.toast('Welcome to the office. You have no meetings today.',4500)}
  if(inside!==wasInside){ui.progress(crumbs.filter(c=>c.collected).length,inside);wasInside=inside}
  avatar.position.copy(p);avatar.rotation.y=player.yaw;
  avatar.rotation.z=THREE.MathUtils.lerp(avatar.rotation.z,-turn*.2,1-Math.exp(-dt*5));
  avatar.rotation.x=THREE.MathUtils.lerp(avatar.rotation.x,player.flight.pitch*.7,1-Math.exp(-dt*4));
  bird.userData.animate(time,player.velocity.length(),false,player.perched,player.flight.flapAge,dt);
  sound.update(inside,player.velocity.length());
  sound.rotor(0);
}
function onPlayerHit(amount){
  if(mode!=='vtol'||!vtolArmed||paused||vtol.crashed||amount<=0)return;
  const health=vtol.health,crashed=damageVTOL(vtol,amount);
  if(vtol.health<health){ui.playerHit(vtol.health);sound.playerHit()}
  if(crashed)onCrash();
}
function onCrash(){
  crashCount++;keys.clear();firing=rightMouse=false;lookYaw=lookPitch=0;cameraSnap=true;
  flares.clear();
  predators?.simulation.ceasefire();
  impacts.burst(vtol.position);sound.boom();ui.setCockpit(false);
  ui.updateVTOL(vtol,vtolAttitude(vtol),cannon,cockpit,vtolArmed);
}
function updateHelicopter(dt){
  inside=nearOffice=false;
  const previousSpeed=vtol.velocity.length();
  if(vtolArmed){
    const wasCrashed=vtol.crashed;
    const throttle=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0);
    const yaw=(keys.has('KeyA')?1:0)-(keys.has('KeyD')?1:0);
    const pitch=(keys.has('ArrowDown')?1:0)-(keys.has('ArrowUp')?1:0);
    const quickPitch=(keys.has('Space')?1:0)-(keys.has('KeyE')?1:0);
    const roll=(keys.has('ArrowLeft')?1:0)-(keys.has('ArrowRight')?1:0);
    advanceVTOL(vtol,dt,{throttle,yaw,pitch,quickPitch,roll,afterburner:keys.has('ShiftLeft')||keys.has('ShiftRight'),
      pitchDelta:mouseMotion.y*VTOL.mouseSensitivity*pilotSettings.sensitivity*(pilotSettings.invert?1:-1),
      rollDelta:-mouseMotion.x*VTOL.mouseSensitivity*pilotSettings.sensitivity,
    },world.colliders,pilotSettings);
    if(vtol.crashed&&!wasCrashed){
      onCrash();
    }
    if(vtol.respawned){predators?.simulation.ceasefire();cameraSnap=true;ui.clearPlayerHit();ui.integrity(vtol.health);ui.setCockpit(cockpit);ui.toast('PJN–01 rebuilt. Back in clear air.',2200)}
    if(!vtol.crashed&&firing&&cannon.fire(vtol)){
      cyborg.userData.fire(cannon.selected);
      if(cannon.selected===3)sound.bomb();else if(cannon.selected===2)sound.rocket();else sound.poop();
    }
    if(vtol.bumped&&!vtol.crashed&&toastCooldown<=0){ui.toast('Mind the rotor clearance. Ease away from the surface.',2400);toastCooldown=5}
  }
  ui.crash(vtol.respawnIn);
  mouseMotion.x=mouseMotion.y=0;
  cyborg.position.copy(vtol.position);cyborg.quaternion.copy(vtol.orientation);
  cyborg.userData.animate(time,vtol,dt);
  const speed=vtol.velocity.length();
  sound.update(false,speed,'vtol');
  sound.rotor(vtolArmed&&!vtol.crashed?vtol.collective:0,speed,(speed-previousSpeed)/Math.max(dt,1e-6),dt,vtol.afterburner);
}
const ray=new THREE.Ray(),box=new THREE.Box3();
const camWanted=new THREE.Vector3(),camLook=new THREE.Vector3(),camOrigin=new THREE.Vector3(),camDir=new THREE.Vector3(),camScratch=new THREE.Vector3();
function updateCamera(dt){
  if(benchmarkRunning()){
    const pose=benchmarkFlight;
    camera.position.copy(pose.cameraPosition);camera.up.set(0,1,0);camLook.copy(pose.target);camera.lookAt(camLook);
    camera.fov=pose.cockpit?COCKPIT.fov:VTOL_CAMERA.fov;camera.zoom=1;camera.updateProjectionMatrix();
    cyborg.visible=!pose.cockpit;ui.setZoom(false);
    const reticle=$('vtol-reticle'),telemetry=$('cockpit-aim');
    reticle.style.left=telemetry.style.left='50%';reticle.style.top=telemetry.style.top='50%';
    reticle.classList.remove('hidden');telemetry.classList.toggle('hidden',!pose.cockpit);
    return;
  }
  if(import.meta.env.DEV&&overview){
    camera.position.set(...overview.position);camera.up.set(0,1,0);camera.lookAt(...overview.target);
    camera.fov=overview.fov||48;camera.zoom=1;camera.updateProjectionMatrix();return;
  }
  camera.zoom=1;
  if(!started){
    const mobile=innerWidth<650;
    const sway=Math.sin(time*.08)*5;
    camera.fov=mobile?49:43;camera.updateProjectionMatrix();
    camera.position.set(mobile?261:179+sway,mobile?193:137,mobile?297:219);
    camera.lookAt(mobile?new THREE.Vector3(0,65,0):new THREE.Vector3(-39,67,24));
    if(mobile)camera.setViewOffset(innerWidth,innerHeight,0,innerHeight*.2,innerWidth,innerHeight);else camera.clearViewOffset();
    return;
  }
  camera.clearViewOffset();
  if(mode==='vtol'){updateHelicopterCamera(dt);return}
  camera.up.set(0,1,0);
  if(!dragging)orbit*=Math.exp(-dt*2.1);
  const close=nearOffice,angle=player.yaw+orbit;
  const distance=close?3.3:7.6,height=close?.73:2.8;
  camWanted.copy(player.position).add(camScratch.set(Math.sin(angle)*distance,height,Math.cos(angle)*distance));
  camOrigin.copy(player.position);camOrigin.y+=.35;
  camDir.copy(camWanted).sub(camOrigin);const desiredLength=camDir.length();camDir.normalize();
  ray.set(camOrigin,camDir);
  let safeDistance=desiredLength;
  for(const c of segmentColliders(world.colliders,camOrigin,camWanted)){
    box.min.set(c.min.x,c.min.y,c.min.z);box.max.set(c.max.x,c.max.y,c.max.z);
    if(!ray.intersectsBox(box))continue;
    const d=raycastCollider(camOrigin,camDir,c,safeDistance);
    if(d!==null)safeDistance=Math.max(.42,d-.2);
  }
  camWanted.copy(camOrigin).addScaledVector(camDir,safeDistance);
  const followRate=7+player.flight.speed*.35;
  camera.position.lerp(camWanted,cameraSnap?1:1-Math.exp(-dt*followRate));
  camLook.copy(player.position).add(camScratch.set(-Math.sin(angle)*1.8,close?.32:.55,-Math.cos(angle)*1.8));
  camera.lookAt(camLook);
  camera.fov=THREE.MathUtils.lerp(camera.fov,close?69:64,1-Math.exp(-dt*4));camera.updateProjectionMatrix();
  cameraSnap=false;
  // Never let a close wall put the large bird mesh through the camera.
  bird.visible=camera.position.distanceTo(player.position)>.78;
}
const aircraftForward=new THREE.Vector3(),aircraftUp=new THREE.Vector3(),viewRotation=new THREE.Quaternion(),viewOffset=new THREE.Quaternion(),lookEuler=new THREE.Euler(0,0,0,'YXZ');
const vtolChase=new VTOLChaseCamera();
function updateHelicopterCamera(dt){
  const inCockpit=cockpit&&!vtol.crashed;
  const freeLook=rightMouse&&!cockpit&&!vtol.crashed,zoomed=rightMouse&&inCockpit&&vtolArmed&&!paused;
  if(inCockpit||vtol.crashed){lookYaw=lookPitch=0}
  else if(!freeLook){lookYaw*=Math.exp(-dt*5);lookPitch*=Math.exp(-dt*5)}
  viewOffset.setFromEuler(lookEuler.set(lookPitch,lookYaw,0));viewRotation.copy(vtol.orientation).multiply(viewOffset);
  aircraftForward.set(0,0,-1).applyQuaternion(viewRotation);
  aircraftUp.set(0,1,0).applyQuaternion(vtol.orientation);
  camOrigin.copy(vtol.position);
  if(inCockpit){
    camWanted.set(0,1.85,-3.35).applyQuaternion(vtol.orientation).add(vtol.position);
    camera.position.copy(camWanted);camera.up.copy(aircraftUp);camLook.copy(camWanted).addScaledVector(aircraftForward,100);
  }else{
    vtolChase.update(vtol,dt,{settings:pilotSettings,colliders:world.colliders,lookYaw,lookPitch,snap:cameraSnap});
    camera.position.copy(vtolChase.position);camLook.copy(vtolChase.target);camera.up.set(0,1,0);
  }
  camera.lookAt(camLook);camera.fov=inCockpit?COCKPIT.fov:VTOL_CAMERA.fov;
  camera.zoom=zoomed?COCKPIT.zoom:1;camera.updateProjectionMatrix();cameraSnap=false;
  ui.setZoom(zoomed);
  cyborg.visible=!inCockpit&&!vtol.crashed&&camera.position.distanceTo(vtol.position)>5;
  cannon.muzzle(vtol,projection);
  camWanted.copy(projection).addScaledVector(aircraftForward.set(0,0,-1).applyQuaternion(vtol.orientation),350);
  // Correct third-person parallax against nearby scenery; the cannon still has ballistic drop.
  // Bombs fall from the belly; their reticle remains a flight reference.
  const aimHit=cannon.selected===3?null:cannon.trace(projection,camWanted);
  projection.copy(aimHit?aimHit.point:camWanted);
  const ahead=camScratch.copy(projection).sub(camera.position).dot(camera.getWorldDirection(camDir))>0;
  projection.project(camera);
  const reticle=$('vtol-reticle');
  reticle.style.left=`${(projection.x*.5+.5)*innerWidth}px`;reticle.style.top=`${(-projection.y*.5+.5)*innerHeight}px`;
  const aimVisible=ahead&&Math.abs(projection.x)<=1&&Math.abs(projection.y)<=1&&vtolArmed&&!vtol.crashed;
  reticle.classList.toggle('hidden',!aimVisible);
  const telemetry=$('cockpit-aim');
  telemetry.style.left=reticle.style.left;telemetry.style.top=reticle.style.top;
  telemetry.classList.toggle('hidden',!inCockpit||!aimVisible);
}
function updateCrumbs(dt){
  for(let i=0;i<crumbs.length;i++){
    const c=crumbs[i];if(c.collected&&!benchmarkRunning())continue;
    c.mesh.position.y=c.position.y+Math.sin(time*2+i)*.09;
    c.mesh.rotation.y=time*.7+i;c.ring.rotation.x=Math.sin(time+i)*.22;
    if(started&&mode==='pigeon'&&!paused&&player.position.distanceTo(c.position)<.95){
      c.collected=true;c.mesh.visible=false;sound.crumb();
      const count=crumbs.filter(c=>c.collected).length;
      ui.progress(count,inside);save();
      ui.toast(count===12?'Twelve crumbs. One happy pigeon.':`${['A little treasure.','An excellent snack.','Finder’s keepers.','A good day just got better.'][count%4]} ${count} / 12`,2200);
      for(let n=0;n<9;n++){
        const mesh=new THREE.Mesh(sparkleGeo,crumbMat);mesh.position.copy(c.position);scene.add(mesh);
        sparkles.push({mesh,age:0,velocity:new THREE.Vector3((Math.random()-.5)*2,Math.random()*1.6,(Math.random()-.5)*2)});
      }
      if(count===12)ui.open('complete');
    }
  }
  for(let i=sparkles.length-1;i>=0;i--){
    const s=sparkles[i];s.age+=dt;s.mesh.position.addScaledVector(s.velocity,dt);s.mesh.scale.setScalar(Math.max(0,1-s.age/.8));
    if(s.age>.8){scene.remove(s.mesh);sparkles.splice(i,1)}
  }
}
const projection=new THREE.Vector3(),camForward=new THREE.Vector3(),waypointTarget=new THREE.Vector3();
function waypoint(){
  if(!started||mode==='vtol'||inside||player.position.distanceTo(TERRACE)<5){$('waypoint').classList.add('hidden');return}
  const target=waypointTarget.copy(TERRACE);target.y+=2.6;
  camera.getWorldDirection(camForward);
  if(camScratch.copy(target).sub(camera.position).dot(camForward)<0){$('waypoint').classList.add('hidden');return}
  projection.copy(target).project(camera);
  if(Math.abs(projection.x)>.87||Math.abs(projection.y)>.72){$('waypoint').classList.add('hidden');return}
  $('waypoint').classList.remove('hidden');$('waypoint').style.left=`${(projection.x*.5+.5)*innerWidth}px`;$('waypoint').style.top=`${(-projection.y*.5+.5)*innerHeight}px`;
  $('waypoint-distance').textContent=`${Math.round(player.position.distanceTo(TERRACE))} m`;
}
listen(window,'resize',()=>{
  if(benchmarkRunning())cancelBenchmark('The window size changed during the flight.');
  needsRender=true;
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  cockpitView.resize(camera.aspect);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.65));renderer.setSize(innerWidth,innerHeight);cameraSnap=true;
});
listen($('world'),'webglcontextlost',e=>{
  if(benchmarkRunning())cancelBenchmark('The graphics context was interrupted.');
  e.preventDefault();paused=true;$('error-message').textContent='The graphics context was interrupted. Refresh to return to your saved adventure.';$('error').classList.remove('hidden');
});
function animate(now){
  if(disposed)return;
  frame=requestAnimationFrame(animate);
  // A first rAF timestamp can precede setup's performance.now() after scene construction.
  const elapsed=Math.max(0,(now-last)/1000),dt=Math.min(elapsed,.1);last=now;
  if(benchmarkRunning()){
    if(window.devicePixelRatio!==benchmark.config.devicePixelRatio){cancelBenchmark('Display pixel density changed during the flight.');return}
    benchmarkGPU.poll();
    const state=benchmark.begin(now);
    benchmarkUI.progress(benchmark,now);
    if(benchmark.phase==='settling'){
      if(!benchmarkGPU.pending.length||now-benchmark.settleStart>=1000)finishBenchmark();
      return;
    }
    if(state.reset)resetBenchmarkWorld();
  }
  // Keep the last image behind menus, without submitting another 3D frame.
  // A resize or a newly opened pause screen requests one fresh frame.
  if(paused&&!needsRender)return;
  needsRender=false;
  const workStart=performance.now();
  if(!paused&&!benchmarkRunning())time+=dt;
  frameCount++;frameTime+=elapsed;if(frameTime>1){fps=Math.round(frameCount/frameTime);frameCount=0;frameTime=0}
  toastCooldown=Math.max(0,toastCooldown-dt);
  if(started&&!paused){
    if(benchmarkRunning())updateBenchmark(benchmark.phase==='warmup'?benchmark.elapsedMs/5000*30:benchmark.elapsedMs/1000,dt);
    else if(mode==='vtol')updateHelicopter(dt);else updateFlight(dt);
  }
  avatar.visible=started&&mode==='pigeon';
  if(mode!=='vtol'||!started)cyborg.visible=false;
  if(!paused){
    world.update(time);
    for(const f of flock){
      const a=time*.075+f.phase;f.parent.position.set(Math.cos(a)*(55+f.phase*4),98+Math.sin(a*2)*7,Math.sin(a)*53);
      f.parent.rotation.y=-a+Math.PI/2;f.parent.rotation.z=-.12;f.pigeon.userData.animate(time+f.phase,15,false,false);
    }
    updateCrumbs(dt);
    if(!benchmarkRunning())predators?.update(dt,{position:vtol.position,velocity:vtol.velocity,active:started&&mode==='vtol'&&vtolArmed&&!vtol.crashed});
    if(mode==='vtol'&&vtolArmed)cannon.update(dt);
    impacts.update(dt);
    if(!benchmarkRunning())flares.update(dt);
  }
  updateCamera(dt);world.sky?.position.copy(camera.position);waypoint();
  flares.render(camera);
  predators?.render(camera,started&&!paused&&mode==='vtol'&&!vtol.crashed);
  const focus=started?(mode==='vtol'?vtol.position:player.position):{x:0,z:0};
  stableSun.update(focus);
  if(started&&frameCount%4===0){
    if(mode==='vtol'){
      const attitude=vtolAttitude(vtol);ui.updateVTOL(vtol,attitude,cannon,cockpit,vtolArmed||!!benchmarkRunning(),flares.cooldown);
      ui.minimap(vtol.position,attitude.yaw,[],world.buildings,false);
    }else{
      ui.update(player.position,player.velocity.length(),inside,nearOffice,player.perched,player.flight.flapAge);
      ui.minimap(player.position,player.yaw,crumbs,world.buildings,inside);
    }
  }
  renderer.info.reset();
  const sample=benchmark?.phase==='measuring'?{t:benchmark.elapsedMs/1000,section:sectionAt(benchmark.elapsedMs/1000),gpuMs:null}:null;
  if(sample)benchmarkGPU.begin(sample);
  const inCockpit=started&&mode==='vtol'&&cockpit&&!vtol.crashed;
  renderer.toneMappingExposure=inCockpit?COCKPIT.exposure:theme.exposure;
  renderer.render(scene,camera);
  if(inCockpit){
    cockpitView.update(vtol,vtolAttitude(vtol),paused?0:dt);
    renderer.autoClear=false;renderer.clearDepth();renderer.render(cockpitView.scene,cockpitView.camera);renderer.autoClear=true;
  }
  renderedFrames++;
  if(sample){
    benchmarkGPU.end();sample.jsMs=performance.now()-workStart;
    sample.calls=renderer.info.render.calls;sample.triangles=renderer.info.render.triangles;
    benchmark.rendered(now,sample);
  }
}
start(initialMode);updateCamera(0);renderer.render(scene,camera);
// Warm up every shader/pipeline variant the flight can reach while the loading
// screen is still up. Metal/ANGLE builds pipeline state on the first draw, so
// each hidden model, empty instance pool and projectile template is drawn once
// (off-screen, no fragments) instead of stalling the frame that first needs it.
const shaderProbes=new THREE.Group();
{
  const round=new THREE.Mesh(cannon.geometry,cannon.brown),cap=new THREE.Mesh(cannon.geometry,cannon.white);
  const splat=new THREE.Mesh(cannon.splashGeometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide,transparent:true,depthWrite:false}));
  const flash=new THREE.Mesh(impacts.puffGeometry,new THREE.MeshBasicMaterial({transparent:true,depthWrite:false}));
  const puffs=new THREE.InstancedMesh(impacts.puffGeometry,new THREE.MeshBasicMaterial({transparent:true,depthWrite:false}),1);
  const shards=new THREE.InstancedMesh(impacts.shardGeometry,new THREE.MeshStandardMaterial({transparent:true,metalness:.5,roughness:.7}),1);
  shaderProbes.add(round,cap,splat,flash,puffs,shards,cannon.rocketTemplate,cannon.bombTemplate);
  shaderProbes.position.copy(camera.position);shaderProbes.position.y-=50;
  const saved=[];
  const expose=root=>root.traverse(o=>{
    if(!o.isMesh&&!o.isGroup&&!o.isObject3D)return;
    saved.push([o,o.visible,o.frustumCulled,o.isInstancedMesh?o.count:null]);
    o.visible=true;if(o.isMesh)o.frustumCulled=false;if(o.isInstancedMesh&&o.count===0)o.count=1;
  });
  scene.add(shaderProbes);expose(scene);expose(cockpitView.scene);
  renderer.render(scene,camera);
  renderer.autoClear=false;renderer.clearDepth();renderer.render(cockpitView.scene,cockpitView.camera);renderer.autoClear=true;
  for(const [o,visible,frustumCulled,count] of saved){o.visible=visible;o.frustumCulled=frustumCulled;if(count!==null)o.count=count}
  scene.remove(shaderProbes);shaderProbes.remove(cannon.rocketTemplate,cannon.bombTemplate);
  renderer.render(scene,camera);
}
ui.loaded();frame=requestAnimationFrame(animate);
if(initialBenchmark)beginBenchmark();

// Read-only diagnostics in production; deterministic controls are exposed only to local dev tests.
window.__littleWings={getState:()=>({
  mapId,started,paused,inside,nearOffice,perched:player.perched,position:player.position.toArray(),yaw:player.yaw,
  benchmark:{phase:benchmark?.phase??'idle',elapsedMs:benchmark?.elapsedMs??0,reason:benchmarkReason,result:benchmarkResult},
  renderedFrames,
  speed:player.flight.speed,pitch:player.flight.pitch,flapCount:player.flight.flapCount,flapAge:player.flight.flapAge,
  jetDeployment:bird.userData.jets.deployment,
  mode,vtol:{position:vtol.position.toArray(),velocity:vtol.velocity.toArray(),orientation:vtol.orientation.toArray(),...vtolAttitude(vtol),
    collective:vtol.collective,afterburner:vtol.afterburner,thrusters:{...vtol.thrusters},flares:flares.snapshot(),grounded:vtol.grounded,armed:vtolArmed,cockpit,zoom:camera.zoom,freeLook:rightMouse&&!cockpit,firing,
    health:vtol.health,crashed:vtol.crashed,respawnIn:vtol.respawnIn,impactSpeed:vtol.impactSpeed,crashes:crashCount,airframeVisible:cyborg.visible,appearance:cyborg.userData.getAppearance(),
    weapon:cannon.selected,weaponName:cannon.weapon.name,damage:cannon.damage,damagedSurfaces:cannon.surfaceDamage.size,
    ammo:cannon.ammo,reloadRemaining:cannon.reloadRemaining,magazines:structuredClone(cannon.magazines),
    shotsByWeapon:{...cannon.shotsByWeapon},shots:cannon.shots,hits:cannon.hits,projectiles:cannon.projectiles.length,splats:cannon.splats.length,effects:impacts.active.length,settings:{...pilotSettings}},
  audio:sound.getState(),
  crumbs:crumbs.filter(c=>c.collected).length,visibleCrumbs:crumbs.filter(c=>!c.collected).map(c=>c.position.toArray()),
  fps,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
  rendering:{logarithmicDepth:renderer.capabilities.logarithmicDepthBuffer,reversedDepth:renderer.capabilities.reversedDepthBuffer,near:camera.near,shadowTarget:sun.target.position.toArray()},
  memory:{...renderer.info.memory},colliderCount:world.colliders.length,buildingCount:world.buildings.length,
  landmarks:world.landmarks,predators:predators?.simulation.snapshot()||null,
  detailedTowers:[...new Set(world.buildings.filter(b=>b.detailed).map(b=>b.profile))]
})};
if(import.meta.env.DEV){
  Object.assign(window.__littleWings,{
    setOverview(position,target,fov=48){overview=position?{position,target,fov}:null},
    getSceneStats(){const items=[];scene.traverse(o=>{if(o.isMesh)items.push({name:o.name,triangles:(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.count||1),instances:o.count||1,shadow:o.castShadow})});return items.sort((a,b)=>b.triangles-a.triangles).slice(0,20)},
    getRenderBreakdown(){
      const meshes=[];scene.traverse(o=>{if(o.isMesh||o.isInstancedMesh){o.geometry.computeBoundingSphere();meshes.push({name:o.name,material:o.material.name||o.material.type,triangles:(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.count||1),instances:o.count||1,shadow:o.castShadow,radius:Math.round(o.geometry.boundingSphere.radius),frustumCulled:o.frustumCulled,transparent:o.material.transparent,ranges:o.userData.staticRanges?.length||0})}});
      const pass=()=>{renderer.info.reset();renderer.render(scene,camera);return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}};
      // Per-object triangle attribution for the shadow and camera passes.
      const perObject=new Map(),original=renderer.renderBufferDirect;
      renderer.renderBufferDirect=function(cam,scn,geometry,material,object,group){
        const range=geometry.drawRange,count=group?group.count:Math.min(range.count,(geometry.index?geometry.index.count:geometry.attributes.position.count)-range.start);
        const key=`${object.name||object.type}/${material.name||material.type}`,entry=perObject.get(key)||{shadow:0,main:0,shadowCalls:0,mainCalls:0};
        const shadow=cam!==camera;entry[shadow?'shadow':'main']+=count/3*(object.count||1);entry[shadow?'shadowCalls':'mainCalls']++;perObject.set(key,entry);
        return original.call(this,cam,scn,geometry,material,object,group);
      };
      const withShadows=pass();renderer.renderBufferDirect=original;
      const enabled=renderer.shadowMap.enabled;renderer.shadowMap.enabled=false;const noShadows=pass();renderer.shadowMap.enabled=enabled;sun.shadow.needsUpdate=true;
      return {meshCount:meshes.length,withShadows,noShadows,meshes:meshes.sort((a,b)=>b.triangles-a.triangles),perObject:[...perObject.entries()].map(([name,v])=>({name,...v})).sort((a,b)=>(b.shadow+b.main)-(a.shadow+a.main))};
    },
    getPredators:()=>predators?.simulation.snapshot(),
    getColliders:()=>world.colliders,
    getPredatorPoses:()=>predators?.poses(),
    advancePredators(seconds){
      for(let t=0;t<Math.min(240,seconds);t+=.05)predators?.update(Math.min(.05,seconds-t),{position:vtol.position,velocity:vtol.velocity,active:false});
    },
    setPredator(id,position){const e=predators?.simulation.enemies.find(e=>e.id===id);if(e){e.position.set(...position);e.home.copy(e.position)}},
    damagePredator(id,amount){predators?.simulation.damage(predators.simulation.enemies.find(e=>e.id===id),amount)},
    damagePlayer:onPlayerHit,
    respawnVTOL(){teleport('spawn')},
    teleport(x,y,z,yaw=0){player.position.set(x,y,z);player.yaw=yaw;player.velocity.set(0,0,0);player.perched=false;stopFlight(player.flight);cameraSnap=true},
    collectPosition:index=>crumbs[index].position.toArray(),
    getCamera:()=>({position:camera.position.toArray(),target:camLook.toArray(),zoom:camera.zoom,effectiveFov:camera.getEffectiveFOV()}),
    teleportVTOL(x,y,z,yaw=0,velocity=[0,0,0]){resetVTOL(vtol,[x,y,z],yaw);vtol.velocity.set(...velocity);ui.clearPlayerHit();ui.integrity(vtol.health);ui.crash(0);ui.setCockpit(cockpit);cameraSnap=true;needsRender=true},
    getProjectiles:()=>cannon.projectiles.map(p=>({weapon:p.weapon.id,position:p.mesh.position.toArray(),velocity:p.velocity.toArray(),name:p.mesh.name}))
  });
}

function dispose(){
  if(disposed)return;
  disposed=true;cancelAnimationFrame(frame);releasePilot();events.abort();
  benchmarkGPU?.clear();benchmarkUI.dispose();
  ui.showHome();ui.dispose();ui.crash(0);sound.dispose();
  predators?.dispose();
  cannon.clear();impacts.clear();flares.clear();
  disposeResources(scene,cockpitView.scene,shaderProbes,cannon.rocketTemplate,cannon.bombTemplate,cannon.geometry,cannon.splashGeometry,cannon.brown,cannon.white,
    impacts.puffGeometry,impacts.shardGeometry,impacts.ringGeometry,sparkleGeo,crumbMat,ringMat,environmentTarget,sun.shadow.map);
  scene.clear();renderer.renderLists.dispose();renderer.dispose();
  const memory={...renderer.info.memory};
  window.__littleWings={getState:()=>({started:false,mapId:null,memory})};
}
return {dispose};
}
