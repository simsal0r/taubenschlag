import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { THRUSTERS,fireThrusters,advanceThrusters } from '../src/vtol-thrusters.js';
import { VTOL,createVTOLState,resetVTOL,advanceVTOL,damageVTOL } from '../src/vtol-flight.js';
import { createCyborgPigeon } from '../src/cyborg-pigeon.js';

const fresh=()=>{const s=createVTOLState();resetVTOL(s,[0,200,0],0);return s};
const fly=(s,seconds,hz=120,input={},colliders=null)=>{
  for(let i=0;i<Math.round(seconds*hz);i++)advanceVTOL(s,1/hz,input,colliders);
};

test('a thruster pulse adds local-up momentum for level, banked, pitched and inverted airframes',()=>{
  for(const rotation of [[0,0,0],[0,0,Math.PI/2],[Math.PI/3,.7,0],[0,0,Math.PI]]){
    const s=fresh();s.orientation.setFromEuler(new THREE.Euler(...rotation,'YXZ'));
    s.velocity.set(12,-4,-30);
    const velocity=s.velocity.clone(),position=s.position.clone(),orientation=s.orientation.clone();
    const expected=new THREE.Vector3(0,THRUSTERS.impulse,0).applyQuaternion(s.orientation);
    assert.equal(fireThrusters(s),true);
    assert.ok(s.velocity.clone().sub(velocity).distanceTo(expected)<1e-10);
    assert.ok(s.position.equals(position),'a pulse accelerates instead of teleporting');
    assert.ok(s.orientation.equals(orientation),'balanced thrusters do not turn the aircraft');
    assert.equal(s.collective,1);assert.equal(s.thrusters.charges,4);
  }
});

test('one pulse gives about fifty metres of extra lift from a level hover at default inertia',()=>{
  const positions=[];
  for(const hz of [30,60,120]){
    const s=fresh();fireThrusters(s);fly(s,20,hz);
    assert.ok(s.position.y>248&&s.position.y<252);
    assert.ok(s.velocity.length()<.01);
    assert.equal(s.position.x,0);assert.equal(s.position.z,0);
    positions.push(s.position.y);
  }
  assert.ok(Math.max(...positions)-Math.min(...positions)<1e-8,'lift is independent of rendering frame rate');
});

test('five charges enforce the 0.1-second gap and regenerate one at a time every two active seconds',()=>{
  const s=fresh();
  for(let i=0;i<5;i++){
    assert.equal(fireThrusters(s),true);assert.equal(s.thrusters.charges,4-i);
    assert.equal(fireThrusters(s),false,'a rapid duplicate press consumes no charge');
    if(i<4){
      fly(s,.09,100);assert.equal(fireThrusters(s),false);
      advanceVTOL(s,.01);
    }
  }
  assert.ok(Math.abs(s.thrusters.recharge-1.6)<1e-8,'recharge starts with the first pulse');
  const frozen=structuredClone(s.thrusters);advanceVTOL(s,0);
  assert.deepEqual(s.thrusters,frozen,'paused time does not recharge or consume a pulse');
  fly(s,1.59,100);assert.equal(fireThrusters(s),false);assert.equal(s.thrusters.charges,0);
  advanceVTOL(s,.01);assert.equal(s.thrusters.charges,1);assert.ok(Math.abs(s.thrusters.recharge-2)<1e-8);
  assert.equal(fireThrusters(s),true);assert.equal(s.thrusters.pulses,6);assert.equal(s.thrusters.spark,0);
  for(let charge=1;charge<=5;charge++){
    fly(s,2);assert.equal(s.thrusters.charges,charge);
    assert.ok(Math.abs(s.thrusters.recharge-(charge===5?0:2))<1e-8);
  }
});

test('unused charges remain available and rejected presses never restart cooldowns',()=>{
  const s=fresh();fireThrusters(s);fly(s,.05);
  const before=structuredClone(s.thrusters),velocity=s.velocity.clone();
  assert.equal(fireThrusters(s),false);assert.deepEqual(s.thrusters,before);assert.ok(s.velocity.equals(velocity));
  fly(s,6);assert.equal(s.thrusters.charges,5);assert.equal(s.thrusters.recharge,0);
  assert.equal(fireThrusters(s),true);
});

test('using a single charge automatically refills it after two seconds at different frame rates',()=>{
  for(const hz of [30,60,120]){
    const s=fresh();fireThrusters(s);
    fly(s,2-1/hz,hz);assert.equal(s.thrusters.charges,4);
    advanceVTOL(s,1/hz);assert.equal(s.thrusters.charges,5);assert.equal(s.thrusters.recharge,0);
    fly(s,10,hz);assert.equal(s.thrusters.charges,5,'charges are capped and no regeneration time is banked');
    fireThrusters(s);assert.equal(s.thrusters.recharge,2,'the next spent charge starts a fresh timer');
  }
});

test('partial charges fire during regeneration without postponing the next charge',()=>{
  const s=fresh();fireThrusters(s);fly(s,1.5);
  const remaining=s.thrusters.recharge;
  assert.equal(fireThrusters(s),true);assert.equal(s.thrusters.charges,3);
  assert.equal(s.thrusters.recharge,remaining);assert.equal(s.thrusters.misfires,0);
  fly(s,.5);assert.equal(s.thrusters.charges,4);
  fly(s,2);assert.equal(s.thrusters.charges,5);assert.equal(s.thrusters.recharge,0);
});

test('regeneration preserves leftover time across multiple refill boundaries',()=>{
  const s=fresh();
  for(let i=0;i<5;i++){fireThrusters(s);if(i<4)advanceThrusters(s.thrusters,.1)}
  advanceThrusters(s.thrusters,5.75);
  assert.equal(s.thrusters.charges,3);assert.ok(Math.abs(s.thrusters.recharge-1.85)<1e-8);
  advanceThrusters(s.thrusters,100);
  assert.equal(s.thrusters.charges,5);assert.equal(s.thrusters.recharge,0);
});

test('thrusters coexist with afterburners and still obey collision and speed limits',()=>{
  const s=fresh();s.velocity.set(0,0,-VTOL.maxSpeed);
  fireThrusters(s);fly(s,.5,120,{afterburner:true});
  assert.ok(s.velocity.y>0&&s.velocity.z<0);assert.ok(s.velocity.length()<=VTOL.maxSpeed+1e-8);
  assert.ok(s.afterburner>.9);
  resetVTOL(s,[0,VTOL.ceiling-1,0],0);fireThrusters(s);fly(s,2,120,{},[]);
  assert.ok(s.position.y<=VTOL.ceiling);assert.equal(s.crashed,false);
  const roof={min:{x:-20,y:205,z:-20},max:{x:20,y:206,z:20}};
  resetVTOL(s,[0,202.4,0],0);fireThrusters(s);fly(s,2,120,{},[roof]);
  assert.ok(s.position.y<205-2);assert.ok(s.velocity.y<=0);assert.equal(s.crashed,false);
});

test('crashes extinguish the jets and rebuilding restores five charges without residual thrust',()=>{
  const s=fresh();fireThrusters(s);damageVTOL(s,1000);
  assert.equal(s.thrusters.flash,0);assert.equal(fireThrusters(s),false);
  fly(s,2);assert.equal(s.crashed,false);
  assert.equal(s.thrusters.charges,5);assert.equal(s.thrusters.cooldown,0);
  assert.equal(s.thrusters.recharge,0);assert.equal(s.thrusters.flash,0);
  assert.equal(s.velocity.length(),0);
});

test('two fixed belly nozzles exhaust opposite the boost and switch off between pulses',()=>{
  const s=fresh(),model=createCyborgPigeon();
  model.userData.animate(0,s,1/60);
  assert.ok(model.userData.getAppearance().thrusters.every(jet=>!jet.active));
  fireThrusters(s);model.userData.animate(.01,s,1/60);
  assert.ok(model.userData.getAppearance().thrusters.every(jet=>jet.active&&jet.length>2));
  model.quaternion.setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2);
  model.updateMatrixWorld(true);
  const expected=new THREE.Vector3(0,-1,0).applyQuaternion(model.quaternion);
  for(const name of ['port-lift-thruster','starboard-lift-thruster']){
    const nozzle=model.getObjectByName(name);assert.ok(nozzle);
    const flame=nozzle.children.at(-1),rotation=flame.getWorldQuaternion(new THREE.Quaternion());
    assert.ok(new THREE.Vector3(0,1,0).applyQuaternion(rotation).distanceTo(expected)<1e-8);
  }
  const frozen=model.userData.getAppearance();model.userData.animate(.1,s,0);
  assert.deepEqual(model.userData.getAppearance(),frozen);
  fly(s,.2);model.userData.animate(.2,s,1/60);
  assert.ok(model.userData.getAppearance().thrusters.every(jet=>!jet.active));
});

test('empty-charge attempts spark without adding momentum, spending pulses or restarting recharge',()=>{
  const s=fresh();
  for(let i=0;i<5;i++){fireThrusters(s);if(i<4)fly(s,.1)}
  const velocity=s.velocity.clone(),position=s.position.clone(),orientation=s.orientation.clone();
  const recharge=s.thrusters.recharge,cooldown=s.thrusters.cooldown;
  for(let i=1;i<=4;i++){
    assert.equal(fireThrusters(s),false);
    assert.equal(s.thrusters.misfires,i);assert.equal(s.thrusters.spark,THRUSTERS.spark);
    assert.equal(s.thrusters.flash,0);assert.equal(s.thrusters.pulses,5);assert.equal(s.thrusters.charges,0);
    assert.equal(s.thrusters.recharge,recharge);assert.equal(s.thrusters.cooldown,cooldown);
    assert.ok(s.velocity.equals(velocity)&&s.position.equals(position)&&s.orientation.equals(orientation));
  }
  const frozen=structuredClone(s.thrusters);advanceVTOL(s,0);assert.deepEqual(s.thrusters,frozen);
  fly(s,.2);assert.equal(s.thrusters.spark,0);assert.ok(s.thrusters.recharge<recharge);
  fireThrusters(s);damageVTOL(s,1000);
  assert.equal(s.thrusters.spark,0);assert.equal(fireThrusters(s),false);assert.equal(s.thrusters.misfires,5);
  resetVTOL(s);assert.equal(s.thrusters.misfires,0);assert.equal(s.thrusters.spark,0);assert.equal(s.thrusters.charges,5);
});

test('misfire arcs stay attached to the nozzles, expire quickly and reuse their geometry',()=>{
  const s=fresh(),model=createCyborgPigeon();
  const geometryIds=()=>{const ids=[];model.traverse(o=>{if(o.isMesh)ids.push(o.geometry.uuid)});return ids};
  const initialGeometry=geometryIds();
  model.userData.animate(0,s,1/60);
  assert.ok(model.userData.getAppearance().thrusters.every(jet=>!jet.sparking));
  for(let i=0;i<5;i++){fireThrusters(s);if(i<4)fly(s,.1)}
  fireThrusters(s);model.userData.animate(.5,s,1/60);
  assert.ok(model.userData.getAppearance().thrusters.every(jet=>jet.sparking&&!jet.active));
  for(const name of ['port-lift-thruster','starboard-lift-thruster']){
    const nozzle=model.getObjectByName(name),sparks=nozzle.getObjectByName('lift-thruster-sparks');
    assert.equal(sparks.parent,nozzle);assert.equal(sparks.visible,true);
  }
  for(let i=0;i<15;i++){fireThrusters(s);fly(s,.05);model.userData.animate(.5+i*.05,s,1/60)}
  assert.deepEqual(geometryIds(),initialGeometry,'repeated failures allocate no new geometry');
  fly(s,.2);model.userData.animate(2,s,1/60);
  assert.ok(model.userData.getAppearance().thrusters.every(jet=>!jet.sparking&&!jet.active));
});
