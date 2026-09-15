import * as THREE from 'three';

export const GODZILLA=Object.freeze({
  label:'Cyborg Godzilla',health:3200,radius:11,speed:0,range:300,
  damage:28,cooldown:2.8,windup:1.1,regeneration:12,respawn:90,
  falloffStart:90,falloffEnd:250,minimumDamage:.04,
  rockSpeed:92,wagonSpeed:84,wagonDamage:42,wagonWindup:1.5,wagonCooldown:3.8,
  gravity:24,bodyHeight:18,
});

// The northern rounded core is an actual 166 m roof in the Silberturm model.
export function godzillaSpawn(data){
  const roof=data.parts[1333665179],points=roof.points;
  return {type:'godzilla',position:[
    points.reduce((sum,p)=>sum+p[0],0)/points.length,roof.h+GODZILLA.bodyHeight+.4,
    points.reduce((sum,p)=>sum+p[1],0)/points.length,
  ],region:'Silberturm / Deutsche Bahn Tower'};
}

// Distance is travelled by the projectile, never measured from the player's
// current position. Moving closer after firing cannot strengthen a distant shot.
export function godzillaDamageScale(weapon,distance=0){
  if(weapon.id!==1&&weapon.id!==2)return 1;
  const t=THREE.MathUtils.clamp((distance-GODZILLA.falloffStart)/(GODZILLA.falloffEnd-GODZILLA.falloffStart),0,1);
  return 1-t*(1-GODZILLA.minimumDamage);
}

export const GODZILLA_VOLUMES=Object.freeze([
  {offset:[0,0,1],radius:11},
  {offset:[0,17,-8],radius:7},
  {offset:[0,16,-14],radius:5},
  {offset:[-8,-11,-4],radius:6},
  {offset:[8,-11,-4],radius:6},
  {offset:[0,-8,14],radius:5},
  {offset:[4,-9,23],radius:4},
  {offset:[8,-9,28],radius:3.5},
  {offset:[13,-9.4,32],radius:2.8},
  {offset:[18,-9.8,36],radius:2.2},
]);

export function godzillaMuzzle(enemy){
  return new THREE.Vector3(11,8,-12).applyQuaternion(enemy.orientation).add(enemy.position);
}

/** Fixed launch speed, low ballistic arc. Unreachable targets get no throw. */
export function ballisticVelocity(from,to,speed,gravity=GODZILLA.gravity){
  const delta=to.clone().sub(from),horizontal=Math.hypot(delta.x,delta.z);
  if(horizontal<.01)return null;
  const s2=speed*speed,discriminant=s2*s2-gravity*(gravity*horizontal*horizontal+2*delta.y*s2);
  if(discriminant<0)return null;
  const tangent=(s2-Math.sqrt(discriminant))/(gravity*horizontal);
  const flatSpeed=speed/Math.sqrt(1+tangent*tangent);
  return new THREE.Vector3(delta.x/horizontal*flatSpeed,flatSpeed*tangent,delta.z/horizontal*flatSpeed);
}
