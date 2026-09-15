import * as THREE from 'three';
import { FLIGHT } from './flight.js';

/** Decorative engines: propulsion remains entirely controlled by flap impulses. */
export function createWingJets(wings) {
  const shell=new THREE.MeshStandardMaterial({color:'#dce1dd',metalness:.55,roughness:.32});
  const band=new THREE.MeshStandardMaterial({color:'#d5a55e',metalness:.5,roughness:.38});
  const graphite=new THREE.MeshStandardMaterial({color:'#364c59',metalness:.65,roughness:.3});
  const fanMaterial=new THREE.MeshStandardMaterial({color:'#9cb9c0',metalness:.7,roughness:.3});
  const glow=new THREE.MeshBasicMaterial({color:'#c2f5ff'});
  const flameMaterial=new THREE.MeshBasicMaterial({color:'#ffbd66',transparent:true,opacity:.65,depthWrite:false,blending:THREE.AdditiveBlending});
  const coreMaterial=new THREE.MeshBasicMaterial({color:'#bcefff',transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending});
  const pods=[];
  let deployment=0;

  function mesh(parent,geometry,material,x=0,y=0,z=0) {
    const part=new THREE.Mesh(geometry,material);
    part.position.set(x,y,z);part.castShadow=!material.transparent;
    parent.add(part);return part;
  }
  const tube=(top,bottom,length)=>new THREE.CylinderGeometry(top,bottom,length,16,1,true).rotateX(Math.PI/2);
  const ring=radius=>new THREE.TorusGeometry(radius,.013,6,20);
  const plume=(radius,length)=>new THREE.ConeGeometry(radius,length,12,1,true).rotateX(Math.PI/2).translate(0,0,length/2);

  wings.forEach((wing,index)=>{
    const side=index===0?-1:1,pod=new THREE.Group();pod.name=`wing-jet-${side<0?'left':'right'}`;
    pod.position.set(side*.48,-.02,.09);pod.visible=false;wing.add(pod);
    mesh(pod,new THREE.BoxGeometry(.055,.16,.14),graphite,0,.105,0);
    mesh(pod,tube(.086,.105,.43),shell);
    mesh(pod,tube(.099,.103,.045),band,0,0,-.11);
    mesh(pod,ring(.102),graphite,0,0,-.218);
    mesh(pod,new THREE.CircleGeometry(.088,20).rotateY(Math.PI),graphite,0,0,-.216);
    const fan=new THREE.Group();fan.position.z=-.223;pod.add(fan);
    for(let i=0;i<6;i++){
      const blade=mesh(fan,new THREE.BoxGeometry(.024,.063,.006),fanMaterial);
      const a=i*Math.PI/3;blade.position.set(Math.sin(a)*.041,Math.cos(a)*.041,0);blade.rotation.z=-a+.32;
    }
    mesh(fan,new THREE.SphereGeometry(.026,8,6),band);
    mesh(pod,tube(.073,.086,.07),graphite,0,0,.225);
    mesh(pod,ring(.074),band,0,0,.26);
    const exhaust=mesh(pod,new THREE.CircleGeometry(.06,16),glow,0,0,.264);
    const flame=new THREE.Group();flame.position.z=.268;pod.add(flame);
    mesh(flame,plume(.071,.43),flameMaterial);
    mesh(flame,plume(.043,.29),coreMaterial);
    pods.push({pod,fan,flame,exhaust});
  });

  return {
    get deployment(){return deployment},
    update(time,speed,perched,dt){
      const active=!perched&&speed>FLIGHT.jetSpeed;
      deployment=THREE.MathUtils.damp(deployment,active?1:0,12,Math.min(.1,Math.max(0,dt)));
      if(!active&&deployment<.002)deployment=0;
      const power=THREE.MathUtils.clamp((speed-FLIGHT.jetSpeed)/(FLIGHT.maxSpeed-FLIGHT.jetSpeed),0,1);
      for(let i=0;i<pods.length;i++){
        const {pod,fan,flame,exhaust}=pods[i];
        pod.visible=deployment>.002;
        pod.position.y=-.015-.155*deployment;
        pod.scale.set(.7+.3*deployment,deployment,.7+.3*deployment);
        fan.rotation.z=time*(24+power*45);
        flame.visible=exhaust.visible=active;
        const flicker=1+Math.sin(time*53+i*1.8)*.12;
        flame.scale.setScalar(.8+.2*power);
        flame.scale.z=(.65+power*.95)*flicker;
      }
    }
  };
}
