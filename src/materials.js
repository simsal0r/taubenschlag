import * as THREE from 'three';
import { seededRandom } from './geometry.js';

export function texture(draw,size=256){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  draw(canvas.getContext('2d'),size,seededRandom(917));
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=8;
  return map;
}
export function masonryTexture(){
  return texture((ctx,s,random)=>{
    ctx.fillStyle='#b29178';ctx.fillRect(0,0,s,s);
    for(let row=0;row<16;row++)for(let col=-1;col<8;col++){
      const light=44+random()*15;
      ctx.fillStyle=`hsl(${14+random()*7} 37% ${light}%)`;
      ctx.fillRect(col*38+(row%2)*19,row*16,36,14);
      ctx.fillStyle='#f5c89b19';ctx.fillRect(col*38+(row%2)*19,row*16,36,1);
    }
  });
}
export function windowTexture(warm=false){
  return texture((ctx,s)=>{
    ctx.clearRect(0,0,s,s);
    ctx.fillStyle='#716f653b';ctx.fillRect(57,22,148,205);
    ctx.fillStyle='#e1d7be';ctx.fillRect(58,19,139,193);
    const glass=ctx.createLinearGradient(0,20,110,210);
    glass.addColorStop(0,warm?'#c2ad83':'#829eab');glass.addColorStop(.48,warm?'#cfbf9c':'#abc1c3');glass.addColorStop(1,'#526e77');
    ctx.fillStyle=glass;ctx.fillRect(65,25,125,180);
    ctx.fillStyle='#e9e4cb';ctx.fillRect(125,25,4,180);ctx.fillRect(65,101,125,4);
    ctx.fillStyle='#fffbe720';ctx.beginPath();ctx.moveTo(68,27);ctx.lineTo(127,27);ctx.lineTo(85,202);ctx.lineTo(68,202);ctx.fill();
    ctx.fillStyle='#e7dec8';ctx.fillRect(51,208,153,9);ctx.fillStyle='#77786940';ctx.fillRect(53,217,155,5);
  });
}
export function pavementTexture(){
  return texture((ctx,s,r)=>{
    ctx.fillStyle='#c9c7b7';ctx.fillRect(0,0,s,s);
    for(let y=0;y<s;y+=32)for(let x=0;x<s;x+=32){
      ctx.fillStyle=`hsl(45 12% ${76+r()*7}%)`;ctx.fillRect(x+1,y+1,30,30);
    }
  });
}
export function waterMaterial(){
  // River strips overlap at bends. Draw after opaque scenery without competing depth writes.
  const mat=new THREE.MeshStandardMaterial({color:'#4f9b9e',roughness:.27,metalness:.3,transparent:true,opacity:1,depthWrite:false});
  const clock={value:0};
  mat.onBeforeCompile=shader=>{
    shader.uniforms.breezeTime=clock;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 waterWorld;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nwaterWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 waterWorld;\nuniform float breezeTime;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float ripple=sin(waterWorld.x*.52+waterWorld.z*.83+breezeTime*1.3)*sin(waterWorld.x*.31-waterWorld.z*.16-breezeTime*.8);
      float shimmer=pow(max(0.,ripple),12.);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.7,.87,.8),shimmer*.3);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
      normal=normalize(normal+vec3(sin(waterWorld.x*.42+breezeTime)*.045,0.,cos(waterWorld.z*.71-breezeTime)*.045));`);
  };
  return {material:mat,update:time=>clock.value=time};
}
