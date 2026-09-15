import * as THREE from 'three';
import { Builder, seededRandom } from './geometry.js';

export function addAtmosphere(scene){
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1600,24,12),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,
    vertexShader:'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec3 direction;void main(){float h=normalize(direction).y;vec3 color=mix(vec3(.91,.89,.78),vec3(.54,.73,.79),smoothstep(-.05,.65,h));gl_FragColor=vec4(color,1.);}'
  }));sky.renderOrder=-100;scene.add(sky);
  const b=new Builder(),random=seededRandom(440),cloud=b.mat('cloud','#f0eee0',{roughness:1});
  for(let i=0;i<24;i++){
    const x=(random()-.5)*2100,z=(random()-.5)*2100,y=180+random()*90;
    for(let j=0;j<5;j++)b.sphere(x+j*12,y+Math.sin(j)*5,z,18+random()*10,5+random()*5,11+random()*8,cloud,1);
  }
  const clouds=new THREE.Group();b.finish(clouds);clouds.children.forEach(m=>m.castShadow=false);scene.add(clouds);
  return time=>{clouds.position.x=Math.sin(time*.002)*20};
}
