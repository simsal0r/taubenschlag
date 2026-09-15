import * as THREE from 'three';

// At default inertia, a 22 m/s impulse settles about 50 m above a level hover.
export const THRUSTERS=Object.freeze({charges:5,interval:.1,recharge:2,impulse:22,flash:.18,spark:.18});
const direction=new THREE.Vector3();
export const createThrusterState=()=>({charges:THRUSTERS.charges,cooldown:0,recharge:0,flash:0,spark:0,pulses:0,misfires:0});

export function fireThrusters(state){
  const thrusters=state.thrusters;
  if(state.crashed)return false;
  if(thrusters.charges===0){
    thrusters.spark=THRUSTERS.spark;thrusters.flash=0;thrusters.misfires++;
    return false;
  }
  if(thrusters.cooldown>0)return false;
  direction.set(0,1,0).applyQuaternion(state.orientation);
  state.velocity.addScaledVector(direction,THRUSTERS.impulse);
  thrusters.charges--;thrusters.pulses++;
  thrusters.cooldown=THRUSTERS.interval;thrusters.flash=THRUSTERS.flash;thrusters.spark=0;
  // Spending another charge must not delay the charge already regenerating.
  if(thrusters.recharge===0)thrusters.recharge=THRUSTERS.recharge;
  return true;
}

export function advanceThrusters(thrusters,dt){
  if(dt<=0)return;
  for(const key of ['cooldown','flash','spark']){
    thrusters[key]=Math.max(0,thrusters[key]-dt);
    if(thrusters[key]<1e-8)thrusters[key]=0;
  }
  if(thrusters.charges<THRUSTERS.charges){
    thrusters.recharge-=dt;
    while(thrusters.recharge<=1e-8&&thrusters.charges<THRUSTERS.charges){
      thrusters.charges++;
      thrusters.recharge+=THRUSTERS.recharge;
    }
  }
  if(thrusters.charges===THRUSTERS.charges)thrusters.recharge=0;
}
