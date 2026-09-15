import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { PredatorSimulation, PREDATORS, EAGLE_TRAITS } from '../src/predator-simulation.js';
import { CANNON, ROCKET, BOMB } from '../src/poop-cannon.js';
import { eagleNest, WESTEND_NEST } from '../src/maps/frankfurt-nest.js';
import { createPredator } from '../src/predator-models.js';
import { VTOL } from '../src/vtol-flight.js';

const v=(x,y,z)=>new THREE.Vector3(x,y,z);
function nestSim(extra=[],options={}){
  return new PredatorSimulation({spawns:[...eagleNest(),...extra],...options});
}
const eaglesOf=s=>s.enemies.filter(e=>e.type==='eagle');
const run=(s,seconds,target)=>{for(let i=0;i<Math.round(seconds*60);i++)s.update(1/60,target)};

test('the Westend nest holds five perched eagles that patrol individually and come back to rest',()=>{
  const s=nestSim(),target={position:v(-300,150,200),velocity:v(0,0,0),active:true};
  const [cx,cy,cz]=WESTEND_NEST.center;
  for(const e of eaglesOf(s)){
    assert.equal(e.flight.stage,'perch');assert.equal(e.nest,'westend');
    assert.ok(Math.hypot(e.position.x-cx,e.position.z-cz)<WESTEND_NEST.radius+.01&&e.position.y===cy,'perches ring the crown');
  }
  const stages=new Map(eaglesOf(s).map(e=>[e.id,new Set()])),farthest=new Map();
  for(let i=0;i<60*90;i++){
    s.update(1/60,target);
    for(const e of eaglesOf(s)){stages.get(e.id).add(e.flight.stage);farthest.set(e.id,Math.max(farthest.get(e.id)||0,e.position.distanceTo(e.home)))}
  }
  for(const e of eaglesOf(s)){
    assert.deepEqual([...stages.get(e.id)].sort(),['patrol','perch','return'],`${e.id} rests, patrols and returns`);
    assert.ok(farthest.get(e.id)>30,'patrols leave the crown');
  }
  assert.ok(new Set([...farthest.values()].map(d=>Math.round(d/10))).size>=3,'orbit sizes differ between birds');
  assert.equal(s.attacks,0);assert.ok(eaglesOf(s).every(e=>!e.hostile),'neutral eagles never attack');
});

test('one hit alerts the whole nest with a staggered launch, without provoking unrelated animals',()=>{
  const events=[];
  const s=nestSim([{type:'hawk',position:[-700,200,30]}],{onEvent:(name,e)=>events.push(`${name}:${e.type}`)});
  const target={position:v(-500,180,120),velocity:v(0,0,0),active:true};
  run(s,1,target);
  const [first,...rest]=eaglesOf(s);
  s.damage(first,10);
  assert.ok(eaglesOf(s).every(e=>e.hostile),'every nest eagle turns hostile');
  assert.equal(s.enemies.find(e=>e.type==='hawk').hostile,false,'the hawk is not part of the nest');
  assert.equal(events.filter(n=>n==='nest:eagle').length,1);assert.equal(events.filter(n=>n==='provoked:eagle').length,1);
  const launches=rest.map(e=>e.flight.launch);
  assert.ok(launches.every((l,i)=>l>0&&(i===0||l>launches[i-1])),'launch delays increase along the flock');
  run(s,3,target);
  const airborne=eaglesOf(s).filter(e=>['approach','pass','climb'].includes(e.flight.stage)).length;
  assert.ok(airborne>=2&&airborne<5,'the flock is still leaving the nest after three seconds');
  run(s,4,target);
  assert.ok(eaglesOf(s).every(e=>['approach','pass','climb'].includes(e.flight.stage)),'all five hunt within seven seconds');
});

test('hunting eagles pace the pilot, on separate paths and paces, and strike in passes',()=>{
  let damage=0,strikes=0;
  const s=nestSim([],{onPlayerHit:d=>damage+=d,onEvent:n=>{if(n==='strike')strikes++}});
  const target={position:v(-741,180,-320),velocity:v(0,0,0),active:true};
  s.damage(eaglesOf(s)[0],10);
  let top=0,crowded=0,pairs=0;const closeTime=new Map(eaglesOf(s).map(e=>[e.id,0])),stages=new Set();
  for(let i=0;i<60*30;i++){
    // The aircraft cruises a wide arc at about 160 km/h, below the flock's floor.
    const a=i/60*.136;target.velocity.set(-Math.sin(a)*45,0,Math.cos(a)*45);target.position.set(-741+Math.cos(a)*330,180,-320+Math.sin(a)*330+330);
    s.update(1/60,target);
    const eagles=eaglesOf(s);
    for(const e of eagles){
      top=Math.max(top,e.speed);stages.add(e.flight.stage);
      if(e.position.distanceTo(target.position)<6)closeTime.set(e.id,closeTime.get(e.id)+1/60);
    }
    if(i>60*12)for(let a=0;a<eagles.length;a++)for(let b=a+1;b<eagles.length;b++){pairs++;if(eagles[a].position.distanceTo(eagles[b].position)<5)crowded++}
  }
  const cruise=PREDATORS.eagle.baseline;
  assert.ok(top>cruise*.95&&top<cruise*1.15,`eagles hold the 200 km/h floor against a slower pilot: ${top.toFixed(0)} m/s`);
  assert.ok(PREDATORS.eagle.speed<VTOL.maxSpeed&&PREDATORS.eagle.speed>VTOL.maxSpeed*.9,'afterburners stay a little faster than the flock cap');
  assert.ok(strikes>=3&&damage===strikes*PREDATORS.eagle.damage,'strikes land with the eagle damage value');
  assert.ok(stages.has('pass')&&stages.has('climb'),'attacks overshoot and climb out instead of hovering');
  for(const t of closeTime.values())assert.ok(t<1.5,'no eagle parks on the aircraft');
  assert.ok(crowded/pairs<.02,'the flock keeps its spacing instead of collapsing onto one point');
  const traitSpeeds=new Set(EAGLE_TRAITS.map(t=>t.speed)),sides=new Set(EAGLE_TRAITS.map(t=>t.side)),heights=new Set(EAGLE_TRAITS.map(t=>t.height));
  assert.ok(traitSpeeds.size>=4&&sides.size===2&&heights.size>=4,'attack characters differ in pace, flank and altitude');
});

test('eagles pause with an inactive pilot, respect ceasefire and return to their perches',()=>{
  let damage=0;
  const s=nestSim([],{onPlayerHit:d=>damage+=d});
  const active={position:v(-741,200,-80),velocity:v(0,0,0),active:true},idle={...active,active:false};
  s.damage(eaglesOf(s)[1],10);run(s,10,active);
  assert.ok(damage>0);const before=damage;
  run(s,10,idle);assert.equal(damage,before,'no strikes while the pilot is inactive');
  assert.ok(eaglesOf(s).every(e=>['return','perch','patrol'].includes(e.flight.stage)),'inactive pilots send the flock home');
  s.ceasefire();run(s,75,active);
  assert.ok(eaglesOf(s).every(e=>!e.hostile));
  assert.ok(eaglesOf(s).some(e=>e.flight.stage==='perch'&&e.position.distanceTo(e.home)<1e-6),'eagles settle back on the crown');
  assert.equal(damage,before);
});

test('defeated eagles respawn peacefully at the nest and the wing rig folds on the perch',()=>{
  const s=nestSim(),target={position:v(-741,200,-80),velocity:v(0,0,0),active:true};
  const e=eaglesOf(s)[2];s.damage(e,1000);
  assert.equal(e.health,0);run(s,25,target);
  assert.equal(e.health,PREDATORS.eagle.health);assert.equal(e.hostile,false);assert.equal(e.flight.stage,'perch');
  assert.ok(e.position.equals(e.home));
  const model=createPredator('eagle'),low=model.levels[1].object;
  let calls=0;low.traverse(o=>{if(o.isMesh)calls++});assert.equal(calls,2,'distant eagle stays two draw calls');
  const wings=[];model.levels[0].object.traverse(o=>{if(o.isGroup&&o.parent===model.levels[0].object&&Math.abs(o.position.x)>1&&o.position.y>.3)wings.push(o)});
  assert.equal(wings.length,2);
  const perched={...e,wingFold:1,wingAmplitude:.03,wingPhase:0,speed:0,flash:0};
  model.userData.animate(0,perched);const folded=wings.map(w=>Math.abs(w.rotation.y));
  const flying={...e,wingFold:0,wingAmplitude:.3,wingPhase:1,speed:110,flash:0};
  model.userData.animate(1,flying);const spread=wings.map(w=>Math.abs(w.rotation.y));
  assert.ok(folded.every((f,i)=>f>spread[i]+.6),'perched wings sweep back along the body');
});

test('the flock stretches like chewing gum: a 200 km/h floor, a lagged match of the pilot, then it closes again',()=>{
  let damage=0;
  const s=nestSim([],{onPlayerHit:d=>damage+=d});
  const target={position:v(-600,200,700),velocity:v(0,0,0),active:true};
  s.damage(eaglesOf(s)[0],10);run(s,6,target);
  assert.ok(Math.abs(s.huntSpeed()-200/3.6)<1e-9,'a hovering pilot is hunted at the 200 km/h baseline');
  // Full afterburner straight away from the nest: the flock only catches up after a lag.
  target.velocity.set(0,0,-VTOL.maxSpeed);
  const speeds=[];
  for(let i=0;i<60*10;i++){target.position.addScaledVector(target.velocity,1/60);s.update(1/60,target);if(i%60===59)speeds.push(s.huntSpeed())}
  assert.ok(speeds[0]<VTOL.maxSpeed*.6,'one second into the burst the flock is still slow');
  assert.ok(speeds[9]>PREDATORS.eagle.speed*.97&&speeds[9]<=PREDATORS.eagle.speed,'after ten seconds it runs at the cap, still below the VTOL');
  assert.ok(speeds.every((v,i)=>i===0||v>=speeds[i-1]-1e-9),'the flock speeds up smoothly');
  const gap=Math.min(...eaglesOf(s).map(e=>e.position.distanceTo(target.position)));
  assert.ok(gap>100,`the burst opened a ${gap.toFixed(0)} m gap`);
  // Slow down to line up a shot: the birds keep their pace for a moment, then decelerate and arrive.
  target.velocity.set(0,0,0);const before=damage;
  run(s,1,target);assert.ok(s.huntSpeed()>PREDATORS.eagle.speed*.6,'the flock does not brake instantly');
  run(s,9,target);
  assert.ok(damage>before,'stopping lets the eagles catch up and strike');
  assert.ok(Math.abs(s.huntSpeed()-200/3.6)<3,'hovering again returns them toward the baseline');
});

test('the poop cannon downs an eagle in ten rounds, other weapons and animals are unchanged',()=>{
  const s=nestSim([{type:'hawk',position:[-600,200,30]}]);
  const eagle=eaglesOf(s)[0],hawk=s.enemies.find(e=>e.type==='hawk');
  const hit=e=>({point:e.position.clone().add(v(0,0,3)),normal:v(0,0,1),enemy:e});
  assert.equal(s.impact(hit(eagle),CANNON),16);assert.equal(eagle.health,PREDATORS.eagle.health-16);
  assert.equal(s.impact(hit(hawk),CANNON),10);
  assert.equal(s.weaponDamage(eagle,ROCKET),ROCKET.damage);assert.equal(s.weaponDamage(eagle,BOMB),BOMB.damage);
  assert.equal(Math.ceil(PREDATORS.eagle.health/16),10,'ten cannon rounds bring down an eagle');
});

test('a flare burst dazzles hunting eagles for two seconds, then they resume full pace',()=>{
  const s=nestSim(),target={position:v(-600,200,600),velocity:v(0,0,0),active:true};
  s.damage(eaglesOf(s)[0],10);run(s,8,target);
  const pace=()=>Math.max(...eaglesOf(s).filter(e=>e.flight.stage==='approach').map(e=>e.speed));
  // Far target: everyone is in a straight approach at cruise pace.
  target.position.set(-600,200,-700);run(s,4,target);
  const full=pace();assert.ok(full>50,'hunting at the 200 km/h floor');
  s.flare();assert.equal(s.dazzled,PREDATORS.eagle.flareDaze);assert.equal(s.snapshot().flareBursts,1);
  run(s,1,target);const dazed=pace();
  assert.ok(dazed<full*.6,`dazzled eagles slow from ${full.toFixed(0)} to ${dazed.toFixed(0)} m/s`);
  run(s,1.05,target);assert.equal(s.dazzled,0,'the daze lasts two seconds');
  run(s,3,target);assert.ok(pace()>full*.92,'full pace returns');
  s.flare();s.flare();assert.equal(s.dazzled,PREDATORS.eagle.flareDaze,'repeat bursts do not stack beyond the daze');
  s.ceasefire();assert.equal(s.dazzled,0);
});
