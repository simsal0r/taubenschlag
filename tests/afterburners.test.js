import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VTOL,createVTOLState,resetVTOL,advanceVTOL } from '../src/vtol-flight.js';
import { createCyborgPigeon } from '../src/cyborg-pigeon.js';

const fresh=()=>{const s=createVTOLState();resetVTOL(s,[0,200,0],0);return s};
const fly=(s,seconds,input={},hz=120,colliders=null)=>{
  for(let i=0;i<Math.round(seconds*hz);i++)advanceVTOL(s,1/hz,input,colliders);
};
test('afterburners accelerate level flight forward; releasing cuts thrust and preserves coasting momentum',()=>{
  const s=fresh();fly(s,1.5,{afterburner:true});
  assert.ok(-s.velocity.z>60);assert.equal(s.position.y,200);assert.equal(s.collective,1);
  const speed=s.velocity.length(),z=s.position.z;
  fly(s,.5);
  assert.equal(s.afterburner,0);assert.ok(s.velocity.length()<speed&&s.velocity.length()>speed*.8);
  assert.ok(s.position.z<z-20);
});
test('jets follow nose direction without rotating existing momentum or changing collective control',()=>{
  const yawed=fresh();yawed.orientation.setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2);
  fly(yawed,.5,{afterburner:true});assert.ok(yawed.velocity.x<-20);assert.ok(Math.abs(yawed.velocity.z)<1e-8);
  for(const pitch of [-Math.PI/6,Math.PI/6]){
    const boosted=fresh(),coast=fresh();
    for(const s of [boosted,coast])s.orientation.setFromAxisAngle(new THREE.Vector3(1,0,0),pitch);
    fly(boosted,1,{afterburner:true,throttle:1});fly(coast,1,{throttle:1});
    assert.equal(boosted.collective,coast.collective);
    assert.ok(Math.sign(pitch)*(boosted.velocity.y-coast.velocity.y)>15);
    assert.ok(boosted.velocity.z<coast.velocity.z-30);
    assert.ok(boosted.orientation.angleTo(coast.orientation)<1e-8);
  }
  const sideways=fresh();sideways.velocity.x=40;fly(sideways,.1,{afterburner:true});
  assert.ok(sideways.velocity.x>39&&sideways.velocity.z<0);
});
test('boost is frame independent, remains speed limited and permits normal yaw control',()=>{
  const slow=fresh(),fast=fresh();
  fly(slow,2,{afterburner:true,yaw:.3},30);fly(fast,2,{afterburner:true,yaw:.3},120);
  assert.ok(slow.position.distanceTo(fast.position)<1e-7);
  assert.ok(slow.orientation.angleTo(fast.orientation)<1e-7);
  assert.ok(slow.orientation.angleTo(new THREE.Quaternion())>.4);
  const top=fresh();fly(top,15,{afterburner:true});
  assert.ok(Math.abs(top.velocity.length()-VTOL.maxSpeed)<1e-8);
});
test('boosted crashes stop the jets and respawn cannot inherit a latched burner',()=>{
  const s=fresh(),wall={min:{x:-50,y:0,z:-71},max:{x:50,y:400,z:-70}};
  for(let i=0;i<400&&!s.crashed;i++)advanceVTOL(s,1/120,{afterburner:true},[wall]);
  assert.equal(s.crashed,true);assert.equal(s.afterburner,0);assert.ok(s.impactSpeed>=VTOL.crashSpeed);
  fly(s,1,{afterburner:true});assert.equal(s.afterburner,0);
  fly(s,1);assert.equal(s.crashed,false);assert.equal(s.afterburner,0);
  fly(s,.1);assert.equal(s.velocity.length(),0);
});
test('two modeled jets produce long layered exhaust on boost and settle on release without changing flight state',()=>{
  const s=fresh(),model=createCyborgPigeon();
  assert.ok(model.getObjectByName('port-afterburner'));assert.ok(model.getObjectByName('starboard-afterburner'));
  const animate=()=>{for(let i=0;i<60;i++)model.userData.animate(i/60,s,1/60)};
  animate();const idle=model.userData.getAppearance();
  s.afterburner=1;animate();const burning=model.userData.getAppearance();
  assert.equal(burning.afterburners.length,2);assert.ok(burning.afterburners.every(e=>e.length>4.5&&e.coreVisible));
  assert.equal(s.velocity.length(),0);assert.equal(s.afterburner,1);
  const frozen=structuredClone(burning);model.userData.animate(59/60,s,0);assert.deepEqual(model.userData.getAppearance(),frozen);
  s.afterburner=0;animate();const off=model.userData.getAppearance();
  assert.ok(off.afterburners.every((e,i)=>Math.abs(e.length-idle.afterburners[i].length)<.001&&!e.coreVisible));
});
