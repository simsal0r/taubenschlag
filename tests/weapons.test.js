import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PoopCannon,CANNON,ROCKET,BOMB } from '../src/poop-cannon.js';
import { createVTOLState,resetVTOL } from '../src/vtol-flight.js';
import { ImpactEffects } from '../src/impact-effects.js';

const wall={min:{x:-40,y:0,z:-.1},max:{x:40,y:70,z:.1},tag:'tower'};
const setup=(colliders=[wall])=>{
 const scene=new THREE.Scene(),gun=new PoopCannon(scene,colliders),pilot=createVTOLState();
 resetVTOL(pilot,[0,30,30],0);return{scene,gun,pilot};
};
const tick=(gun,seconds)=>{for(let i=0;i<Math.round(seconds*120);i++)gun.update(1/120)};

test('default cannon and robotic pigeon rockets preserve distinct ballistics after switching',()=>{
 const {gun,pilot}=setup();pilot.velocity.set(12,2,-10);
 assert.equal(gun.selected,1);assert.equal(gun.fire(pilot),true);
 const round=gun.projectiles[0];assert.equal(round.velocity.z,-135);
 gun.select(2);assert.equal(gun.fire(pilot),true);
 const rocket=gun.projectiles[1];assert.equal(rocket.mesh.name,'robot-pigeon-rocket');assert.ok(rocket.exhaust);
 assert.equal(rocket.velocity.z,-58);assert.equal(rocket.velocity.x,0);assert.equal(rocket.velocity.y,0);
 gun.select(1);tick(gun,.1);
 assert.ok(Math.abs(round.velocity.y-(2-CANNON.gravity*.1))<1e-8);
 assert.equal(rocket.velocity.y,0);assert.ok(rocket.velocity.z<-70,'the rocket motor accelerates immediately');
 assert.deepEqual(gun.shotsByWeapon,{1:1,2:1,3:0});
});
test('weapon switching cannot bypass cooldowns and crashed pilots cannot fire',()=>{
 const {gun,pilot}=setup();
 gun.select(2);assert.equal(gun.fire(pilot),true);
 gun.select(1);assert.equal(gun.fire(pilot),true);
 gun.select(2);assert.equal(gun.fire(pilot),false);
 tick(gun,.2);assert.equal(gun.fire(pilot),false);
 tick(gun,.16);assert.equal(gun.fire(pilot),true);
 tick(gun,1);pilot.crashed=true;assert.equal(gun.fire(pilot),false);
});
test('each magazine fires its full capacity, then blocks fire for the exact reload duration',()=>{
 for(const spec of [CANNON,ROCKET,BOMB]){
  const {gun,pilot}=setup([]);gun.select(spec.id);
  for(let i=0;i<spec.magazine;i++){
   assert.equal(gun.fire(pilot),true);assert.equal(gun.ammo,spec.magazine-i-1);
   if(i<spec.magazine-1)gun.update(spec.interval);
  }
  assert.equal(gun.shots,spec.magazine);assert.equal(gun.reloadRemaining,spec.reload);
  assert.equal(gun.fire(pilot),false);
  gun.update(spec.reload-.01);assert.equal(gun.ammo,0);assert.equal(gun.fire(pilot),false);
  gun.update(.01);assert.equal(gun.reloadRemaining,0);assert.equal(gun.ammo,spec.magazine);
  assert.equal(gun.fire(pilot),true,'holding fire can resume immediately after reloading');
 }
});
test('rockets fire rapidly between shots while retaining the eight-round magazine and four-second reload',()=>{
 const {gun,pilot}=setup([]);gun.select(2);
 for(let i=0;i<8;i++){assert.equal(gun.fire(pilot),true);if(i<7)gun.update(.35)}
 assert.equal(gun.shots,8);assert.equal(gun.ammo,0);assert.equal(gun.reloadRemaining,4);
});
test('manual reload tops up each partial magazine on its normal timer and cannot restart or bypass it',()=>{
 for(const spec of [CANNON,ROCKET,BOMB]){
  const {gun,pilot}=setup([]);gun.select(spec.id);
  assert.equal(gun.reload(),false,'a full magazine stays ready to fire');
  assert.equal(gun.fire(pilot),true);
  assert.equal(gun.reload(),true);assert.equal(gun.reloadRemaining,spec.reload);
  assert.equal(gun.ammo,spec.magazine-1);
  gun.update(.5);
  assert.equal(gun.reload(),false);assert.equal(gun.reloadRemaining,spec.reload-.5);
  assert.equal(gun.fire(pilot),false,'remaining rounds cannot fire mid-reload');
  gun.update(spec.reload-.51);assert.equal(gun.fire(pilot),false);
  gun.update(.01);assert.equal(gun.ammo,spec.magazine);assert.equal(gun.reloadRemaining,0);
  assert.equal(gun.fire(pilot),true,'held fire can resume with a full magazine');
 }
});
test('manual reloads run independently through weapon switches and freeze without simulation time',()=>{
 const {gun,pilot}=setup([]);
 gun.fire(pilot);gun.reload();gun.update(.25);
 gun.select(2);gun.fire(pilot);gun.reload();
 const frozen=structuredClone(gun.magazines);gun.update(0);assert.deepEqual(gun.magazines,frozen);
 gun.select(3);assert.equal(gun.reload(),false);assert.equal(gun.fire(pilot),true);
 gun.update(1.75);
 assert.equal(gun.magazines[1].rounds,20);assert.equal(gun.magazines[1].reload,0);
 assert.equal(gun.magazines[2].rounds,7);assert.equal(gun.magazines[2].reload,2.25);
 assert.equal(gun.magazines[3].rounds,3);assert.equal(gun.magazines[3].reload,0);
 gun.update(2.25);assert.equal(gun.magazines[2].rounds,8);
});
test('both reloads retain progress when switching and freeze with the simulation',()=>{
 const {gun,pilot}=setup([]);
 for(let i=0;i<19;i++){gun.fire(pilot);gun.update(CANNON.interval)}
 gun.select(2);
 for(let i=0;i<8;i++){gun.fire(pilot);if(i<7)gun.update(ROCKET.interval)}
 gun.select(1);assert.equal(gun.ammo,1);gun.fire(pilot);gun.update(.5);
 gun.select(2);assert.equal(gun.ammo,0);assert.equal(gun.reloadRemaining,3.5);
 const frozen=structuredClone(gun.magazines);gun.update(0);assert.deepEqual(gun.magazines,frozen);
 gun.select(1);assert.equal(gun.reloadRemaining,1.5);assert.equal(gun.fire(pilot),false);
 gun.update(1.5);assert.equal(gun.ammo,20);
 gun.select(2);assert.equal(gun.reloadRemaining,2);assert.equal(gun.ammo,0);
 gun.update(2);assert.equal(gun.ammo,8);assert.equal(gun.reloadRemaining,0);
 gun.fire(pilot);gun.clear();assert.deepEqual(gun.magazines,{1:{rounds:20,reload:0},2:{rounds:8,reload:0},3:{rounds:4,reload:0}});
});
test('rocket thrust accelerates to cruise consistently across frame rates with no drop or lateral drift',()=>{
 const positions=[];
 for(const hz of [30,120]){
  const {gun,pilot}=setup([]);resetVTOL(pilot,[0,100,300],0);pilot.velocity.set(20,-35,0);
  gun.select(2);gun.fire(pilot);const p=gun.projectiles[0],launch=p.mesh.position.clone();
  for(let i=0;i<hz*1.5;i++)gun.update(1/hz);
  assert.equal(p.mesh.position.y,launch.y);assert.equal(p.mesh.position.x,launch.x);
  assert.ok(Math.abs(p.velocity.length()-180)<1e-8);
  assert.ok(p.mesh.position.distanceTo(launch)>200);assert.ok(p.exhaust.scale.z>1);
  positions.push(p.mesh.position.clone());
 }
 assert.ok(positions[0].distanceTo(positions[1])<1e-8);
});
test('rockets arrive later, apply eightfold direct mess and coat a wider visible area',()=>{
 const cannon=setup(),rocket=setup();rocket.gun.select(2);
 cannon.gun.fire(cannon.pilot);rocket.gun.fire(rocket.pilot);
 tick(cannon.gun,.3);tick(rocket.gun,.3);
 assert.equal(cannon.gun.hits,1);assert.equal(rocket.gun.hits,0);
 tick(rocket.gun,.4);
 assert.equal(rocket.gun.hits,1);assert.equal(rocket.gun.damage,cannon.gun.damage*8);
 assert.equal(cannon.gun.splats.length,1);assert.ok(rocket.gun.splats.length>10);
 const centre=rocket.gun.splats[0].mesh.position;
 assert.ok(rocket.gun.splats.some(s=>s.mesh.position.distanceTo(centre)>5),'splatter reaches beyond the direct impact');
 for(const s of rocket.gun.splats)assert.ok(s.mesh.position.z>wall.max.z,'all decals stay on the struck side of the wall');
});
test('splash mess reaches nearby exposed surfaces with distance falloff',()=>{
 const {gun,pilot}=setup();resetVTOL(pilot,[0,2,10],0);gun.select(2);gun.fire(pilot);tick(gun,.3);
 assert.equal(gun.surfaceDamage.get(wall),80);
 assert.ok(gun.surfaceDamage.get(null)>0&&gun.surfaceDamage.get(null)<80,'the adjacent ground receives weaker splash');
 assert.ok(gun.damage>80);
});
test('a launcher touching a facade cannot spawn rockets through the wall',()=>{
 const {gun,pilot}=setup();resetVTOL(pilot,[0,30,4.3],0);gun.select(2);
 assert.equal(gun.fire(pilot),true);assert.equal(gun.projectiles.length,0);assert.equal(gun.hits,1);assert.ok(gun.damage>=80);
 for(const s of gun.splats)assert.ok(s.mesh.position.z>wall.max.z);
});
test('rounds, splats and bursts are bounded and a new session clears combat state',()=>{
 const {scene,gun,pilot}=setup(),effects=new ImpactEffects(scene);
 gun.select(2);
 for(let i=0;i<14;i++){gun.fire(pilot);tick(gun,.9)}
 assert.ok(gun.splats.length<=CANNON.maxSplats);assert.ok(gun.splats.length>0);
 for(let i=0;i<12;i++)effects.burst(pilot.position);
 assert.equal(effects.active.length,8);effects.update(3);assert.equal(effects.active.length,0);
 effects.burst(pilot.position,{kind:'poop'});effects.clear();gun.clear();
 assert.equal(scene.children.length,0);assert.equal(gun.selected,1);assert.equal(gun.damage,0);assert.equal(gun.surfaceDamage.size,0);
});

test('bombs drop beneath the airframe with inherited momentum and frame-independent gravity',()=>{
 const positions=[];
 for(const hz of [30,120]){
  const {gun,pilot}=setup([]);resetVTOL(pilot,[0,100,100],.7);pilot.velocity.set(12,2,-35);
  gun.select(3);gun.fire(pilot);const p=gun.projectiles[0],launch=p.mesh.position.clone();
  assert.equal(p.mesh.name,'heavy-poop-bomb');assert.equal(p.exhaust,undefined);
  assert.ok(launch.y<pilot.position.y-3);
  assert.deepEqual(p.velocity.toArray(),[12,-4,-35],'no forward launch impulse');
  for(let i=0;i<hz*2;i++)gun.update(1/hz);
  assert.ok(Math.abs(p.mesh.position.x-launch.x-24)<1e-8);
  assert.ok(Math.abs(p.mesh.position.z-launch.z+70)<1e-8);
  assert.ok(Math.abs(p.mesh.position.y-launch.y-(-4*2-.5*9.81*4))<1e-8);
  assert.ok(Math.abs(p.velocity.y-(-4-9.81*2))<1e-8);
  positions.push(p.mesh.position.clone());gun.clear();
 }
 assert.ok(positions[0].distanceTo(positions[1])<1e-8);
});
test('banking rotates the bomb bay and ejection while gravity stays in world space',()=>{
 const {gun,pilot}=setup([]);resetVTOL(pilot,[0,100,0],0);
 pilot.orientation.setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2);
 pilot.velocity.set(10,4,-20);gun.select(3);gun.fire(pilot);
 const p=gun.projectiles[0];
 assert.ok(Math.abs(p.mesh.position.x-3.1)<1e-8);
 assert.ok(Math.abs(p.velocity.x-16)<1e-8);
 assert.ok(Math.abs(p.velocity.y-4)<1e-8);
 gun.update(.5);assert.ok(Math.abs(p.velocity.y-(4-9.81*.5))<1e-8);assert.equal(p.velocity.x,16);
});
test('a bomb released against a roof hits it instead of spawning through it',()=>{
 const roof={min:{x:-50,y:20,z:-50},max:{x:50,y:21,z:50},tag:'building'};
 const {gun,pilot}=setup([roof]);resetVTOL(pilot,[0,23,0],0);gun.select(3);gun.fire(pilot);
 assert.equal(gun.projectiles.length,0);assert.equal(gun.hits,1);assert.equal(gun.surfaceDamage.get(roof),200);
 assert.ok(gun.splats.every(s=>s.mesh.position.y>roof.max.y));
});
test('bombs burst on the ground with a larger bounded splash and reload while another weapon is selected',()=>{
 const {gun,pilot}=setup([]);resetVTOL(pilot,[0,35,0],0);gun.select(3);
 for(let i=0;i<4;i++){assert.equal(gun.fire(pilot),true);if(i<3)gun.update(.8)}
 assert.equal(gun.ammo,0);assert.equal(gun.reloadRemaining,5);
 gun.select(1);gun.update(2.5);
 assert.equal(gun.magazines[3].reload,2.5);assert.equal(gun.hits,4);
 assert.equal(gun.surfaceDamage.get(null),800);
 assert.ok(gun.splats.some(s=>s.mesh.position.length()>12),'mess reaches well beyond rocket splash');
 assert.ok(gun.splats.length<=CANNON.maxSplats);
 gun.select(3);assert.equal(gun.fire(pilot),false);gun.update(2.5);assert.equal(gun.ammo,4);
 assert.equal(gun.fire(pilot),true);gun.select(1);gun.select(3);assert.equal(gun.fire(pilot),false);
 pilot.crashed=true;gun.update(1);assert.equal(gun.fire(pilot),false);
 gun.clear();assert.deepEqual(gun.shotsByWeapon,{1:0,2:0,3:0});assert.equal(gun.ammo,20);
 assert.equal(gun.magazines[3].rounds,4);assert.equal(gun.projectiles.length,0);
});
