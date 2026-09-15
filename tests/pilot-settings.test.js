import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePilotSettings, PILOT_DEFAULTS } from '../src/pilot-settings.js';

test('older pilot saves retain mouse preferences and acquire handling/camera defaults',()=>{
 assert.deepEqual(normalizePilotSettings({invert:false,sensitivity:1.4}),{...PILOT_DEFAULTS,invert:false,sensitivity:1.4});
 assert.equal(normalizePilotSettings().inertia,1.5);
 assert.equal(normalizePilotSettings({inertia:1}).inertia,1,'an explicit saved setting overrides the default');
});
test('malformed saves and out-of-range values cannot poison flight or camera math',()=>{
 for(const invalid of [null,undefined,42,'broken',[]])assert.deepEqual(normalizePilotSettings(invalid),PILOT_DEFAULTS);
 const settings=normalizePilotSettings({agility:100,inertia:-1,sensitivity:NaN,cameraDistance:Infinity,cameraHeight:'7',invert:'false',extra:1});
 assert.equal(settings.agility,2.5);assert.equal(settings.inertia,.3);
 assert.equal(settings.sensitivity,1);assert.equal(settings.cameraDistance,22);assert.equal(settings.cameraHeight,7);
 assert.equal(settings.invert,true);assert.equal('extra' in settings,false);
});
