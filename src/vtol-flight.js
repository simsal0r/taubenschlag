import * as THREE from 'three';
import { moveWithCollisions } from './collision.js';
import { PILOT_DEFAULTS, pilotValue } from './pilot-settings.js';
import { nearbyColliders } from './collider-index.js';
import { createThrusterState,advanceThrusters } from './vtol-thrusters.js';

// Original tuning for a classic Battlefield-style rotorcraft. These are not DICE constants.
export const VTOL=Object.freeze({
  gravity:9.81, idleCollective:1, fullCollective:2.5, lowCollective:.12,
  collectiveResponse:7.5, angularResponse:9,
  climbScale:3, descentScale:3,
  pitchRate:1.5, quickPitchMultiplier:1, rollRate:1.9, yawRate:1.05,
  diveAcceleration:18, diveSinkAcceleration:18, diveBlendStart:.08, diveBlendFull:.32,
  horizontalDrag:.12, quadraticDrag:.003, verticalDrag:.65,
  afterburnerAcceleration:55, afterburnerResponse:12, afterburnerTaper:.7,
  maxSpeed:500/3.6, ceiling:840, mouseSensitivity:.003, mouseRollMultiplier:2,
  crashSpeed:25, respawnDelay:2,
  spawn:[110,110,115], spawnYaw:.72,
});
const hull=[
  {center:[0,0,0],radius:2.05},
  {center:[0,.65,-2.9],radius:1.3},
  {center:[-4.55,.15,.15],radius:1.65},
  {center:[4.55,.15,.15],radius:1.65},
  {center:[0,-.35,3.2],radius:1.05},
];
const up=new THREE.Vector3(),forward=new THREE.Vector3(),axis=new THREE.Vector3(),delta=new THREE.Quaternion(),probe=new THREE.Vector3(),before=new THREE.Vector3();

export function createVTOLState(){
  const state={position:new THREE.Vector3(),velocity:new THREE.Vector3(),orientation:new THREE.Quaternion(),angularVelocity:new THREE.Vector3(),crashPoint:new THREE.Vector3(),collective:1,grounded:false,bumped:false};
  resetVTOL(state);return state;
}
export function resetVTOL(state,position=state.spawn||VTOL.spawn,yaw=state.spawnYaw??VTOL.spawnYaw){
  state.position.set(...position);state.velocity.set(0,0,0);
  state.orientation.setFromAxisAngle(new THREE.Vector3(0,1,0),yaw);
  state.angularVelocity.set(0,0,0);state.collective=VTOL.idleCollective;state.grounded=false;state.bumped=false;
  state.crashed=false;state.respawnIn=0;state.respawned=false;state.impactSpeed=0;state.crashPoint.copy(state.position);
  state.health=100;state.afterburner=0;state.thrusters=createThrusterState();
}

export function damageVTOL(state,amount){
  if(state.crashed||amount<=0)return false;
  state.health=Math.max(0,state.health-amount);
  if(state.health>0)return false;
  crashVTOL(state,state.position);return true;
}
function crashVTOL(state,point){
  state.health=0;state.crashed=true;state.respawnIn=VTOL.respawnDelay;state.crashPoint.copy(point);
  state.velocity.set(0,0,0);state.angularVelocity.set(0,0,0);state.afterburner=0;state.thrusters.flash=state.thrusters.spark=0;
}
function registerImpact(state,impact){
  if(!impact)return false;
  state.impactSpeed=Math.max(state.impactSpeed,impact.speed);
  if(impact.speed<VTOL.crashSpeed)return false;
  crashVTOL(state,impact.point);return true;
}

/** Independent collective, cyclic pitch/roll and body-axis yaw; attitude is never auto-levelled. */
export function advanceVTOL(state,dt,input={},colliders=null,settings=PILOT_DEFAULTS){
  state.respawned=false;
  if(dt<=0)return;
  if(state.crashed){
    state.respawnIn=Math.max(0,state.respawnIn-dt);
    if(state.respawnIn<1e-8){resetVTOL(state);state.respawned=true}
    return;
  }
  advanceThrusters(state.thrusters,dt);
  const clamp=THREE.MathUtils.clamp;
  const agility=pilotValue('agility',settings.agility),inertia=pilotValue('inertia',settings.inertia);
  const angularResponse=VTOL.angularResponse*agility;
  const throttle=clamp(input.throttle||0,-1,1);
  const targetCollective=throttle>0?1+throttle*(VTOL.fullCollective-1):1+throttle*(1-VTOL.lowCollective);
  // Space / E sustain a cyclic input on the same body axis as
  // the mouse. Normal mouse and arrow-key rates retain their existing tuning.
  const quickPitch=clamp(input.quickPitch||0,-1,1);
  const pitchLimit=VTOL.pitchRate*(quickPitch?VTOL.quickPitchMultiplier:1);
  const targetPitch=clamp((input.pitch||0)*VTOL.pitchRate+(input.pitchDelta||0)/dt+quickPitch*pitchLimit,-pitchLimit,pitchLimit)*agility;
  const rollLimit=VTOL.rollRate*(input.rollDelta?VTOL.mouseRollMultiplier:1);
  const targetRoll=clamp((input.roll||0)*VTOL.rollRate+(input.rollDelta||0)*VTOL.mouseRollMultiplier/dt,-rollLimit,rollLimit)*agility;
  const targetYaw=clamp(input.yaw||0,-1,1)*VTOL.yawRate*agility;
  const steps=Math.ceil(dt*120),h=dt/steps;
  const reach=12+state.velocity.length()*dt,p=state.position;
  const nearby=colliders?nearbyColliders(colliders,p.x,p.y,p.z,reach):null;
  state.grounded=false;state.bumped=false;state.impactSpeed=0;
  for(let i=0;i<steps;i++){
    state.collective=THREE.MathUtils.damp(state.collective,targetCollective,VTOL.collectiveResponse,h);
    const omega=state.angularVelocity;
    omega.x=THREE.MathUtils.damp(omega.x,targetPitch,angularResponse,h);
    omega.y=THREE.MathUtils.damp(omega.y,targetYaw,angularResponse,h);
    omega.z=THREE.MathUtils.damp(omega.z,targetRoll,angularResponse,h);
    const rate=omega.length();
    if(rate>1e-8){
      axis.copy(omega).multiplyScalar(1/rate);delta.setFromAxisAngle(axis,rate*h);
      state.orientation.multiply(delta).normalize();
    }
    up.set(0,1,0).applyQuaternion(state.orientation);
    forward.set(0,0,-1).applyQuaternion(state.orientation);
    // Twin rear jets add body-forward thrust independently of rotor collective.
    // Release cuts thrust immediately; existing velocity still obeys normal inertia.
    state.afterburner=input.afterburner?THREE.MathUtils.damp(state.afterburner,1,VTOL.afterburnerResponse,h):0;
    const noseDown=Math.max(0,-forward.y);
    const dive=THREE.MathUtils.smoothstep(noseDown,VTOL.diveBlendStart,VTOL.diveBlendFull);
    const boost=Math.max(0,state.collective-1);
    // Stable flight gets the full climb boost. A lowered nose progressively
    // redirects that boost into the dive, regardless of existing forward speed.
    const lift=Math.min(state.collective,1)+boost*(1-dive);
    state.velocity.addScaledVector(up,VTOL.gravity*lift*h);
    // Amplify vertical controls around neutral hover without increasing lateral
    // thrust. Fade extra climb power out early enough to keep nose-down dives.
    const extraClimb=boost*up.y*(1-dive)**2*(VTOL.climbScale-1);
    const extraDescent=Math.max(0,1-state.collective)*(VTOL.descentScale-1);
    state.velocity.y+=VTOL.gravity*(extraClimb-extraDescent)*h;
    // Deliberate arcade dive tuning: a lowered nose sheds height; throttle then
    // pushes along that downward flight direction rather than cancelling the dive.
    state.velocity.y-=(VTOL.gravity+VTOL.diveSinkAcceleration*noseDown*noseDown)*h;
    state.velocity.addScaledVector(forward,VTOL.diveAcceleration*boost/(VTOL.fullCollective-1)*dive*h);
    // Motion inertia controls momentum retention, independently of attitude and gravity.
    // More inertia means less passive damping on every velocity axis.
    const forwardBeforeDrag=state.velocity.dot(forward);
    const drag=(VTOL.horizontalDrag+VTOL.quadraticDrag*Math.hypot(state.velocity.x,state.velocity.z))/inertia;
    state.velocity.x*=Math.exp(-drag*h);state.velocity.z*=Math.exp(-drag*h);
    state.velocity.y*=Math.exp(-VTOL.verticalDrag*h/inertia);
    if(state.afterburner>0){
      // Jets overcome forward drag, then supply progressively less net thrust.
      // This reaches 500 km/h at every inertia setting without damping lateral drift.
      const dragLoss=Math.max(0,forwardBeforeDrag-state.velocity.dot(forward));
      const remaining=clamp(1-Math.max(0,forwardBeforeDrag)/VTOL.maxSpeed,0,1);
      state.velocity.addScaledVector(forward,state.afterburner*(dragLoss+VTOL.afterburnerAcceleration*remaining**VTOL.afterburnerTaper*h));
    }
    state.velocity.clampLength(0,VTOL.maxSpeed);
    if(!nearby){state.position.addScaledVector(state.velocity,h);continue}
    const hit=moveWithCollisions(state.position,state.velocity,h,nearby,hull[0].radius,VTOL.ceiling);
    state.grounded ||= hit.grounded;state.bumped ||= hit.hit;
    if(registerImpact(state,hit.impact))return;
    // The head, rotor ducts and tail also occupy space; a large pigeon cannot use small openings.
    for(const part of hull.slice(1)){
      probe.set(...part.center).applyQuaternion(state.orientation).add(state.position);before.copy(probe);
      const contact=moveWithCollisions(probe,state.velocity,0,nearby,part.radius,VTOL.ceiling);
      state.position.add(probe.sub(before));state.grounded ||= contact.grounded;state.bumped ||= contact.hit;
      if(registerImpact(state,contact.impact))return;
    }
    if(state.bumped)state.angularVelocity.multiplyScalar(Math.exp(-h*8));
  }
}

export function vtolAttitude(state){
  const forward=new THREE.Vector3(0,0,-1).applyQuaternion(state.orientation);
  const euler=new THREE.Euler().setFromQuaternion(state.orientation,'YXZ');
  return {pitch:Math.asin(THREE.MathUtils.clamp(forward.y,-1,1)),roll:euler.z,yaw:Math.atan2(-forward.x,-forward.z)};
}
