import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VTOL,createVTOLState,resetVTOL,advanceVTOL,vtolAttitude } from '../src/vtol-flight.js';
import { traceProjectile } from '../src/poop-cannon.js';
const fly=(s,seconds,input={},colliders=null,hz=120,settings)=>{for(let i=0;i<Math.round(seconds*hz);i++)advanceVTOL(s,1/hz,input,colliders,settings)};
const fresh=()=>{const s=createVTOLState();resetVTOL(s,[0,80,0],0);return s};
test('neutral collective hovers when level; W and S independently change lift',()=>{
 const s=fresh();fly(s,2);assert.equal(s.position.y,80);assert.equal(s.velocity.length(),0);
 fly(s,1,{throttle:1});assert.ok(s.velocity.y>3);
 const down=fresh();fly(down,1,{throttle:-1});assert.ok(down.velocity.y<-3);
});
test('nose-down flight sheds height quickly and throttle deepens the dive',()=>{
 const s=fresh();s.orientation.setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/6);
 fly(s,2);assert.ok(s.velocity.z<-8);assert.ok(s.position.y<73);assert.ok(s.velocity.y<-6);
 const powered=fresh();powered.orientation.copy(s.orientation);fly(powered,2,{throttle:1});
 assert.ok(powered.position.y<s.position.y-6,'power adds descent rather than rescuing a nose-down attitude');
 assert.ok(powered.velocity.z<s.velocity.z-12,'powered dive accelerates forward as well as downward');
});
test('W and S produce three times the previous height change in stable flight',()=>{
 // Recorded two-second height changes before the 3× adjustment.
 const previous={climb:17.90572170117204,descent:10.504690064687452};
 for(const forwardSpeed of [0,20]){
  const cruise=fresh(),descend=fresh(),coast=fresh();
  for(const s of [cruise,descend,coast])s.velocity.z=-forwardSpeed;
  // Compare at the same inertia used for the recorded pre-adjustment baseline.
  fly(cruise,2,{throttle:1},null,120,{inertia:1});fly(descend,2,{throttle:-1},null,120,{inertia:1});fly(coast,2,{},null,120,{inertia:1});
  assert.ok(Math.abs((cruise.position.y-80)/previous.climb-3)<.001);
  assert.ok(Math.abs((80-descend.position.y)/previous.descent-3)<.001);
  assert.equal(coast.position.y,80);
  assert.ok(Math.abs(cruise.velocity.z-coast.velocity.z)<1e-9,'level throttle adds climb, not horizontal drive');
  assert.ok(Math.abs(descend.velocity.z-coast.velocity.z)<1e-9,'S changes vertical response without changing forward drift');
 }
});
test('extra climb power preserves powered nose-down dives and a hard roof landing crashes',()=>{
 const dive=fresh();dive.orientation.setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/12);
 fly(dive,2,{throttle:1});assert.ok(dive.position.y<78&&dive.velocity.y<0);
 const landing=fresh(),roof={min:{x:-20,y:29.8,z:-20},max:{x:20,y:30,z:20}};
 fly(landing,3,{throttle:-1},[roof]);
 assert.ok(landing.position.y>=32&&landing.position.y<32.2);assert.equal(landing.velocity.y,0);
 assert.equal(landing.crashed,true);assert.ok(landing.impactSpeed>=VTOL.crashSpeed);
});
test('raising the nose brakes a powered dive and restores an upward response',()=>{
 const s=fresh();s.orientation.setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/6);
 fly(s,1,{throttle:1});const descent=s.velocity.y,speed=-s.velocity.z;
 s.orientation.setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/9);
 fly(s,2,{throttle:1});
 assert.ok(s.velocity.y>2&&s.velocity.y>descent);
 assert.ok(-s.velocity.z<speed,'nose-up rotor thrust brakes existing forward momentum');
});
test('powered dives stay stronger than coasting across inertia settings',()=>{
 for(const inertia of [.3,1,3]){
  const powered=fresh(),coast=fresh();
  for(const s of [powered,coast]){s.orientation.setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/6);s.velocity.z=-20}
  fly(powered,1.5,{throttle:1},null,120,{inertia});fly(coast,1.5,{},null,120,{inertia});
  assert.ok(powered.position.y<coast.position.y-2);assert.ok(powered.velocity.z<coast.velocity.z);
 }
});
test('yaw turns the airframe without instantly rotating its existing momentum',()=>{
 const s=fresh();s.velocity.set(0,0,-30);fly(s,1,{yaw:1});
 assert.ok(vtolAttitude(s).yaw>.8);assert.ok(Math.abs(s.velocity.x)<1e-10);assert.ok(s.velocity.z<-20);
});
test('released cyclic holds bank; inverted lift points down instead of auto-hovering',()=>{
 const s=fresh();s.orientation.setFromAxisAngle(new THREE.Vector3(0,0,1),.5);
 const q=s.orientation.clone();fly(s,1);assert.ok(s.orientation.angleTo(q)<1e-7);assert.ok(s.velocity.x<0);
 const inverted=fresh();inverted.orientation.setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI);fly(inverted,1);assert.ok(inverted.velocity.y<-12);
});
test('roll can pass through inverted attitude and complete a full rotation',()=>{
 const s=fresh();fly(s,1.8,{roll:1});const up=new THREE.Vector3(0,1,0).applyQuaternion(s.orientation);assert.ok(up.y<-.9);
 fly(s,1.6,{roll:1});up.set(0,1,0).applyQuaternion(s.orientation);assert.ok(up.y>.95);
});
test('equal mouse motion over time produces consistent handling at 30 and 120 fps',()=>{
 for(const settings of [undefined,{agility:.4,inertia:3},{agility:2.5,inertia:.3}]){
  const slow=fresh(),fast=fresh();
  for(let i=0;i<30;i++)advanceVTOL(slow,1/30,{pitchDelta:-.3/30,rollDelta:.2/30,throttle:1},null,settings);
  for(let i=0;i<120;i++)advanceVTOL(fast,1/120,{pitchDelta:-.3/120,rollDelta:.2/120,throttle:1},null,settings);
  assert.ok(slow.orientation.angleTo(fast.orientation)<1e-7);assert.ok(slow.position.distanceTo(fast.position)<1e-7);
 }
});
test('held pitch continuously turns on the mouse axis at the normal rate in either direction',()=>{
 for(const sign of [-1,1]){
   const quick=fresh(),normal=fresh();quick.position.y=300;
  fly(quick,.4,{quickPitch:sign});fly(normal,.4,{pitch:sign});
   assert.ok(sign*vtolAttitude(quick).pitch>.4&&sign*vtolAttitude(quick).pitch<.5);
   assert.ok(Math.abs(vtolAttitude(quick).pitch/vtolAttitude(normal).pitch-1)<1e-8);
   fly(quick,1.8,{quickPitch:sign});
  assert.ok(new THREE.Vector3(0,1,0).applyQuaternion(quick.orientation).y<-.9,'can pitch through inverted flight');
  fly(quick,2,{});const held=quick.orientation.clone();
  fly(quick,.3,{});assert.ok(held.angleTo(quick.orientation)<1e-7,'release stops rotation without auto-level');
 }
});
test('held quick pitch respects agility and is consistent across frame rates',()=>{
 for(const agility of [.4,1,2.5]){
  const poses=[];
  for(const hz of [30,120]){
   const s=fresh();fly(s,.6,{quickPitch:-1},null,hz,{agility});poses.push(s);
   assert.ok(Math.abs(s.angularVelocity.x)<=VTOL.pitchRate*VTOL.quickPitchMultiplier*agility);
  }
  assert.ok(poses[0].orientation.angleTo(poses[1].orientation)<1e-7);
  assert.ok(poses[0].position.distanceTo(poses[1].position)<1e-7);
 }
});
test('agility changes all steering axes and mouse response without introducing auto-level',()=>{
 for(const input of [{pitch:1},{roll:1},{yaw:1},{pitchDelta:.001},{rollDelta:.001}]){
  const slow=fresh(),fast=fresh(),origin=slow.orientation.clone();
  fly(slow,.3,input,null,120,{agility:.5});fly(fast,.3,input,null,120,{agility:2});
  assert.ok(fast.orientation.angleTo(origin)>slow.orientation.angleTo(origin)*2);
  fly(fast,2,{},null,120,{agility:2});const held=fast.orientation.clone();
  fly(fast,1,{},null,120,{agility:2});assert.ok(fast.orientation.angleTo(held)<1e-7);
 }
});
test('higher motion inertia carries momentum farther on every axis without creating speed',()=>{
 const low=fresh(),high=fresh();low.velocity.set(20,8,-25);high.velocity.copy(low.velocity);
 const initialSpeed=low.velocity.length();
 fly(low,2,{},null,120,{inertia:.4});fly(high,2,{},null,120,{inertia:2.5});
 for(let axis of ['x','y','z'])assert.ok(Math.abs(high.velocity[axis])>Math.abs(low.velocity[axis])*1.5);
 assert.ok(high.velocity.length()<initialSpeed);assert.ok(high.position.distanceTo(new THREE.Vector3(0,80,0))>low.position.distanceTo(new THREE.Vector3(0,80,0)));
 assert.ok(high.orientation.angleTo(low.orientation)<1e-7);
});
test('extreme handling settings preserve hover, gravity and independent yaw momentum',()=>{
 for(const settings of [{agility:.4,inertia:.3},{agility:2.5,inertia:3}]){
  const s=fresh();fly(s,2,{},null,120,settings);assert.equal(s.velocity.length(),0);assert.equal(s.position.y,80);
  s.velocity.z=-20;fly(s,.4,{yaw:1},null,120,settings);assert.equal(s.velocity.x,0);assert.ok(s.velocity.z<0);
  s.orientation.setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI);fly(s,.5,{},null,120,settings);assert.ok(s.velocity.y<-3);
 }
});
test('rotor duct clearance prevents flying a helicopter through an eight-metre gap',()=>{
 const walls=[{min:{x:-20,y:0,z:-.1},max:{x:-4,y:30,z:.1}},{min:{x:4,y:0,z:-.1},max:{x:20,y:30,z:.1}}];
 const s=fresh();resetVTOL(s,[0,10,15],0);s.velocity.z=-30;fly(s,1,{},walls);
 assert.ok(s.position.z>1.5);assert.ok(Math.abs(s.velocity.z)<.01);
 assert.equal(s.crashed,true,'a hard rotor contact also destroys the airframe');
});
test('crash severity uses speed into the surface, allowing fast glancing scrapes',()=>{
 const wall={min:{x:-200,y:0,z:-1},max:{x:200,y:200,z:0}};
 const direct=fresh();resetVTOL(direct,[0,80,20],0);direct.velocity.z=-60;
 fly(direct,.4,{},[wall]);assert.equal(direct.crashed,true);assert.ok(direct.impactSpeed>50);
 const scrape=fresh();resetVTOL(scrape,[0,80,4.3],0);scrape.velocity.set(70,0,-3);
 fly(scrape,.4,{},[wall]);assert.equal(scrape.crashed,false);assert.ok(scrape.position.x>20);assert.ok(Math.abs(scrape.velocity.z)<.01);
 const gentle=fresh();resetVTOL(gentle,[0,80,5],0);gentle.velocity.z=-8;
 fly(gentle,.3,{},[wall]);assert.equal(gentle.crashed,false);assert.ok(gentle.position.z>4);
});
test('hard terrain landings crash, soft landings survive, and invisible bounds are harmless',()=>{
 for(const [speed,crashed]of [[-50,true],[-4,false]]){
  const s=fresh();resetVTOL(s,[0,2.4,0],0);s.velocity.y=speed;fly(s,.15,{},[]);
  assert.equal(s.crashed,crashed);assert.ok(s.position.y>=2.2-1e-8);assert.equal(s.velocity.y,0);
 }
 const limit=fresh();resetVTOL(limit,[949,839,0],0);limit.velocity.set(60,60,0);
 fly(limit,.1,{},[]);assert.equal(limit.crashed,false);assert.ok(limit.position.x<=950&&limit.position.x>940);assert.ok(limit.position.y<=840&&limit.position.y>830);
});
test('a crashed VTOL ignores controls and rebuilds after exactly two simulation seconds',()=>{
 const s=fresh();resetVTOL(s,[0,3,0],0);s.velocity.y=-50;fly(s,.025,{},[]);
 assert.equal(s.crashed,true);
 // Start at the impact, independent of the remainder of the triggering frame.
 s.respawnIn=VTOL.respawnDelay;const wreck=s.position.clone(),orientation=s.orientation.clone();
 advanceVTOL(s,0,{throttle:1});assert.equal(s.respawnIn,2,'a frozen simulation does not consume respawn time');
 fly(s,1.99,{throttle:1,pitch:1,rollDelta:10},[],100);
 assert.equal(s.crashed,true);assert.ok(s.position.equals(wreck));assert.ok(s.orientation.equals(orientation));assert.equal(s.velocity.length(),0);
 advanceVTOL(s,.01,{throttle:1,pitch:1},[]);
 assert.equal(s.crashed,false);assert.equal(s.respawned,true);assert.equal(s.respawnIn,0);
 assert.deepEqual(s.position.toArray(),VTOL.spawn);assert.equal(s.velocity.length(),0);assert.equal(s.collective,1);
 advanceVTOL(s,1/60,{},[]);assert.equal(s.respawned,false,'respawn notification lasts one frame');
});
test('poop rounds sweep thin facades and return a surface normal for the splat',()=>{
 const wall={min:{x:-4,y:0,z:-.05},max:{x:4,y:30,z:.05}};
 const hit=traceProjectile(new THREE.Vector3(0,12,10),new THREE.Vector3(0,12,-10),[wall]);
 assert.ok(hit);assert.ok(Math.abs(hit.point.z-.05)<1e-8);assert.equal(hit.normal.z,1);
 const ground=traceProjectile(new THREE.Vector3(0,2,0),new THREE.Vector3(0,-2,0),[]);
 assert.ok(Math.abs(ground.point.y-.15)<1e-8);assert.equal(ground.normal.y,1);
});
