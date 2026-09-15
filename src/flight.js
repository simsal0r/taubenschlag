// Cozy flight: only a discrete flap can add kinetic speed. Steering redirects it.
export const FLIGHT = Object.freeze({
  flapImpulse: 4.2,
  maxSpeed: 500 / 3.6,
  jetSpeed: 100 / 3.6,
  indoorImpulse: 1.35,
  indoorMaxSpeed: 5.2,
  glideGrace: .65,
  drag: .24,
  friction: .62,
  hoverThreshold: .08,
  maxPitch: Math.PI * .36,
});

export function createFlightState() {
  return { speed: 0, pitch: 0, flapAge: Infinity, flapCount: 0 };
}

export function flap(flight, indoors = false) {
  const cap = indoors ? FLIGHT.indoorMaxSpeed : FLIGHT.maxSpeed;
  const impulse = indoors ? FLIGHT.indoorImpulse : FLIGHT.flapImpulse;
  flight.speed = Math.min(cap, flight.speed + impulse);
  flight.flapAge = 0;
  flight.flapCount++;
  return true;
}

export function stopFlight(flight) {
  flight.speed = 0;
  flight.pitch = 0;
  flight.flapAge = Infinity;
}

export function advanceFlight(flight, dt, { pitch = 0, brake = false, indoors = false } = {}) {
  const previousAge = flight.flapAge;
  flight.flapAge += dt;
  const pitchTarget = Math.max(-1, Math.min(1, pitch)) * FLIGHT.maxPitch;
  flight.pitch += (pitchTarget - flight.pitch) * (1 - Math.exp(-dt * 3.8));
  // Entering a tight space may slow the pigeon. Leaving never restores speed.
  if (indoors) flight.speed = Math.min(flight.speed, FLIGHT.indoorMaxSpeed);
  // Integrate only the part of this step after the grace period (frame-rate independent).
  const dragTime = previousAge >= FLIGHT.glideGrace ? dt :
    Math.max(0, flight.flapAge - FLIGHT.glideGrace);
  if (dragTime > 0) {
    const offset = FLIGHT.friction / FLIGHT.drag;
    flight.speed = Math.max(0, (flight.speed + offset) * Math.exp(-FLIGHT.drag * dragTime) - offset);
  }
  if (brake) flight.speed *= Math.exp(-dt * 3.8);
  if (flight.speed < FLIGHT.hoverThreshold) flight.speed = 0;
  return flight.speed;
}

export function flightVelocity(speed, yaw, pitch, target) {
  const horizontal = Math.cos(pitch) * speed;
  target.x = -Math.sin(yaw) * horizontal;
  target.y = Math.sin(pitch) * speed;
  target.z = -Math.cos(yaw) * horizontal;
  return target;
}
