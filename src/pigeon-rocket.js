import * as THREE from 'three';
import { Builder } from './geometry.js';

/** Shared geometry/materials; launched rockets clone this little mechanical pigeon. */
export function createPigeonRocket(){
  const rocket=new THREE.Group(),b=new Builder();rocket.name='robot-pigeon-rocket';
  const silver=b.mat('rocket-silver','#c8d2cc',{metalness:.65,roughness:.36});
  const dark=b.mat('rocket-dark','#304f59',{metalness:.6,roughness:.4});
  const wing=b.mat('rocket-wing','#608d91',{metalness:.45,roughness:.4});
  const gold=b.mat('rocket-beak','#dbb770',{metalness:.5,roughness:.45});
  const eye=b.mat('rocket-eye','#9affdf',{emissive:'#65ffcc',emissiveIntensity:1.4});
  b.sphere(0,0,.1,.29,.26,.64,silver,1);
  b.sphere(0,.19,-.39,.25,.3,.3,dark,1);
  b.sphere(0,.33,-.54,.28,.27,.29,silver,1);
  b.sphere(0,.26,-.81,.12,.085,.22,gold,0);
  for(const side of [-1,1]){
    b.sphere(side*.252,.36,-.59,.032,.065,.072,eye,1);
    b.box(side*.52,.035,.12,.75,.075,.36,wing,[0,-side*.19,side*.08]);
    for(let i=0;i<3;i++)b.box(side*(.37+i*.18),.015,.31+i*.025,.19,.045,.38-i*.045,dark,[0,-side*.24,0]);
    b.box(side*.69,.09,.02,.22,.018,.052,gold);
  }
  for(let i=-1;i<=1;i++)b.box(i*.15,-.025,.74,.17,.055,.43,wing,[0,i*.2,0]);
  b.cylinder(0,0,.66,.115,.15,.2,dark,12,[Math.PI/2,0,0]);b.finish(rocket);
  const exhaust=new THREE.Group();exhaust.name='rocket-exhaust';exhaust.position.z=.76;
  const flame=(radius,length,color,opacity,x=0)=>{
    const geometry=new THREE.ConeGeometry(radius,length,7);geometry.translate(0,length/2,0);
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,toneMapped:false}));
    mesh.rotation.x=Math.PI/2;mesh.position.x=x;exhaust.add(mesh);
  };
  flame(.2,1.7,'#ff6622',.76);
  flame(.115,1.22,'#ffcb54',.95);
  flame(.064,.68,'#fff5c8',1);
  flame(.065,1.15,'#ff8d29',.65,-.11);
  flame(.065,.94,'#ff8d29',.65,.11);
  animateRocketExhaust(exhaust,0,0);rocket.add(exhaust);
  return rocket;
}

export function animateRocketExhaust(exhaust,age,boost){
  const power=THREE.MathUtils.clamp(boost,0,1);
  const flicker=1+Math.sin(age*53)*.09+Math.sin(age*91)*.05;
  exhaust.scale.set(.9+power*.2,.9+power*.2,(.72+power*.8)*flicker);
  exhaust.rotation.z=Math.sin(age*31)*.08;
}
