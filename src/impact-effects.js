import * as THREE from 'three';

/** Short, bounded bursts shared by airframe explosions, rockets and bombs. */
export class ImpactEffects {
  constructor(scene){
    this.scene=scene;this.active=[];
    this.puffGeometry=new THREE.IcosahedronGeometry(1,1);
    this.shardGeometry=new THREE.BoxGeometry(1,1,1);
    this.ringGeometry=new THREE.TorusGeometry(1,.045,6,48);
    this.transform=new THREE.Object3D();
  }
  burst(position,{kind='crash',radius=7}={}){
    const crash=kind==='crash',group=new THREE.Group();group.position.copy(position);
    const material=new THREE.MeshBasicMaterial({color:crash?'#ffbb72':'#ead9ad',transparent:true,opacity:.9,depthWrite:false});
    const smokeMaterial=new THREE.MeshBasicMaterial({color:crash?'#617775':'#9a7850',transparent:true,opacity:.75,depthWrite:false});
    const shardsMaterial=new THREE.MeshStandardMaterial({color:crash?'#557c81':'#f4e7c4',metalness:crash?.5:0,roughness:.7,transparent:true});
    const puffs=new THREE.InstancedMesh(this.puffGeometry,smokeMaterial,14);
    const fragments=new THREE.InstancedMesh(crash?this.shardGeometry:this.puffGeometry,shardsMaterial,28);
    puffs.frustumCulled=fragments.frustumCulled=false;
    const flash=new THREE.Mesh(this.puffGeometry,material),ring=new THREE.Mesh(this.ringGeometry,material);
    ring.rotation.x=-Math.PI/2;group.add(puffs,fragments,flash,ring);this.scene.add(group);
    const particles=Array.from({length:42},(_,i)=>{
      const angle=i*2.399,vertical=(i%7)/6*1.7-.3,speed=radius*(i<14?.5:1.5);
      return {velocity:new THREE.Vector3(Math.cos(angle),vertical,Math.sin(angle)).normalize().multiplyScalar(speed*(.55+(i%5)*.13)),spin:i*.73};
    });
    const effect={group,puffs,fragments,flash,ring,material,smokeMaterial,shardsMaterial,particles,age:0,life:crash?2.7:1.5,radius,crash};
    this.active.push(effect);if(this.active.length>8)this.remove(this.active.shift());
    this.draw(effect);
  }
  draw(e){
    const t=e.age,fade=Math.max(0,1-t/e.life),obj=this.transform;
    e.material.opacity=Math.max(0,.85-t*2);e.smokeMaterial.opacity=fade*.68;e.shardsMaterial.opacity=fade;
    e.flash.scale.setScalar(Math.max(.01,e.radius*(.18+t*.9)));e.flash.visible=t<.45;
    e.ring.scale.setScalar(Math.max(.01,e.radius*(.2+t*1.3)));e.ring.visible=t<.45;
    for(let i=0;i<e.particles.length;i++){
      const p=e.particles[i],puff=i<14;
      obj.position.copy(p.velocity).multiplyScalar(t);obj.position.y+=(puff?1.6:-4.9)*t*t;
      obj.rotation.set(p.spin+t*(puff?.2:3),p.spin*2+t,p.spin+t*2);
      const size=puff?e.radius*(.065+t*.2):e.radius*(.012+(i%4)*.009);
      obj.scale.set(size,e.crash&&!puff?size*3:size,size);
      obj.updateMatrix();(puff?e.puffs:e.fragments).setMatrixAt(puff?i:i-14,obj.matrix);
    }
    e.puffs.instanceMatrix.needsUpdate=e.fragments.instanceMatrix.needsUpdate=true;
  }
  update(dt){
    for(let i=this.active.length-1;i>=0;i--){
      const e=this.active[i];e.age+=dt;
      if(e.age>=e.life){this.remove(e);this.active.splice(i,1)}else this.draw(e);
    }
  }
  remove(e){
    this.scene.remove(e.group);e.puffs.dispose();e.fragments.dispose();
    e.material.dispose();e.smokeMaterial.dispose();e.shardsMaterial.dispose();
  }
  clear(){for(const e of this.active)this.remove(e);this.active=[]}
}
