import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VTOL,createVTOLState,resetVTOL,advanceVTOL } from '../src/vtol-flight.js';
import { Flares,FLARES } from '../src/vtol-flares.js';

const fresh=()=>{const s=createVTOLState();resetVTOL(s,[0,300,0],0);return s};
test('afterburners continue beyond 342 km/h with shrinking gains until 500, across inertia settings',()=>{
  for(const inertia of [.3,1.5,3]){
    const s=fresh(),speeds=[];
    for(let i=1;i<=1200;i++){
      advanceVTOL(s,1/120,{afterburner:true},null,{inertia});
      if(i%120===0)speeds.push(s.velocity.length()*3.6);
      assert.ok(s.velocity.length()<=500/3.6+1e-8);
    }
    assert.ok(speeds[2]>342&&speeds[5]>490&&speeds[5]<500);
    assert.ok(Math.abs(speeds.at(-1)-500)<1e-8);
    const gains=speeds.slice(1,8).map((v,i)=>v-speeds[i]);
    assert.ok(gains.every((gain,i)=>gain>0&&(i===0||gain<gains[i-1])));
    advanceVTOL(s,1/120,{},null,{inertia});
    assert.ok(s.velocity.length()>130,'release coasts from high speed without snapping back to the old cap');
  }
});
test('mouse roll produces twice the former response for small and saturated inputs; keyboard roll keeps its rate',()=>{
  for(const hz of [30,120])for(const delta of [.004,.25]){
    const mouse=fresh(),oldEquivalent=fresh(),dt=1/hz;
    const oldTarget=Math.min(VTOL.rollRate,delta/dt);
    advanceVTOL(mouse,dt,{rollDelta:delta});
    advanceVTOL(oldEquivalent,dt,{roll:oldTarget/VTOL.rollRate});
    assert.ok(Math.abs(mouse.angularVelocity.z-oldEquivalent.angularVelocity.z*2)<1e-10);
    assert.ok(Math.abs(mouse.orientation.angleTo(new THREE.Quaternion())-oldEquivalent.orientation.angleTo(new THREE.Quaternion())*2)<1e-8);
  }
  assert.equal(VTOL.rollRate,1.9);assert.equal(VTOL.pitchRate,1.5);
});
test('one flare press launches eight separate flares aft and outward without changing aircraft motion',()=>{
  const s=fresh(),f=new Flares(new THREE.Scene());s.velocity.set(20,0,-90);
  const position=s.position.clone(),velocity=s.velocity.clone(),orientation=s.orientation.clone();
  assert.ok(f.deploy(s));assert.equal(f.active.length,8);assert.equal(f.bursts,1);
  assert.equal(f.active.filter(p=>p.position.x<0).length,4);assert.ok(f.active.every(p=>p.position.z>0));
  assert.equal(new Set(f.active.map(p=>p.velocity.x)).size,8);
  assert.ok(s.position.equals(position)&&s.velocity.equals(velocity)&&s.orientation.equals(orientation));
  assert.equal(f.deploy(s),false);assert.equal(f.bursts,1);
});
test('flare cooldown and particles pause together, expire fully and reset cleanly',()=>{
  const f=new Flares(new THREE.Scene()),s=fresh();f.deploy(s);f.update(.5);
  const before=JSON.stringify({state:f.snapshot(),active:f.active,smoke:f.smoke});f.update(0);
  assert.equal(JSON.stringify({state:f.snapshot(),active:f.active,smoke:f.smoke}),before);
  for(let i=0;i<60*7;i++)f.update(1/60);
  assert.equal(f.active.length,0);assert.equal(f.smoke.length,0);assert.equal(f.cooldown,0);
  assert.ok(f.deploy(s));f.clear();
  assert.deepEqual(f.snapshot(),{bursts:0,active:0,smoke:0,cooldown:0});
  s.crashed=true;assert.equal(f.deploy(s),false);
});
test('flare trails remain bounded over repeated bursts and use three shared instance pools',()=>{
  const scene=new THREE.Scene(),f=new Flares(scene),s=fresh();
  for(let i=0;i<60*35;i++){
    if(i%180===0)f.deploy(s);f.update(1/60);
    assert.ok(f.active.length<=FLARES.maxActive&&f.smoke.length<=FLARES.maxSmoke);
  }
  let meshes=0;scene.traverse(o=>{if(o.isMesh){meshes++;assert.ok(o.isInstancedMesh)}});
  assert.equal(meshes,3);assert.ok(f.bursts>=10);
});
test('flares stop at building surfaces instead of passing through them',()=>{
  const wall={min:{x:-500,y:0,z:6},max:{x:500,y:500,z:6.1}};
  const f=new Flares(new THREE.Scene(),[wall]);f.deploy(fresh());
  f.update(1);assert.equal(f.active.length,0);assert.ok(f.smoke.length>0);
});
