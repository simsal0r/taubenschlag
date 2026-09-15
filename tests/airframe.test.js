import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCyborgPigeon } from '../src/cyborg-pigeon.js';
import { createVTOLState } from '../src/vtol-flight.js';
const setup=()=>{const model=createCyborgPigeon(),state=createVTOLState();state.orientation.identity();return{model,state}};
const animate=(model,state,seconds=2,hz=60)=>{for(let i=0;i<seconds*hz;i++)model.userData.animate(i/hz,state,1/hz)};

test('cruise sweeps wings, vectors ducts, retracts talons and changes wing color without changing flight state',()=>{
 const {model,state}=setup();animate(model,state);const hover=model.userData.getAppearance();
 state.velocity.set(0,0,-90);const flight=state.velocity.clone(),orientation=state.orientation.clone();
 animate(model,state);const cruise=model.userData.getAppearance();
 assert.notEqual(cruise.wingColor,hover.wingColor);
 assert.ok(Math.abs(cruise.wings[0].rotation[1])>Math.abs(hover.wings[0].rotation[1])+.1);
 assert.ok(cruise.wings[0].duct[0]>.15);assert.ok(cruise.gear.every(angle=>angle<-1.4));
 assert.ok(state.velocity.equals(flight));assert.ok(state.orientation.equals(orientation));
 const bounds=new THREE.Box3().setFromObject(model);
 assert.ok(bounds.max.x-bounds.min.x<12.4&&bounds.max.z-bounds.min.z<8.4,'the redesigned hull keeps its original clearance envelope');
 state.velocity.set(0,0,0);animate(model,state,3);assert.ok(model.userData.getAppearance().gear.every(angle=>Math.abs(angle)<.001));
});
test('bank, pitch and yaw articulate independent wing feathers, ducts and tail',()=>{
 const {model,state}=setup();
 state.orientation.setFromEuler(new THREE.Euler(.3,0,.65,'YXZ'));state.angularVelocity.set(.6,.7,1);
 animate(model,state);const pose=model.userData.getAppearance();
 assert.ok(pose.wings[0].feathers[5]<pose.wings[1].feathers[5]-.3,'ailerons deflect differentially during roll');
 assert.ok(Math.abs(pose.tail[1])>.08,'tail responds to yaw');
 assert.ok(Math.abs(pose.wings[0].duct[0])>.06,'ducts respond to pitch');
 const saved=structuredClone(pose);model.userData.animate(2,state,0);
 assert.deepEqual(model.userData.getAppearance(),saved,'paused animation does not change the pose');
});
test('mechanical response is consistent at 30 and 120 fps and geometry stays bounded',()=>{
 const results=[];
 for(const hz of [30,120]){
  const {model,state}=setup();state.velocity.set(20,5,-55);state.angularVelocity.set(.3,-.4,.6);
  animate(model,state,1,hz);results.push(model.userData.getAppearance());
  let triangles=0;model.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3});
  assert.ok(triangles<20000,'detailed model remains lightweight');
 }
 for(const key of ['speed','pitch','bank','yaw'])assert.ok(Math.abs(results[0][key]-results[1][key])<1e-8);
 assert.equal(results[0].wingColor,results[1].wingColor);
});
