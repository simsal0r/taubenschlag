import * as THREE from 'three';
import { raycastColliderHit } from './collision.js';
import { createPigeonRocket,animateRocketExhaust } from './pigeon-rocket.js';
import { createPoopBomb } from './poop-bomb.js';
import { segmentColliders } from './collider-index.js';

export const CANNON=Object.freeze({id:1,name:'Poop cannon',short:'CANNON',magazine:20,reload:2,interval:.17,speed:125,gravity:9.81,lifetime:7,damage:10,splashRadius:1.2,maxProjectiles:48,maxSplats:96});
export const ROCKET=Object.freeze({id:2,name:'Pigeon rocket',short:'ROCKET',magazine:8,reload:4,interval:.35,speed:48,maxSpeed:180,acceleration:180,gravity:0,lifetime:10,damage:80,splashRadius:6.5,explosive:true,splatScale:2.9});
export const BOMB=Object.freeze({id:3,name:'Poop bomb',short:'BOMB',magazine:4,reload:5,interval:.8,ejectionSpeed:6,gravity:9.81,lifetime:35,damage:200,splashRadius:16,explosive:true,splatScale:6.5});
export const WEAPONS=Object.freeze({1:CANNON,2:ROCKET,3:BOMB});
export const WEAPON_SLOTS=Object.freeze(Object.values(WEAPONS).map(w=>w.id));
const freshMagazines=()=>Object.fromEntries(Object.values(WEAPONS).map(w=>[w.id,{rounds:w.magazine,reload:0}]));
const freshCounters=()=>Object.fromEntries(WEAPON_SLOTS.map(id=>[id,0]));
const direction=new THREE.Vector3(),end=new THREE.Vector3(),segment=new THREE.Vector3();
const up=new THREE.Vector3(0,0,1),normal=new THREE.Vector3(),origin=new THREE.Vector3();
const flightRotation=new THREE.Quaternion();

export function traceProjectile(start,finish,colliders){
  const delta=finish.clone().sub(start),length=delta.length();if(length<1e-8)return null;
  delta.multiplyScalar(1/length);
  let hit=null,nearest=length;
  for(const b of segmentColliders(colliders,start,finish)){
    if(b.min.x>Math.max(start.x,finish.x)||b.max.x<Math.min(start.x,finish.x)||
      b.min.y>Math.max(start.y,finish.y)||b.max.y<Math.min(start.y,finish.y)||
      b.min.z>Math.max(start.z,finish.z)||b.max.z<Math.min(start.z,finish.z))continue;
    const contact=raycastColliderHit(start,delta,b,nearest);
    if(contact){nearest=contact.distance;hit={...contact,tag:b.tag,collider:b}}
  }
  if(delta.y<0){
    const distance=(.15-start.y)/delta.y;
    if(distance>=0&&distance<nearest){nearest=distance;hit={distance,normal:{x:0,y:1,z:0}}}
  }
  return hit?{point:start.clone().addScaledVector(delta,nearest),normal:new THREE.Vector3(hit.normal.x,hit.normal.y,hit.normal.z),tag:hit.tag,collider:hit.collider}:null;
}

export class PoopCannon {
  constructor(scene,colliders,onHit){
    this.scene=scene;this.colliders=colliders;this.onHit=onHit;
    this.projectiles=[];this.splats=[];this.cooldowns=freshCounters();this.magazines=freshMagazines();this.selected=1;this.shots=0;this.hits=0;this.damage=0;
    this.surfaceDamage=new Map();this.shotsByWeapon=freshCounters();this.rocketTemplate=createPigeonRocket();this.bombTemplate=createPoopBomb();
    this.geometry=new THREE.IcosahedronGeometry(1,1);
    this.brown=new THREE.MeshStandardMaterial({color:'#8e7250',roughness:1});
    this.white=new THREE.MeshStandardMaterial({color:'#f2eace',roughness:.9});
    const shape=new THREE.Shape();
    for(let i=0;i<40;i++){const a=i/40*Math.PI*2,r=i%2?.62+.13*Math.sin(i*2):1+.12*Math.cos(i*3);i?shape.lineTo(Math.cos(a)*r,Math.sin(a)*r):shape.moveTo(r,0)}
    shape.closePath();this.splashGeometry=new THREE.ShapeGeometry(shape);
  }
  get weapon(){return WEAPONS[this.selected]}
  trace(start,end){
    const world=traceProjectile(start,end,this.colliders),actor=this.actors?.trace(start,end);
    return actor&&(!world||start.distanceTo(actor.point)<start.distanceTo(world.point))?actor:world;
  }
  get cooldown(){return this.cooldowns[this.selected]}
  get ammo(){return this.magazines[this.selected].rounds}
  get reloadRemaining(){return this.magazines[this.selected].reload}
  select(slot){if(!WEAPONS[slot])return false;this.selected=Number(slot);return true}
  reload(){
    const magazine=this.magazines[this.selected];
    if(magazine.reload>0||magazine.rounds===this.weapon.magazine)return false;
    magazine.reload=this.weapon.reload;
    return true;
  }
  muzzle(state,target=origin){
    if(this.selected===3)target.set(0,-3.1,.45);
    else target.set(0,-.92,this.selected===2?-4.6:-3.3);
    return target.applyQuaternion(state.orientation).add(state.position);
  }
  fire(state){
    if(this.cooldown>0||this.reloadRemaining>0||this.ammo===0||state.crashed)return false;
    const weapon=this.weapon;
    this.cooldowns[this.selected]=weapon.interval;this.shots++;this.shotsByWeapon[this.selected]++;
    const magazine=this.magazines[this.selected];magazine.rounds--;
    if(magazine.rounds===0)magazine.reload=weapon.reload;
    const shot=this.selected===3?this.bombTemplate.clone(true):this.selected===2?this.rocketTemplate.clone(true):new THREE.Group();
    if(this.selected===1){
      const body=new THREE.Mesh(this.geometry,this.brown),cap=new THREE.Mesh(this.geometry,this.white);
      body.scale.set(.28,.21,.4);cap.scale.set(.18,.13,.21);cap.position.set(.035,.17,.08);shot.add(body,cap);
    }
    this.muzzle(state,shot.position);
    // Neither the nose launcher nor the bomb bay may spawn through a surface.
    const blocked=this.trace(state.position,shot.position);
    if(blocked){this.impact(blocked,weapon,state.position.distanceTo(blocked.point));return true}
    this.scene.add(shot);
    direction.set(0,0,-1).applyQuaternion(state.orientation);
    // Rocket motor thrust follows the launch axis, without sideways drift or drop.
    // Forward launch momentum prevents a fast aircraft overtaking its own rocket.
    let velocity;
    if(weapon.id===3){
      // Release underneath the airframe, carrying its momentum. There is no
      // forward motor: gravity bends the trajectory toward the ground.
      velocity=new THREE.Vector3(0,-weapon.ejectionSpeed,0).applyQuaternion(state.orientation).add(state.velocity);
    }else if(weapon.id===2){
      velocity=direction.clone().multiplyScalar(Math.min(weapon.maxSpeed,weapon.speed+Math.max(0,state.velocity.dot(direction))));
    }else velocity=state.velocity.clone().addScaledVector(direction,weapon.speed);
    shot.quaternion.copy(state.orientation);this.projectiles.push({mesh:shot,velocity,heading:direction.clone(),age:0,distance:0,weapon,exhaust:shot.getObjectByName('rocket-exhaust')});
    if(this.projectiles.length>CANNON.maxProjectiles)this.scene.remove(this.projectiles.shift().mesh);
    return true;
  }
  splash(hit,scale=1){
    const group=new THREE.Group(),cream=new THREE.MeshBasicMaterial({color:'#f3ecd5',side:THREE.DoubleSide,transparent:true,opacity:.92,depthWrite:false});
    const brown=cream.clone();brown.color.set('#9b8460');
    const outer=new THREE.Mesh(this.splashGeometry,cream),inner=new THREE.Mesh(this.splashGeometry,brown);
    inner.scale.setScalar(.48);inner.rotation.z=.7;inner.position.z=.008;group.add(outer,inner);
    // Procedural glazing and roof trim extend slightly beyond their structural colliders.
    const raisedRoof=hit.normal.y>.5&&(hit.tag==='building'||hit.tag==='tower');
    const offset=raisedRoof ? .35 : hit.tag ? .15 : .035;
    group.position.copy(hit.point).addScaledVector(hit.normal,offset);group.quaternion.setFromUnitVectors(up,hit.normal);
    group.rotateZ(this.splats.length*2.4);group.scale.setScalar(scale*(.85+(this.hits%5)*.12));
    this.scene.add(group);this.splats.push({mesh:group,age:0});
    if(this.splats.length>CANNON.maxSplats)this.removeSplat(this.splats.shift());
  }
  impact(hit,weapon,distance=0){
    this.hits++;
    if(!hit.enemy)this.splash(hit,weapon.splatScale||1);
    const damage=new Map(hit.enemy?[]:[[hit.collider||null,weapon.damage]]);
    if(weapon.explosive){
      const tangent=new THREE.Vector3().crossVectors(hit.normal,Math.abs(hit.normal.y)>.9?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0)).normalize();
      const bitangent=new THREE.Vector3().crossVectors(hit.normal,tangent);
      const from=hit.point.clone().addScaledVector(hit.normal,.65);
      for(let i=0;i<14;i++){
        const a=i*2.399,r=weapon.splashRadius*(.35+.58*Math.sqrt((i+1)/14));
        const to=hit.point.clone().addScaledVector(tangent,Math.cos(a)*r).addScaledVector(bitangent,Math.sin(a)*r).addScaledVector(hit.normal,-.04);
        const contact=traceProjectile(from,to,this.colliders);if(!contact)continue;
        const falloff=Math.max(0,1-contact.point.distanceTo(hit.point)/weapon.splashRadius);if(falloff<=0)continue;
        this.splash(contact,(.5+falloff*1.3)*(weapon.splatScale/ROCKET.splatScale));
        const key=contact.collider||null;damage.set(key,Math.max(damage.get(key)||0,Math.round(weapon.damage*falloff)));
      }
    }
    let applied=this.actors?.impact(hit,weapon,distance)||0;
    for(const [surface,amount]of damage){this.surfaceDamage.set(surface,(this.surfaceDamage.get(surface)||0)+amount);applied+=amount}
    this.damage+=applied;this.onHit?.(hit,weapon,applied);
  }
  removeSplat(splat){this.scene.remove(splat.mesh);splat.mesh.children.forEach(m=>m.material.dispose())}
  update(dt){
    for(const id of WEAPON_SLOTS){
      this.cooldowns[id]=Math.max(0,this.cooldowns[id]-dt);
      const magazine=this.magazines[id];
      if(magazine.reload>0){
        magazine.reload=Math.max(0,magazine.reload-dt);
        if(magazine.reload<1e-8){magazine.reload=0;magazine.rounds=WEAPONS[id].magazine}
      }
    }
    for(let i=this.projectiles.length-1;i>=0;i--){
      const p=this.projectiles[i];p.age+=dt;
      if(p.weapon.id===2){
        const speed=p.velocity.length(),a=p.weapon.acceleration;
        const burnTime=Math.min(dt,Math.max(0,(p.weapon.maxSpeed-speed)/a));
        // Integrate the acceleration and cruise portions exactly across the speed cap.
        const travel=speed*dt+a*burnTime*(dt-burnTime*.5);
        end.copy(p.mesh.position).addScaledVector(p.heading,travel);
        p.velocity.copy(p.heading).multiplyScalar(Math.min(p.weapon.maxSpeed,speed+a*dt));
      }else{
        end.copy(p.mesh.position).addScaledVector(p.velocity,dt);end.y-=.5*p.weapon.gravity*dt*dt;
        p.velocity.y-=p.weapon.gravity*dt;
      }
      const hit=this.trace(p.mesh.position,end);
      if(hit||p.age>p.weapon.lifetime||Math.abs(end.x)>1100||Math.abs(end.z)>1100){
        if(hit)this.impact(hit,p.weapon,p.distance+p.mesh.position.distanceTo(hit.point));this.scene.remove(p.mesh);this.projectiles.splice(i,1);
      }else{
        p.distance+=p.mesh.position.distanceTo(end);
        p.mesh.position.copy(end);
        if(p.velocity.lengthSq()>1e-8){
          segment.copy(p.velocity).normalize();flightRotation.setFromUnitVectors(normal.set(0,0,-1),segment);
          if(p.weapon.id===3)p.mesh.quaternion.slerp(flightRotation,1-Math.exp(-dt*5));
          else p.mesh.quaternion.copy(flightRotation);
        }
        if(p.exhaust)animateRocketExhaust(p.exhaust,p.age,(p.velocity.length()-ROCKET.speed)/(ROCKET.maxSpeed-ROCKET.speed));
      }
    }
    for(let i=this.splats.length-1;i>=0;i--){
      const s=this.splats[i];s.age+=dt;
      if(s.age>40){this.removeSplat(s);this.splats.splice(i,1)}
      else for(const mesh of s.mesh.children)mesh.material.opacity=.92*Math.min(1,(40-s.age)/5);
    }
  }
  clear(){
    for(const p of this.projectiles)this.scene.remove(p.mesh);
    for(const s of this.splats)this.removeSplat(s);
    this.projectiles=[];this.splats=[];this.cooldowns=freshCounters();this.magazines=freshMagazines();this.selected=1;this.shots=0;this.hits=0;this.damage=0;this.surfaceDamage.clear();this.shotsByWeapon=freshCounters();
  }
}
