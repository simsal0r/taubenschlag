import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VTOLChaseCamera, VTOL_CAMERA } from '../src/vtol-camera.js';

const aircraft=()=>({position:new THREE.Vector3(0,100,0),orientation:new THREE.Quaternion()});
const screenPoint=(rig,point)=>{
 const camera=new THREE.PerspectiveCamera(VTOL_CAMERA.fov,16/9,.07,3000);
 camera.position.copy(rig.position);camera.lookAt(rig.target);camera.updateMatrixWorld();
 return point.clone().project(camera);
};
test('chase view frames the pigeon below centre through pitch changes and visible banks',()=>{
 for(const [pitch,roll] of [[0,0],[-.9,0],[.9,0],[0,.8],[0,Math.PI]]){
  const plane=aircraft();plane.orientation.setFromEuler(new THREE.Euler(pitch,.8,roll,'YXZ'));
  const rig=new VTOLChaseCamera().update(plane,0);
  const point=screenPoint(rig,plane.position);
  assert.ok(Math.abs(point.x)<1e-10);
  assert.ok(point.y<-.18&&point.y>-.4,`pigeon should stay in lower centre: ${point.y}`);
 }
});
test('translation does not stretch chase distance and yaw follows smoothly behind a turn',()=>{
 const plane=aircraft(),rig=new VTOLChaseCamera().update(plane,0),offset=rig.position.clone().sub(plane.position);
 plane.position.add(new THREE.Vector3(20,10,-50));rig.update(plane,1/30);
 assert.ok(rig.position.clone().sub(plane.position).distanceTo(offset)<1e-8);
 plane.orientation.setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2);rig.update(plane,1/60);
 assert.ok(rig.yaw>0&&rig.yaw<.3,'camera follows turn rather than snapping');
 for(let i=0;i<120;i++)rig.update(plane,1/60);
 assert.ok(Math.abs(rig.yaw-Math.PI/2)<1e-6);
});
test('camera retracts immediately at a thin wall and eases back into open air',()=>{
 const plane=aircraft(),rig=new VTOLChaseCamera().update(plane,0);
 const wall={min:{x:-30,y:90,z:8},max:{x:30,y:130,z:8.1}};
 rig.update(plane,1/60,{colliders:[wall]});assert.ok(rig.position.z<8);
 const short=rig.boomLength;rig.update(plane,1/60);
 assert.ok(rig.boomLength>short);assert.ok(rig.position.z<22);
 for(let i=0;i<240;i++)rig.update(plane,1/60);
 assert.ok(Math.abs(rig.position.z-22)<1e-6);
});
test('near-vertical pitch does not flip the chase heading; freelook never changes the airframe',()=>{
 const plane=aircraft(),rig=new VTOLChaseCamera().update(plane,0);
 for(let degrees of [85,89,91,95]){
  plane.orientation.setFromAxisAngle(new THREE.Vector3(1,0,0),THREE.MathUtils.degToRad(degrees));
  rig.update(plane,1/60);assert.equal(rig.yaw,0);
 }
 const q=plane.orientation.clone();rig.update(plane,1/60,{lookYaw:.5,lookPitch:.2});
 assert.ok(plane.orientation.angleTo(q)<1e-7);assert.ok(rig.position.toArray().every(Number.isFinite));
});
test('looking upward near the ground cannot put the chase camera below the terrain',()=>{
 const plane=aircraft();plane.position.y=3;
 const rig=new VTOLChaseCamera().update(plane,0,{lookPitch:1});
 assert.ok(rig.position.y>=VTOL_CAMERA.clearance-1e-8);
 assert.ok(rig.boomLength<10);
});
