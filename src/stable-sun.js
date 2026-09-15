import * as THREE from 'three';

// Quantize in the light's coordinates, not world X/Z. A fractional shadow-texel
// translation otherwise makes every building edge crawl when the player moves.
export class StableSun {
  constructor(light){
    this.light=light;
    this.offset=new THREE.Vector3(-95,160,130);
    const rotation=new THREE.Matrix4().lookAt(this.offset,new THREE.Vector3(),new THREE.Vector3(0,1,0));
    this.right=new THREE.Vector3().setFromMatrixColumn(rotation,0);
    this.up=new THREE.Vector3().setFromMatrixColumn(rotation,1);
    this.back=new THREE.Vector3().setFromMatrixColumn(rotation,2);
    this.focus=new THREE.Vector3();
  }
  update(position){
    const {light,right,up,back,focus}=this,c=light.shadow.camera;
    focus.set(position.x,Math.max(40,Math.min(240,(position.y||40)-35)),position.z);
    const xStep=(c.right-c.left)/light.shadow.mapSize.x,yStep=(c.top-c.bottom)/light.shadow.mapSize.y;
    const x=Math.round(focus.dot(right)/xStep)*xStep,y=Math.round(focus.dot(up)/yStep)*yStep;
    const z=Math.round(focus.dot(back)*4)/4;
    light.target.position.copy(right).multiplyScalar(x).addScaledVector(up,y).addScaledVector(back,z);
    light.position.copy(light.target.position).add(this.offset);
  }
}
