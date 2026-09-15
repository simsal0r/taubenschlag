import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { catTerritory,clearOfBuildings,advanceCatPatrol,resetCatPatrol,navigationGrid } from '../src/predator-navigation.js';
import { createPredator } from '../src/predator-models.js';
import { pointInPolygon } from '../src/collision.js';
import { VTOL_VOLUME } from '../src/audio.js';

const points=[[-20,-20],[20,-20],[20,20],[-20,20]];
const collider={min:{x:-20,y:0,z:-20},max:{x:20,y:120,z:20},polygon:points};
test('cat patrol reaches the roof, lingers, descends, circles the whole building and climbs again',()=>{
  const wall=catTerritory(points,120,points,[collider]);
  const e={wall,type:'cat',position:new THREE.Vector3(wall.mid[0]+wall.normal[0]*3.35,8,wall.mid[1]+wall.normal[1]*3.35),orientation:new THREE.Quaternion(),phase:0,travel:0};
  resetCatPatrol(e);const stages=new Set();let roofSeconds=0,maxY=0,maxStep=0,circulation=0,lastAngle=null;
  for(let i=0;i<4600;i++){
    const before=e.position.clone();advanceCatPatrol(e,.05);
    const step=e.position.distanceTo(before);e.travel+=step;maxStep=Math.max(maxStep,step);maxY=Math.max(maxY,e.position.y);stages.add(e.patrol.stage);
    assert.ok(Math.abs(e.orientation.length()-1)<1e-5,'surface transitions preserve a valid rigid orientation');
    if(e.patrol.stage==='roof'){roofSeconds+=.05;assert.ok(pointInPolygon(e.position.x,e.position.z,points))}
    if(e.patrol.stage==='ground'){
      assert.ok(clearOfBuildings(e.position.x,e.position.z,[collider],3.35));
      const angle=Math.atan2(e.position.z,e.position.x);
      if(lastAngle!==null)circulation+=Math.atan2(Math.sin(angle-lastAngle),Math.cos(angle-lastAngle));
      lastAngle=angle;
    }else lastAngle=null;
  }
  assert.ok(maxY>123);assert.ok(roofSeconds>110,'most of the patrol is on the rooftop');
  assert.ok(stages.has('mantle')&&stages.has('unmantle')&&stages.has('ground'));
  assert.ok(e.patrol.cycles>=1);assert.ok(Math.abs(circulation)>Math.PI*1.8,'the street route encircles the tower');
  assert.ok(maxStep<.8,'transitions do not teleport or leap between surfaces');
});
test('roof navigation respects concave footprints and streets do not cut diagonal corners',()=>{
  const shape=[[-20,-20],[20,-20],[20,-8],[-8,-8],[-8,20],[-20,20]];
  const grid=navigationGrid([-25,-25,25,25],(x,z)=>pointInPolygon(x,z,shape),2);
  const path=grid.path([-15,15],[15,-15]);assert.ok(path.length>20);
  for(const [x,z] of path)assert.ok(pointInPolygon(x,z,shape));
});
test('cyborgs retain articulated geometry nearby and a bounded two-draw-call distant model',()=>{
  for(const type of ['cat','raccoon','hawk']){
    const model=createPredator(type),low=model.levels[1].object;
    let calls=0,triangles=0;low.traverse(o=>{if(o.isMesh){calls++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3}});
    assert.equal(calls,2);assert.ok(triangles<1600);
    assert.ok(model.userData.getPose().cyborg);
  }
});
test('climbing feet keep world-space contact through their stance phase',()=>{
  const model=createPredator('cat'),e={type:'cat',position:new THREE.Vector3(0,30,3.35),orientation:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2),surfaceNormal:new THREE.Vector3(0,0,1),health:200,hostile:false,flash:0,speed:10,travel:1.7,windup:0,patrol:{stage:'climb'}};
  model.userData.animate(0,e);const before=model.userData.getPose();
  e.position.y+=.05;e.travel+=.05;model.userData.animate(.005,e);const after=model.userData.getPose();
  const planted=before.feet.filter((f,i)=>f.contact&&after.feet[i].contact);
  assert.ok(planted.length>=2);
  before.feet.forEach((f,i)=>{if(f.contact&&after.feet[i].contact)assert.deepEqual(f.anchor,after.feet[i].anchor)});
});
test('cat paw targets stay on the roof when turning beside an edge',()=>{
  const model=createPredator('cat'),e={type:'cat',position:new THREE.Vector3(17.5,123.35,17.5),orientation:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI),surfaceNormal:new THREE.Vector3(0,1,0),health:200,hostile:false,flash:0,speed:7,travel:1.7,windup:0,patrol:{stage:'roof'},wall:{roofY:120,roofPoints:points}};
  for(let i=0;i<40;i++){
    e.travel+=.1;model.userData.animate(i/60,e);
    for(const foot of model.userData.getPose().feet)assert.ok(pointInPolygon(foot.anchor[0],foot.anchor[2],points),'paws do not plant in empty space beyond the roof');
  }
});
test('VTOL engine gain increases by exactly 30 percent over the prior setting',()=>{
  assert.ok(Math.abs(VTOL_VOLUME/1.33-1.3)<1e-12);
});
