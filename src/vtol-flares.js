import * as THREE from 'three';
import { traceProjectile } from './poop-cannon.js';

export const FLARES=Object.freeze({burst:8,cooldown:3,lifetime:3.8,maxActive:24,maxSmoke:240,smokeLife:2.2,smokeInterval:.06});

/** Harmless pyrotechnic flares. Three fixed instance pools keep repeated bursts bounded. */
export class Flares {
  constructor(scene,colliders=[]){
    this.colliders=colliders;this.active=[];this.smoke=[];this.cooldown=0;this.bursts=0;
    this.group=new THREE.Group();this.group.name='VTOL flare dispensers';scene.add(this.group);
    this.transform=new THREE.Object3D();this.color=new THREE.Color();this.billboard=new THREE.Quaternion();
    const pixels=new Uint8Array(64*64*4);
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){
      const i=(y*64+x)*4,r=Math.hypot((x-31.5)/31.5,(y-31.5)/31.5);
      pixels[i]=pixels[i+1]=pixels[i+2]=255;pixels[i+3]=Math.round(Math.max(0,1-r)**2*255);
    }
    const map=new THREE.DataTexture(pixels,64,64);map.magFilter=map.minFilter=THREE.LinearFilter;map.needsUpdate=true;
    const hot=new THREE.MeshBasicMaterial({map,color:'#fff4da',transparent:true,opacity:1,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
    const glow=new THREE.MeshBasicMaterial({map,color:'#ff9d46',transparent:true,opacity:.65,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
    const smoke=new THREE.MeshBasicMaterial({map,color:'#c1c3b9',transparent:true,opacity:.32,depthWrite:false});
    const quad=new THREE.PlaneGeometry(2,2);
    this.cores=new THREE.InstancedMesh(quad,hot,FLARES.maxActive);
    this.glows=new THREE.InstancedMesh(quad,glow,FLARES.maxActive);
    this.trails=new THREE.InstancedMesh(quad,smoke,FLARES.maxSmoke);
    this.cores.setColorAt(0,this.color);this.glows.setColorAt(0,this.color);
    for(const mesh of [this.cores,this.glows,this.trails]){
      mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(mesh);
    }
  }
  deploy(state){
    if(state.crashed||this.cooldown>0)return false;
    this.cooldown=FLARES.cooldown;this.bursts++;
    for(const side of [-1,1])for(let i=0;i<FLARES.burst/2;i++){
      const position=new THREE.Vector3(side*2.3,-.35,1.8).applyQuaternion(state.orientation).add(state.position);
      const velocity=new THREE.Vector3(side*(10+i*3),-1+i*1.4,14+i*3).applyQuaternion(state.orientation).addScaledVector(state.velocity,.85);
      this.active.push({position,velocity,age:0,smokeAge:0,phase:i+side});
    }
    if(this.active.length>FLARES.maxActive)this.active.splice(0,this.active.length-FLARES.maxActive);
    this.draw();return true;
  }
  update(dt){
    if(dt<=0)return;
    this.cooldown=Math.max(0,this.cooldown-dt);if(this.cooldown<1e-8)this.cooldown=0;
    const steps=Math.ceil(dt*60),h=dt/steps;
    for(let step=0;step<steps;step++){
      for(let i=this.smoke.length-1;i>=0;i--){
        const s=this.smoke[i];s.age+=h;s.position.y+=h*.65;
        if(s.age>=FLARES.smokeLife)this.smoke.splice(i,1);
      }
      for(let i=this.active.length-1;i>=0;i--){
        const f=this.active[i],drag=Math.exp(-.9*h),to=f.position.clone().addScaledVector(f.velocity,(1-drag)/.9);
        to.y-=1.8*h*h;
        const hit=traceProjectile(f.position,to,this.colliders);
        f.velocity.multiplyScalar(drag);f.velocity.y-=3.6*h;f.age+=h;f.smokeAge+=h;
        f.position.copy(hit?hit.point:to);
        if(f.smokeAge>=FLARES.smokeInterval||hit){
          f.smokeAge%=FLARES.smokeInterval;
          this.smoke.push({position:f.position.clone(),age:0,phase:f.phase});
          if(this.smoke.length>FLARES.maxSmoke)this.smoke.shift();
        }
        if(hit||f.age>=FLARES.lifetime)this.active.splice(i,1);
      }
    }
    // Instance matrices are written once per frame in render(), after the camera settles.
  }
  draw(){
    const obj=this.transform;
    this.cores.count=this.glows.count=this.active.length;this.trails.count=this.smoke.length;
    this.active.forEach((f,i)=>{
      const life=1-f.age/FLARES.lifetime,pulse=1+Math.sin(f.age*37+f.phase)*.12;
      obj.position.copy(f.position);obj.quaternion.copy(this.billboard);obj.scale.setScalar((.22+life*.2)*pulse);obj.updateMatrix();this.cores.setMatrixAt(i,obj.matrix);
      this.color.setRGB(life,life,life);this.cores.setColorAt(i,this.color);
      obj.scale.setScalar((.45+life*.95)*pulse);obj.updateMatrix();this.glows.setMatrixAt(i,obj.matrix);this.glows.setColorAt(i,this.color);
    });
    this.smoke.forEach((s,i)=>{
      const fade=Math.min(1,(FLARES.smokeLife-s.age)/.45);
      obj.position.copy(s.position);obj.quaternion.copy(this.billboard);obj.rotateZ(s.phase+s.age*.2);
      const size=(.65+s.age*.9)*Math.max(0,fade);obj.scale.set(size,size*.85,1);obj.updateMatrix();this.trails.setMatrixAt(i,obj.matrix);
    });
    for(const mesh of [this.cores,this.glows,this.trails]){
      // Empty pools skip the instance buffer upload entirely.
      if(mesh.count===0)continue;
      mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }
  }
  render(camera){this.billboard.copy(camera.quaternion);this.draw()}
  clear(){this.active.length=this.smoke.length=0;this.cooldown=0;this.bursts=0;this.draw()}
  snapshot(){return{bursts:this.bursts,active:this.active.length,smoke:this.smoke.length,cooldown:this.cooldown}}
}
