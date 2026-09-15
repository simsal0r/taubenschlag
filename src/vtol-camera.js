import * as THREE from 'three';
import { raycastCollider } from './collision.js';
import { PILOT_DEFAULTS, pilotValue } from './pilot-settings.js';
import { segmentColliders } from './collider-index.js';

// Visual tuning from the supplied BF6 chase footage; not extracted game constants.
export const VTOL_CAMERA=Object.freeze({
  fov:68,lookAhead:12,aimHeight:2.5,pitchFollow:.32,
  yawResponse:8,pitchResponse:5,boomRecovery:5,clearance:.6,
});

export class VTOLChaseCamera {
  constructor(){
    this.position=new THREE.Vector3();this.target=new THREE.Vector3();
    this.forward=new THREE.Vector3();this.origin=new THREE.Vector3();this.offset=new THREE.Vector3();
    this.rotation=new THREE.Quaternion();this.euler=new THREE.Euler(0,0,0,'YXZ');
    this.ray=new THREE.Ray();this.box=new THREE.Box3();
    this.yaw=0;this.pitch=0;this.boomLength=0;this.initialized=false;
  }
  update(aircraft,dt,{settings=PILOT_DEFAULTS,colliders=[],lookYaw=0,lookPitch=0,snap=false}={}){
    snap ||= !this.initialized;
    const {clamp,damp}=THREE.MathUtils;
    this.forward.set(0,0,-1).applyQuaternion(aircraft.orientation);
    // Hold heading near vertical flight, where a projected forward vector is ambiguous.
    const heading=Math.hypot(this.forward.x,this.forward.z)>.18
      ?Math.atan2(-this.forward.x,-this.forward.z):this.yaw;
    const pitch=clamp(Math.asin(clamp(this.forward.y,-1,1))*VTOL_CAMERA.pitchFollow,-.4,.4);
    const yawDelta=Math.atan2(Math.sin(heading-this.yaw),Math.cos(heading-this.yaw));
    this.yaw=snap?heading:this.yaw+yawDelta*(1-Math.exp(-dt*VTOL_CAMERA.yawResponse));
    this.pitch=snap?pitch:damp(this.pitch,pitch,VTOL_CAMERA.pitchResponse,dt);
    this.euler.set(clamp(this.pitch+lookPitch,-1.3,1.3),this.yaw+lookYaw,0,'YXZ');
    this.rotation.setFromEuler(this.euler);
    this.offset.set(0,pilotValue('cameraHeight',settings.cameraHeight),pilotValue('cameraDistance',settings.cameraDistance)).applyQuaternion(this.rotation);
    this.position.copy(aircraft.position).add(this.offset);
    this.target.set(0,VTOL_CAMERA.aimHeight,-VTOL_CAMERA.lookAhead).applyQuaternion(this.rotation).add(aircraft.position);

    // Anchor translation to the aircraft, so speed does not stretch the chase distance.
    // Only heading/pitch lag; the airframe stays readable in the lower centre of the view.
    this.origin.copy(aircraft.position);this.origin.y+=1;
    this.offset.copy(this.position).sub(this.origin);
    let safeDistance=this.offset.length();this.offset.normalize();this.ray.set(this.origin,this.offset);
    // The infinite ground plane is not in the building collider list.
    if(this.offset.y<0)safeDistance=Math.min(safeDistance,Math.max(0,(VTOL_CAMERA.clearance-this.origin.y)/this.offset.y));
    for(const collider of segmentColliders(colliders,this.origin,this.position)){
      this.box.min.set(collider.min.x,collider.min.y,collider.min.z);
      this.box.max.set(collider.max.x,collider.max.y,collider.max.z);
      if(!this.ray.intersectsBox(this.box))continue;
      const hit=raycastCollider(this.origin,this.offset,collider,safeDistance);
      if(hit!==null)safeDistance=Math.max(0,hit-VTOL_CAMERA.clearance);
    }
    // Pull in immediately before walls; ease back out when the line of sight clears.
    this.boomLength=snap||safeDistance<this.boomLength?safeDistance:damp(this.boomLength,safeDistance,VTOL_CAMERA.boomRecovery,dt);
    this.position.copy(this.origin).addScaledVector(this.offset,this.boomLength);
    this.initialized=true;return this;
  }
}
