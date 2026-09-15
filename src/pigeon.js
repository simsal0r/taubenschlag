import * as THREE from 'three';
import { createWingJets } from './wing-jets.js';
import { mergeRigidMeshes } from './geometry.js';

export function createPigeon(scale=1) {
  const bird=new THREE.Group();
  const bodyMat=new THREE.MeshStandardMaterial({color:'#aab5bd',roughness:.92});
  const wingMat=new THREE.MeshStandardMaterial({color:'#7c8e9e',roughness:.9});
  const darkMat=new THREE.MeshStandardMaterial({color:'#465565',roughness:.85});
  const neckMat=new THREE.MeshStandardMaterial({color:'#6c9995',metalness:.22,roughness:.48});
  const purpleMat=new THREE.MeshStandardMaterial({color:'#8c819e',metalness:.2,roughness:.5});
  const eyeMat=new THREE.MeshStandardMaterial({color:'#253133',roughness:.22});
  const eyeRing=new THREE.MeshStandardMaterial({color:'#e3b977'});
  const beakMat=new THREE.MeshStandardMaterial({color:'#d1b185'});
  const footMat=new THREE.MeshStandardMaterial({color:'#c88983'});
  function ellipsoid(parent,x,y,z,sx,sy,sz,mat,detail=2){
    const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(1,detail),mat);
    mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;parent.add(mesh);return mesh;
  }
  // Local -Z is forward; a broad fan tail and double wing bars read as a pigeon.
  ellipsoid(bird,0,0,.03,.27,.29,.42,bodyMat);
  ellipsoid(bird,0,.17,-.25,.195,.28,.22,neckMat);
  ellipsoid(bird,0,.19,-.105,.205,.15,.16,purpleMat);
  const head=new THREE.Group();head.position.set(0,.39,-.32);bird.add(head);
  ellipsoid(head,0,0,0,.205,.205,.215,wingMat);
  ellipsoid(head,0,-.08,-.21,.08,.05,.12,beakMat,1);
  ellipsoid(head,0,-.028,-.178,.07,.035,.075,bodyMat,1);
  for(const side of [-1,1]){
    ellipsoid(head,side*.174,.025,-.078,.034,.04,.04,eyeRing);
    ellipsoid(head,side*.197,.027,-.08,.02,.027,.028,eyeMat);
    ellipsoid(head,side*.209,.038,-.091,.006,.009,.008,new THREE.MeshBasicMaterial({color:'#ffffff'}),1);
  }
  const wings=[];
  for(const side of [-1,1]){
    const wing=new THREE.Group();wing.position.set(side*.21,.06,.03);bird.add(wing);
    ellipsoid(wing,side*.21,0,.07,.37,.09,.28,wingMat,1);
    for(let i=0;i<6;i++){
      const feather=ellipsoid(wing,side*(.37+i*.066),-.02,.14+i*.032,.1,.045,.24-i*.012,i<2?bodyMat:darkMat,1);
      feather.rotation.y=side*-.22;
    }
    for(let i=0;i<2;i++){
      const bar=ellipsoid(wing,side*(.24+i*.12),.077,.08,.042,.016,.24,darkMat,1);
      bar.rotation.y=side*-.18;
    }
    wings.push(wing);
  }
  for(let i=0;i<5;i++){
    const tail=ellipsoid(bird,(i-2)*.063,-.08,.44,.063,.042,.24,i%2?wingMat:darkMat,1);
    tail.rotation.y=(i-2)*.13;
  }
  const feet=new THREE.Group();bird.add(feet);
  for(const side of [-1,1]){
    ellipsoid(feet,side*.115,-.285,.04,.027,.12,.028,footMat,1);
    for(let i=-1;i<=1;i++)ellipsoid(feet,side*.115+i*.036,-.382,-.012,.017,.019,.078,footMat,1);
  }
  const jets=createWingJets(wings);
  for(const group of [bird,head,feet,...wings])mergeRigidMeshes(group);
  bird.userData.jets=jets;
  bird.scale.setScalar(scale);
  bird.userData.animate=(time,speed,climbing,perched,flapAge=null,dt=1/60)=>{
    let beat;
    if(perched)beat=.25;
    else if(flapAge===null)beat=Math.sin(time*(climbing?17:speed>18?7.5:11))*(speed>18?.12:.57);
    else if(flapAge<.42){
      const t=flapAge/.42;
      beat=t<.2?-.85*(t/.2):t<.6?-.85+1.65*((t-.2)/.4):.8-.85*((t-.6)/.4);
    }else beat=-.05+Math.sin(time*2.1)*.016;
    wings[0].rotation.z=beat;wings[1].rotation.z=-beat;
    wings[0].rotation.y=perched?1.18:0;wings[1].rotation.y=perched?-1.18:0;
    head.rotation.x=Math.sin(time*2.3)*.04;
    feet.visible=perched||speed<2;
    bird.position.y=perched?0:Math.sin(time*4)*.023;
    jets.update(time,speed,perched,dt);
  };
  return bird;
}
