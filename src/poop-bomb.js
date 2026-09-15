import * as THREE from 'three';
import { Builder } from './geometry.js';

/** A chunky poop payload in a finned carrier; all drops share these four batches. */
export function createPoopBomb(){
  const bomb=new THREE.Group(),b=new Builder();bomb.name='heavy-poop-bomb';
  const poop=b.mat('bomb-poop','#806044',{roughness:.87});
  const cream=b.mat('bomb-cream','#f1dfb1',{roughness:.72});
  const metal=b.mat('bomb-shell','#385660',{metalness:.7,roughness:.35});
  const gold=b.mat('bomb-markings','#f5b54c',{metalness:.35,roughness:.43});
  b.sphere(0,0,-.16,.78,.78,1.05,poop,2);
  for(const [z,r]of [[-.45,.68],[-.83,.51],[-1.12,.32]]){
    b.add(new THREE.TorusGeometry(r,.18,8,24),z<-1?cream:poop,[0,0,z]);
  }
  b.sphere(.07,.03,-1.4,.19,.19,.3,cream,1);
  b.cylinder(0,0,.2,.8,.8,.34,metal,20,[Math.PI/2,0,0]);
  for(const z of [.02,.38])b.cylinder(0,0,z,.815,.815,.07,gold,20,[Math.PI/2,0,0]);
  b.cylinder(0,0,.88,.3,.63,.96,metal,16,[Math.PI/2,0,0]);
  for(let i=0;i<4;i++){
    const angle=i*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
    b.box(c*.57,s*.57,1.06,1.05,.09,.84,metal,[0,0,angle]);
    b.box(c*.94,s*.94,1.05,.16,.105,.57,gold,[0,0,angle]);
  }
  b.cylinder(0,0,1.48,.25,.25,.08,gold,12,[Math.PI/2,0,0]);
  b.finish(bomb);return bomb;
}
