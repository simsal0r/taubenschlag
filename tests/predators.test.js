import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { PredatorSimulation, segmentSphere } from '../src/predator-simulation.js';
import { CANNON, ROCKET, BOMB, PoopCannon } from '../src/poop-cannon.js';
import { createVTOLState, damageVTOL, advanceVTOL } from '../src/vtol-flight.js';
import { StableSun } from '../src/stable-sun.js';
const v=(x,y,z)=>new THREE.Vector3(x,y,z);
const wall={min:{x:-20,y:0,z:-1},max:{x:20,y:150,z:1},tag:'wall'};
const target={position:v(0,50,20),velocity:v(0,0,0),active:true};
function sim(type='hawk',position=[0,50,0],options={}){
  return new PredatorSimulation({spawns:[{type,position,...(type==='cat'?{wall:{a:[-25,0],b:[25,0],normal:[0,1],height:148}}:{})}],...options});
}
test('roaming predators never initiate combat without being hit',()=>{
  let hits=0;const s=sim('hawk',[0,50,20],{onPlayerHit:()=>hits++}),before=s.enemies[0].position.clone();
  for(let i=0;i<1200;i++)s.update(1/60,target);
  assert.equal(hits,0);assert.equal(s.attacks,0);assert.equal(s.rocks.length,0);
  assert.equal(s.enemies[0].hostile,false);assert.ok(before.distanceTo(s.enemies[0].position)>1);
});
test('actual damage provokes only the hit animal, even while others are nearby',()=>{
  const s=new PredatorSimulation({spawns:[{type:'hawk',position:[0,50,0]},{type:'hawk',position:[8,50,0]}]});
  assert.equal(s.impact({point:v(0,50,3),normal:v(0,0,1),enemy:s.enemies[0]},CANNON),10);
  assert.equal(s.enemies[0].health,80);assert.equal(s.enemies[0].hostile,true);assert.equal(s.enemies[1].hostile,false);
});
test('swept actor hits choose the nearest target and respect world occlusion',()=>{
  const s=sim('hawk',[0,50,-15]),c=new PoopCannon(new THREE.Scene(),[wall]);
  c.actors=s;
  assert.equal(c.trace(v(0,50,20),v(0,50,-100)).enemy,undefined);
  c.colliders=[];
  assert.equal(c.trace(v(0,50,20),v(0,50,-100)).enemy.id,'hawk-1');
  assert.equal(segmentSphere(v(0,0,0),v(100,0,0),v(70,0,0),2),68);
  assert.equal(segmentSphere(v(0,0,0),v(1,0,0),v(70,0,0),2),null);
});
test('rocket splash has falloff, no double direct damage, and cannot cross buildings',()=>{
  const s=new PredatorSimulation({spawns:[{type:'cat',position:[0,50,4]},{type:'raccoon',position:[4,50,5]},{type:'raccoon',position:[0,50,-4]}],colliders:[wall]});
  s.impact({point:v(0,50,4),normal:v(0,0,1),enemy:s.enemies[0]},ROCKET);
  assert.equal(s.enemies[0].health,120);
  assert.ok(s.enemies[1].health<130);assert.equal(s.enemies[1].hostile,true);
  assert.equal(s.enemies[2].health,130);assert.equal(s.enemies[2].hostile,false);
});
test('heavy bomb splash reaches exposed predators beyond rocket range and respects walls',()=>{
 const s=new PredatorSimulation({spawns:[
  {type:'cat',position:[0,50,4]},{type:'cat',position:[12,50,5]},
  {type:'cat',position:[0,50,-5]},{type:'cat',position:[26,50,5]},
 ],colliders:[wall]});
 assert.ok(s.enemies.every(e=>!e.hostile));
 s.impact({point:v(0,50,4),normal:v(0,0,1),enemy:s.enemies[0]},BOMB);
 assert.equal(s.enemies[0].health,0);assert.equal(s.defeated,1);
 assert.ok(s.enemies[1].health>0&&s.enemies[1].health<200);assert.equal(s.enemies[1].hostile,true);
 for(const e of s.enemies.slice(2)){assert.equal(e.health,200);assert.equal(e.hostile,false)}
});
test('cats climb their façade and visibly wind up before throwing rocks',()=>{
  const s=sim('cat',[0,45,4.5]);const cat=s.enemies[0],start=cat.position.y;
  s.damage(cat,10);let winding=false;
  for(let i=0;i<300;i++){s.update(1/60,target);winding ||= cat.windup>0}
  assert.ok(cat.position.y!==start||s.attacks>0);assert.ok(winding);assert.ok(s.attacks>=1);
  assert.equal(cat.position.z,3.35);assert.ok(cat.position.y>=10&&cat.position.y<=139);
});
test('retaliation pauses when the player is inactive; zero dt freezes all timers',()=>{
  const s=sim('raccoon',[0,4,20]);s.damage(s.enemies[0],10);
  for(let i=0;i<300;i++)s.update(1/60,{...target,active:false});
  assert.equal(s.attacks,0);
  const snapshot=s.snapshot();s.update(0,target);assert.deepEqual(s.snapshot(),snapshot);
});
test('defeated animals return neutral and ceasefire clears thrown rocks',()=>{
  const s=sim(),e=s.enemies[0];s.damage(e,1000);
  assert.equal(e.health,0);assert.equal(s.trace(v(0,50,10),v(0,50,-10)),null);
  s.update(23,target);assert.equal(e.health,0);
  s.update(1,target);assert.equal(e.health,90);assert.equal(e.hostile,false);
  s.damage(e,10);s.rocks.push({});s.ceasefire();assert.equal(s.rocks.length,0);assert.equal(e.hostile,false);
});
test('combat damage uses the existing two-second VTOL rebuild and restores integrity',()=>{
  const state=createVTOLState();state.spawn=[-70,132,145];
  assert.equal(damageVTOL(state,24),false);assert.equal(state.health,76);
  assert.equal(damageVTOL(state,80),true);assert.equal(state.crashed,true);assert.equal(state.respawnIn,2);
  advanceVTOL(state,1.9);assert.equal(state.crashed,true);
  advanceVTOL(state,.1);assert.equal(state.crashed,false);assert.equal(state.health,100);assert.deepEqual(state.position.toArray(),state.spawn);
});
test('thrown rocks hit the player, stop at walls, and safely clear together on a lethal hit',()=>{
  let hits=0;
  const s=new PredatorSimulation({onPlayerHit:()=>{hits++;s.ceasefire()}});
  const rock=z=>({position:v(0,50,z),velocity:v(0,0,100),age:0,damage:24,radius:1});
  s.rocks.push(rock(10),rock(10));s.update(.1,target);
  assert.equal(hits,1);assert.equal(s.rocks.length,0);
  const blocked=new PredatorSimulation({colliders:[wall],onPlayerHit:()=>hits++});
  blocked.rocks.push({...rock(-10),velocity:v(0,0,400)});blocked.update(.1,target);
  assert.equal(hits,1);assert.equal(blocked.rocks.length,0);
});
test('shadow projection remains aligned to whole texels while moving in all world axes',()=>{
  const light=new THREE.DirectionalLight();light.shadow.mapSize.set(2048,2048);
  Object.assign(light.shadow.camera,{left:-140,right:140,top:150,bottom:-150});
  const stable=new StableSun(light);
  for(let i=0;i<200;i++){
    stable.update(v(i*.021,90+i*.015,-i*.017));
    const x=light.target.position.dot(stable.right)/(280/2048),y=light.target.position.dot(stable.up)/(300/2048);
    assert.ok(Math.abs(x-Math.round(x))<1e-7);assert.ok(Math.abs(y-Math.round(y))<1e-7);
    assert.ok(light.position.clone().sub(light.target.position).distanceTo(stable.offset)<1e-7);
  }
});
