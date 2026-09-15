import test from 'node:test';
import assert from 'node:assert/strict';
import { createPigeon } from '../src/pigeon.js';

test('both wing engines deploy only above 100 km/h and retract after slowing',()=>{
  const bird=createPigeon();
  const left=bird.getObjectByName('wing-jet-left'),right=bird.getObjectByName('wing-jet-right');
  const animate=speed=>{for(let i=0;i<60;i++)bird.userData.animate(i/60,speed,false,false,1,1/60)};
  animate(100/3.6);
  assert.equal(left.visible,false);assert.equal(right.visible,false);
  animate(100.01/3.6);
  assert.equal(left.visible,true);assert.equal(right.visible,true);
  assert.ok(bird.userData.jets.deployment>.99);
  animate(90/3.6);
  assert.equal(left.visible,false);assert.equal(right.visible,false);
});
