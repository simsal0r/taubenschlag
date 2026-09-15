import test from 'node:test';
import assert from 'node:assert/strict';
import { FLIGHT, createFlightState, flap, advanceFlight, flightVelocity, stopFlight } from '../src/flight.js';

test('steering and braking cannot create speed from a hover', () => {
  const flight = createFlightState();
  for (let i = 0; i < 600; i++) advanceFlight(flight, 1 / 60, { pitch: Math.sin(i), brake: i % 2 === 0 });
  assert.equal(flight.speed, 0);
  assert.ok(Object.values(flightVelocity(flight.speed, 2, flight.pitch, {})).every(v=>v===0));
});
test('every discrete press adds one impulse and one wingbeat, including rapid taps', () => {
  const flight = createFlightState();
  assert.equal(flap(flight), true);
  assert.equal(flight.speed, FLIGHT.flapImpulse);
  assert.equal(flight.flapCount, 1);
  advanceFlight(flight, .05);
  assert.equal(flap(flight), true);
  assert.equal(flight.flapCount, 2);
  assert.equal(flight.speed, FLIGHT.flapImpulse * 2);
});
test('a flap glides briefly, then slows monotonically to an exact stationary hover', () => {
  const flight = createFlightState();
  flap(flight);
  advanceFlight(flight, .5);
  assert.equal(flight.speed, FLIGHT.flapImpulse);
  let previous = flight.speed;
  for (let i = 0; i < 900; i++) {
    advanceFlight(flight, 1 / 60);
    assert.ok(flight.speed <= previous);
    previous = flight.speed;
  }
  assert.equal(flight.speed, 0);
});
test('glide decay is independent of rendering frame rate', () => {
  const slow = createFlightState(), fast = createFlightState();
  flap(slow); flap(fast);
  for (let i = 0; i < 45; i++) advanceFlight(slow, 1 / 30);
  for (let i = 0; i < 180; i++) advanceFlight(fast, 1 / 120);
  assert.ok(Math.abs(slow.speed - fast.speed) < .000001);
});
test('climbing, diving and turning preserve the scalar speed', () => {
  for (const pitch of [-1.1, -.4, 0, .4, 1.1]) {
    const velocity = flightVelocity(12, 2.1, pitch, {});
    assert.ok(Math.abs(Math.hypot(velocity.x, velocity.y, velocity.z) - 12) < 1e-10);
  }
});
test('leaving the office never produces a free speed boost', () => {
  const flight = createFlightState();
  for (let i = 0; i < 8; i++) { flap(flight); advanceFlight(flight, .25); }
  advanceFlight(flight, .01, { indoors: true });
  const speed = flight.speed;
  advanceFlight(flight, .01, { indoors: false });
  assert.ok(flight.speed <= speed && speed <= FLIGHT.indoorMaxSpeed);
});
test('braking and landing remove momentum; takeoff still requires a flap', () => {
  const flight = createFlightState();
  flap(flight); advanceFlight(flight, 1, { brake: true });
  assert.ok(flight.speed < .1);
  stopFlight(flight);
  assert.equal(flight.speed, 0);
  assert.equal(flap(flight), true);
});
test('repeated outdoor flaps reach 500 km/h, then coasting only removes speed', () => {
  const flight=createFlightState();
  for(let i=0;i<40;i++){flap(flight);advanceFlight(flight,.25)}
  assert.ok(Math.abs(flight.speed*3.6-500)<1e-9);
  advanceFlight(flight,2);
  assert.ok(flight.speed*3.6<500);
});
