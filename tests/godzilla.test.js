import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GODZILLA, godzillaSpawn, godzillaDamageScale, ballisticVelocity, godzillaMuzzle } from '../src/godzilla.js';
import { createGodzilla, createTrainWagon } from '../src/godzilla-model.js';
import { PredatorSimulation } from '../src/predator-simulation.js';
import { PoopCannon, CANNON, ROCKET, BOMB } from '../src/poop-cannon.js';
import { createVTOLState, resetVTOL } from '../src/vtol-flight.js';
import { pointInPolygon } from '../src/collision.js';
import { disposeResources } from '../src/dispose-scene.js';

const v=(...p)=>new THREE.Vector3(...p);
const setup=(options={})=>new PredatorSimulation({spawns:[{type:'godzilla',position:[0,184.4,0]}],...options});
const target=(z=-120)=>({position:v(0,190,z),velocity:v(0,0,0),active:true});
const tick=(s,seconds,t=target(),hz=120)=>{for(let i=0;i<Math.round(seconds*hz);i++)s.update(1/hz,t)};
const direct=(s,weapon,distance)=>s.impact({point:s.enemies[0].position.clone(),normal:v(0,0,-1),enemy:s.enemies[0]},weapon,distance);

test('Godzilla sits on the mapped Silberturm high core and stays peaceful in close proximity',()=>{
  const data=JSON.parse(readFileSync(new URL('../src/maps/frankfurt-data.json',import.meta.url)));
  const spawn=godzillaSpawn(data),[x,y,z]=spawn.position;
  assert.ok(pointInPolygon(x,z,data.parts[1333665179].points));
  assert.equal(y-GODZILLA.bodyHeight,166.4);
  let hits=0;const s=setup({spawns:[spawn],onPlayerHit:()=>hits++}),home=s.enemies[0].position.clone();
  tick(s,30,{position:home.clone().add(v(0,0,-25)),velocity:v(0,0,0),active:true});
  assert.equal(hits,0);assert.equal(s.attacks,0);assert.equal(s.enemies[0].hostile,false);
  assert.deepEqual(s.enemies[0].position,home);
});

test('only damage provokes the boss; close hits are full strength and a magazine cannot defeat it',()=>{
  const s=setup({spawns:[{type:'godzilla',position:[0,184,0]},{type:'hawk',position:[40,184,0]}]});
  const boss=s.enemies[0];s.damage(boss,0);assert.equal(boss.hostile,false);
  assert.equal(direct(s,CANNON,60),10);assert.equal(boss.hostile,true);
  for(let i=0;i<8;i++)direct(s,ROCKET,70);
  assert.equal(boss.health,3200-10-640);assert.equal(s.enemies[1].hostile,false);
});

test('cannon and rocket falloff is continuous; bombs retain their close-pass reward',()=>{
  for(const weapon of [CANNON,ROCKET]){
    const s=setup();
    assert.equal(godzillaDamageScale(weapon,90),1);
    assert.ok(godzillaDamageScale(weapon,180)>.4&&godzillaDamageScale(weapon,180)<.5);
    assert.ok(godzillaDamageScale(weapon,250)<.041);
    const damage=direct(s,weapon,600);
    assert.ok(Math.abs(damage-weapon.damage*.04)<1e-10);
  }
  assert.equal(direct(setup(),BOMB,900),200);
});

test('every exposed body part resists safe-distance fire, including the tail and launcher offset',()=>{
  const s=setup(),boss=s.enemies[0];
  for(const volume of s.volumes(boss)){
    // The nose launcher starts almost five metres closer than the aircraft.
    const shortestShot=GODZILLA.range-boss.position.distanceTo(volume.center)-volume.radius-5;
    const damagePerSecond=CANNON.damage/CANNON.interval*godzillaDamageScale(CANNON,shortestShot)
      +ROCKET.damage/ROCKET.interval*godzillaDamageScale(ROCKET,shortestShot);
    assert.ok(damagePerSecond<GODZILLA.regeneration,'even both weapons with no reload downtime lose to repair outside throw range');
  }
});

test('real projectiles carry travelled distance into direct and splash boss impacts',()=>{
  for(const weapon of [CANNON,ROCKET]){
    const measure=distance=>{
      const s=setup(),gun=new PoopCannon(new THREE.Scene(),[]),pilot=createVTOLState();
      gun.actors=s;resetVTOL(pilot,[0,190,distance],0);gun.select(weapon.id);gun.fire(pilot);
      // Moving the aircraft after launch must not make an old shot stronger.
      pilot.position.set(0,190,20);
      for(let i=0;i<800&&gun.projectiles.length;i++)gun.update(1/120);
      const result=3200-s.enemies[0].health;gun.clear();return result;
    };
    assert.ok(measure(60)>weapon.damage*.95);
    assert.ok(measure(310)<weapon.damage*.05);
  }
  const s=setup(),boss=s.enemies[0],hit={point:v(0,184.4,14),normal:v(0,0,-1)};
  const close=s.impact(hit,ROCKET,40);s.reset();const far=s.impact(hit,ROCKET,500);
  assert.ok(close>0);assert.ok(Math.abs(far/close-.04)<1e-8);assert.equal(boss.hostile,true);
});

test('regeneration is gradual, capped, frame independent, and does not stall on distant chip hits',()=>{
  const health=[];
  for(const hz of [30,120]){
    const s=setup();s.damage(s.enemies[0],1000);tick(s,10,{...target(),active:false},hz);
    health.push(s.enemies[0].health);assert.ok(Math.abs(s.enemies[0].health-2320)<1e-7);
    const frozen=s.snapshot();s.update(0,target());assert.deepEqual(s.snapshot(),frozen);
    tick(s,100,{...target(),active:false},hz);assert.equal(s.enemies[0].health,3200);
  }
  assert.ok(Math.abs(health[0]-health[1])<1e-7);
  // Both magazines sustained together from outside throw range lose to repair.
  const s=setup();s.damage(s.enemies[0],800);
  let rocket=0,cannon=0;
  for(let i=0;i<120*40;i++){
    if(i%42===0&&rocket++%19<8)direct(s,ROCKET,310);
    if(i%21===0&&cannon++%31<20)direct(s,CANNON,310);
    s.update(1/120,target(340));
  }
  assert.ok(s.enemies[0].health>2400);assert.equal(s.attacks,0);
});

test('close strafing passes overcome repair between runs and can neutralize the boss',()=>{
  const s=setup();let passes=0;
  while(s.enemies[0].health>0&&passes<12){
    for(let i=0;i<8&&s.enemies[0].health>0;i++){direct(s,ROCKET,75);tick(s,.35,{...target(),active:false})}
    if(s.enemies[0].health>0)tick(s,9,{...target(400),active:false});
    passes++;
  }
  assert.ok(passes>=5&&passes<=8);assert.equal(s.defeated,1);
});

test('the boss telegraphs and alternates rocks with wagons; attacks stop outside range and behind walls',()=>{
  let hits=0;const s=setup({onPlayerHit:()=>hits++}),boss=s.enemies[0];
  s.damage(boss,300);const kinds=new Set();let windup=false;
  for(let i=0;i<120*20;i++){
    s.update(1/120,target());windup ||= boss.windup>0;
    for(const r of s.rocks){
      kinds.add(r.kind);assert.ok(r.position.distanceTo(r.origin)<=GODZILLA.range);
    }
  }
  assert.ok(windup);assert.deepEqual([...kinds].sort(),['rock','wagon']);assert.ok(hits>0);
  s.ceasefire();s.damage(boss,1);const count=s.attacks;
  tick(s,15,target(350));assert.equal(s.attacks,count);
  s.colliders=[{min:{x:-100,y:0,z:-60},max:{x:100,y:300,z:-58}}];
  tick(s,15,target());assert.equal(s.attacks,count);
});

test('ballistic launch speed is bounded and throws hit the aimed point at multiple altitudes',()=>{
  const from=v(0,190,0);
  for(const y of [30,190,240]){
    const to=v(160,y,0),velocity=ballisticVelocity(from,to,92);
    assert.ok(velocity);assert.ok(Math.abs(velocity.length()-92)<1e-8);
    const seconds=160/velocity.x,end=from.clone().addScaledVector(velocity,seconds);end.y-=.5*GODZILLA.gravity*seconds*seconds;
    assert.ok(end.distanceTo(to)<1e-7);
  }
  assert.equal(ballisticVelocity(from,v(500,190,0),84),null);
  const s=setup(),boss=s.enemies[0];s.damage(boss,1);
  assert.equal(s.throwDebris(boss,{...target(),velocity:v(0,0,-1000)}),false);
});

test('debris stops at scenery and cannot damage players outside its range, including downhill',()=>{
  let hits=0;const s=setup({onPlayerHit:()=>hits++}),boss=s.enemies[0];
  s.throwDebris(boss,target());
  const rock=s.rocks[0],from=godzillaMuzzle(boss);
  s.colliders=[{min:{x:-100,y:0,z:-62},max:{x:100,y:400,z:-60}}];
  tick(s,4,target());assert.equal(hits,0);assert.equal(s.rocks.length,0);
  s.colliders=[];s.rocks.push({...rock,position:from,velocity:v(0,-20,-160),age:0});
  tick(s,4,{position:v(11,130,-330),active:true});assert.equal(hits,0);assert.equal(s.rocks.length,0);
});

test('defeat clears boss debris, prevents regeneration, then returns peacefully; reset clears the encounter',()=>{
  const s=setup(),boss=s.enemies[0];s.damage(boss,1);s.throwDebris(boss,target());assert.ok(s.rocks.length);
  s.damage(boss,10000);assert.equal(s.rocks.length,0);assert.equal(boss.respawnIn,90);
  tick(s,89);assert.equal(boss.health,0);
  tick(s,1.1);assert.equal(boss.health,3200);assert.equal(boss.hostile,false);
  s.damage(boss,100);s.throwDebris(boss,target());s.ceasefire();assert.equal(s.rocks.length,0);assert.equal(boss.hostile,false);
  s.reset();assert.equal(boss.health,3200);assert.equal(boss.throws,0);assert.equal(s.attacks,0);
});

test('seated cyborg and wagon models are bounded, articulated, and release their GPU resources',()=>{
  const model=createGodzilla(),s=setup(),boss=s.enemies[0],wagon=createTrainWagon();
  model.userData.animate(0,boss);assert.ok(model.userData.getPose().seated);
  boss.windup=.5;boss.throwKind='wagon';model.userData.animate(1,boss);
  assert.equal(model.userData.getPose().throwing,'wagon');
  assert.equal(model.userData.getPose().tailSegments,6);
  let triangles=0;model.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3});
  assert.ok(triangles<22000,`${triangles} triangles`);
  assert.equal(model.levels[1].object.children[0].children.length,2);
  assert.equal(wagon.children.length,1);
  const geometry=model.getObjectByName('godzilla-jaw').children[0].geometry;
  let disposed=false;geometry.addEventListener('dispose',()=>{disposed=true});
  disposeResources(model,wagon);assert.ok(disposed);
});
