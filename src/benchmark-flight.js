import * as THREE from 'three';

// City-specific paths are part of the benchmark protocol. Increase routeVersion
// in benchmark.js whenever positions, camera framing, timing or effects change.
const ROUTES={
  berlin:[
    [105,110,115],[165,85,-95],[-90,165,-110],
    [-185,100,230],[-20,65,525],[180,100,360],[105,110,115],
  ],
  frankfurt:[
    [-75,135,230],[-100,180,-80],[-370,225,-280],
    [-670,105,340],[-530,85,570],[-80,95,500],[175,190,260],
  ],
};
export class BenchmarkFlight {
  constructor(map){
    this.path=new THREE.CatmullRomCurve3(ROUTES[map].map(p=>new THREE.Vector3(...p)),false,'centripetal');
    this.path.arcLengthDivisions=1200;this.path.updateArcLengths();
    this.position=new THREE.Vector3();this.tangent=new THREE.Vector3();
    this.orientation=new THREE.Quaternion();this.velocity=new THREE.Vector3();
    this.cameraPosition=new THREE.Vector3();this.target=new THREE.Vector3();
    this.rotation=new THREE.Matrix4();this.up=new THREE.Vector3(0,1,0);
    this.before=new THREE.Vector3();this.after=new THREE.Vector3();
  }
  sample(seconds){
    const t=THREE.MathUtils.clamp(seconds/30,0,1);
    // Travel by distance, so long legs do not produce unrealistic speed spikes.
    // The gentle speed variation remains entirely determined by elapsed time.
    const distanceAt=u=>u+Math.sin(u*Math.PI*2)*.05;
    this.path.getPointAt(distanceAt(t),this.position);this.path.getTangentAt(distanceAt(t),this.tangent);
    const a=Math.max(0,t-.0001),b=Math.min(1,t+.0001);
    this.path.getPointAt(distanceAt(a),this.before);this.path.getPointAt(distanceAt(b),this.after);
    this.velocity.copy(this.after).sub(this.before).divideScalar((b-a)*30);
    this.rotation.lookAt(this.position,this.target.copy(this.position).add(this.tangent),this.up);
    this.orientation.setFromRotationMatrix(this.rotation);
    this.cockpit=seconds>=25;this.boost=seconds>=20?1:0;
    this.cameraPosition.set(0,this.cockpit?1.85:7,this.cockpit?-3.35:22).applyQuaternion(this.orientation).add(this.position);
    this.target.copy(this.cameraPosition).addScaledVector(this.tangent,100);
    return this;
  }
}
