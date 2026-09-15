import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createVTOLState, advanceVTOL, resetVTOL } from '../src/vtol-flight.js';

const data=JSON.parse(readFileSync(new URL('../src/maps/frankfurt-data.json',import.meta.url)));
function contains(p,x,z){
  let result=false;
  for(let i=0,j=p.length-1;i<p.length;j=i++){
    const a=p[i],b=p[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])result=!result;
  }
  return result;
}
test('Frankfurt uses metre-scale OSM geometry around TaunusTurm with Berlin-sized flight bounds',()=>{
  assert.equal(data.playableLimit,950);
  assert.equal(data.origin.rotation,0);
  assert.equal(data.parts['368975736'].h,169.5);
  assert.equal(data.parts['368975750'].h,68.7);
  const points=data.parts['183071928'].points;
  const x=points.reduce((n,p)=>n+p[0],0)/points.length,z=points.reduce((n,p)=>n+p[1],0)/points.length;
  assert.ok(x<0&&z<-170&&z>-240,'MAIN TOWER is about 200 m north, slightly west');
  assert.ok(data.buildings.length>3000);
  for(const id of [1333665178,1333665179]){
    assert.ok(data.parts[id].points.length>=20,'rounded Silberturm cores retain their survey curves');
  }
  for(const building of data.buildings){
    assert.ok(building.h>0&&building.h<=300);
    assert.ok(building.points.length>=3);
    for(const p of building.points)assert.ok(p.every(Number.isFinite));
  }
});
test('the central Main and Taunusanlage use their relation polygons, including islands',()=>{
  const river=data.water.find(w=>contains(w.points,275,470));
  assert.ok(river?.river,'Untermainbrücke crosses mapped water');
  assert.ok(river.holes.length>0,'river islands are retained');
  assert.ok(!data.water.some(w=>contains(w.points,0,0)),'TaunusTurm is on dry land');
  const park=data.parks.find(p=>p.name==='Taunusanlage');
  assert.ok(contains(park.points,-125,-100),'the central park belt is present');
});
test('automatic crash respawn uses the active map spawn without changing manual jump behavior',()=>{
  const state=createVTOLState();
  state.spawn=[-70,132,145];state.spawnYaw=-.44;
  resetVTOL(state,[200,40,250],1);
  state.crashed=true;state.respawnIn=2;
  advanceVTOL(state,1.99,{throttle:1});
  assert.equal(state.crashed,true);
  advanceVTOL(state,.01,{throttle:1});
  assert.equal(state.crashed,false);assert.equal(state.respawned,true);
  assert.deepEqual(state.position.toArray(),state.spawn);assert.equal(state.velocity.length(),0);
  resetVTOL(state,[0,190,0],0);
  assert.deepEqual(state.position.toArray(),[0,190,0]);
  resetVTOL(state);
  assert.deepEqual(state.position.toArray(),state.spawn,'R returns to the map spawn after a landmark jump');
});
