import test from 'node:test';
import assert from 'node:assert/strict';
import { moveWithCollisions, surfaceBelow, BIRD_RADIUS, raycastCollider } from '../src/physics.js';

const wall={min:{x:-4,y:0,z:-.1},max:{x:4,y:10,z:.1}};
const floor={min:{x:-20,y:74.8,z:-17},max:{x:20,y:75.1,z:17}};

test('fast flight cannot tunnel through a thin facade',()=>{
  const p={x:0,y:4,z:3},v={x:0,y:0,z:-500/3.6};
  const result=moveWithCollisions(p,v,.1,[wall]);
  assert.equal(result.hit,true);
  assert.ok(p.z>=wall.max.z+BIRD_RADIUS-.0001);
  assert.equal(v.z,0);
});
test('a collision allows sliding along a facade',()=>{
  const p={x:0,y:4,z:1},v={x:5,y:0,z:-20};
  moveWithCollisions(p,v,.1,[wall]);
  assert.ok(p.x>.4);
  assert.ok(p.z>=wall.max.z+BIRD_RADIUS-.0001);
});
test('descending onto an office floor keeps the bird above it',()=>{
  const p={x:0,y:77,z:0},v={x:0,y:-20,z:0};
  const result=moveWithCollisions(p,v,.2,[floor]);
  assert.equal(result.grounded,true);
  assert.ok(Math.abs(p.y-(floor.max.y+BIRD_RADIUS))<.0001);
});
test('the open doorway between two wall segments is traversable',()=>{
  const left={min:{x:-22,y:75,z:16.7},max:{x:8,y:79,z:16.9}};
  const right={min:{x:17,y:75,z:16.7},max:{x:22,y:79,z:16.9}};
  const p={x:12,y:77,z:20},v={x:0,y:0,z:-8};
  const result=moveWithCollisions(p,v,1,[left,right]);
  assert.equal(result.hit,false);
  assert.ok(p.z<16);
});
test('perching selects the nearest surface below, ignoring the ceiling',()=>{
  const table={min:{x:-2,y:75.8,z:-1},max:{x:2,y:76,z:1}};
  const ceiling={min:{x:-20,y:78.8,z:-17},max:{x:20,y:79,z:17}};
  assert.equal(surfaceBelow({x:0,y:77,z:0},[floor,table,ceiling]),76);
  assert.equal(surfaceBelow({x:0,y:90,z:0},[floor,table,ceiling]),null);
});
test('the world floor and flight ceiling remain bounded',()=>{
  const p={x:0,y:.5,z:0},v={x:0,y:-50,z:0};
  moveWithCollisions(p,v,.1,[]);
  assert.ok(p.y>=BIRD_RADIUS);
  p.y=478;v.y=50;moveWithCollisions(p,v,.1,[]);
  assert.equal(p.y,480);
});

const diagonal={min:{x:-5,y:0,z:-5},max:{x:5,y:12,z:5},polygon:[[0,-5],[5,0],[0,5],[-5,0]]};
test('empty corners outside rotated footprints remain flyable and cannot be perched on',()=>{
  const p={x:4,y:4,z:4},v={x:0,y:0,z:1};
  assert.equal(moveWithCollisions(p,v,.2,[diagonal]).hit,false);
  assert.equal(surfaceBelow({x:4,y:13,z:4},[diagonal],2),null);
});
test('a diagonal wall redirects velocity without adding speed',()=>{
  const p={x:4,y:4,z:4},v={x:-12,y:0,z:0};
  assert.equal(moveWithCollisions(p,v,.3,[diagonal]).hit,true);
  assert.ok(p.x+p.z>=5+BIRD_RADIUS*Math.SQRT2-.001);
  assert.ok(Math.hypot(v.x,v.y,v.z)<=12);
});
test('camera rays use real footprints instead of enclosing rectangles',()=>{
  assert.equal(raycastCollider({x:4,y:4,z:4},{x:0,y:0,z:1},diagonal,10),null);
  assert.equal(raycastCollider({x:4,y:4,z:4},{x:-1,y:0,z:0},diagonal,10),3);
});
