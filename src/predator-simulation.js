import * as THREE from 'three';
import { moveWithCollisions } from './collision.js';
import { traceProjectile } from './poop-cannon.js';
import { advanceCatPatrol, resetCatPatrol } from './predator-navigation.js';
import { nearbyColliders } from './collider-index.js';
import { GODZILLA, GODZILLA_VOLUMES, godzillaDamageScale, godzillaMuzzle, ballisticVelocity } from './godzilla.js';

export const PREDATORS=Object.freeze({
  hawk:{label:'Hawk',health:90,radius:3.4,speed:25,range:28,damage:18,cooldown:2.4},
  raccoon:{label:'Raccoon',health:130,radius:3.8,speed:7,range:180,damage:12,cooldown:3.2},
  cat:{label:'Climber cat',health:200,radius:4.2,speed:8,range:330,damage:24,cooldown:3.5},
  godzilla:GODZILLA,
  // Nest eagles hunt as a flock that stretches like chewing gum: their pace
  // follows the pilot's recent average speed with a short lag, never below a
  // 200 km/h baseline and never above `speed`. Bursts open a gap for a shot;
  // slowing down to aim lets the flock close again.
  // `weaponBonus` scales incoming damage per weapon id: the poop cannon (1)
  // is the practical tool against the flock, so ten rounds bring a bird down.
  // A flare burst dazzles hunting eagles: their pace drops to `flareSlow` for
  // `flareDaze` seconds, buying room to line up the next shot.
  eagle:{label:'Nest eagle',health:160,radius:3.8,speed:132,baseline:200/3.6,match:1,lag:2.4,range:12,damage:20,cooldown:2.6,patrolSpeed:30,returnSpeed:48,weaponBonus:{1:1.6},flareDaze:2,flareSlow:.4},
});
/** Individual flight characters so a hunting flock never shares one path or pace. */
export const EAGLE_TRAITS=Object.freeze([
  {speed:1,lead:.55,side:1,height:22,weave:1.3,agility:2.6,pass:1.1,rest:9,orbit:52,orbitHeight:18,spin:1},
  {speed:.9,lead:.8,side:-1,height:-8,weave:.9,agility:2.2,pass:1.5,rest:14,orbit:68,orbitHeight:34,spin:-1},
  {speed:1.05,lead:.35,side:1,height:6,weave:1.7,agility:3,pass:.9,rest:6,orbit:44,orbitHeight:10,spin:-1},
  {speed:.85,lead:.7,side:-1,height:30,weave:.7,agility:2,pass:1.6,rest:11,orbit:80,orbitHeight:26,spin:1},
  {speed:.95,lead:.5,side:-1,height:-14,weave:1.1,agility:2.4,pass:1.3,rest:17,orbit:60,orbitHeight:42,spin:1},
].map(Object.freeze));
const clamp=THREE.MathUtils.clamp;
const delta=new THREE.Vector3(),velocity=new THREE.Vector3(),normal=new THREE.Vector3();
// Per-frame scratch: the update loop runs for every enemy every frame.
const before=new THREE.Vector3(),wanted=new THREE.Vector3(),heading=new THREE.Quaternion(),forwardAxis=new THREE.Vector3(0,0,-1),upAxis=new THREE.Vector3(0,1,0),rockEnd=new THREE.Vector3();
const side=new THREE.Vector3(),lookMatrix=new THREE.Matrix4(),roll=new THREE.Quaternion(),zero=new THREE.Vector3(),previousForward=new THREE.Vector3();

/** Swept finite segment: fast player rockets / thrown rocks cannot tunnel through actors. */
export function segmentSphere(start,end,center,radius){
  const d=end.clone().sub(start),offset=start.clone().sub(center),length=d.length();
  if(offset.lengthSq()<=radius*radius)return 0;
  if(length<1e-8)return null;
  d.divideScalar(length);
  const b=offset.dot(d),c=offset.lengthSq()-radius*radius,disc=b*b-c;
  if(disc<0)return null;
  const t=-b-Math.sqrt(disc);return t>=0&&t<=length?t:null;
}

const freshFlight=()=>({stage:'perch',timer:0,launch:0,velocity:new THREE.Vector3(),bank:0});

export class PredatorSimulation {
  constructor({colliders=[],spawns=[],onPlayerHit=()=>{},onEvent=()=>{}}={}){
    this.colliders=colliders;this.onPlayerHit=onPlayerHit;this.onEvent=onEvent;
    this.time=0;this.rocks=[];this.serial=0;this.attacks=0;this.defeated=0;this.alerts=0;this.playerSpeed=0;this.dazzled=0;this.flareBursts=0;
    let eagles=0;
    this.enemies=spawns.map((s,i)=>({
      ...s,id:`${s.type}-${i+1}`,home:new THREE.Vector3(...s.position),position:new THREE.Vector3(...s.position),
      orientation:new THREE.Quaternion(),health:PREDATORS[s.type].health,maxHealth:PREDATORS[s.type].health,
      phase:i*1.79,hostile:false,cooldown:1,windup:0,respawnIn:0,flash:0,speed:0,travel:0,pathIndex:0,
      throws:0,throwKind:'rock',throwRecovery:0,
      nest:s.nest||null,traits:s.type==='eagle'?(s.traits||EAGLE_TRAITS[eagles++%EAGLE_TRAITS.length]):null,
      flight:s.type==='eagle'?freshFlight():null,
      wingFold:s.type==='eagle'?1:0,wingAmplitude:s.type==='eagle'?.03:0,wingPhase:i*.9,
    }));
    for(const e of this.enemies)if(e.type==='cat'&&e.wall)resetCatPatrol(e);
    for(const e of this.enemies)if(e.type==='eagle')this.perchOrientation(e);
  }
  reset(){
    this.rocks.length=0;this.attacks=0;this.defeated=0;this.alerts=0;this.time=0;this.serial=0;this.playerSpeed=0;this.dazzled=0;this.flareBursts=0;
    for(const e of this.enemies){
      e.position.copy(e.home);e.health=e.maxHealth;e.hostile=false;e.cooldown=1;e.windup=0;e.respawnIn=0;e.flash=0;e.travel=0;e.pathIndex=0;
      e.orientation.identity();e.speed=0;
      e.throws=0;e.throwKind='rock';e.throwRecovery=0;
      if(e.type==='cat'&&e.wall)resetCatPatrol(e);
      if(e.type==='eagle'){e.flight=freshFlight();this.perchOrientation(e);e.wingFold=1;e.wingAmplitude=.03}
    }
  }
  /** Perched eagles face outward from the nest, wings folded. */
  perchOrientation(e){
    const nest=this.nestCenter(e);
    delta.set(e.home.x-nest.x,0,e.home.z-nest.z);
    if(delta.lengthSq()<1e-6)delta.set(0,0,-1);
    e.orientation.setFromAxisAngle(upAxis,Math.atan2(-delta.x,-delta.z));
  }
  nestCenter(e){
    if(e.nestCenter)return e.nestCenter;
    const flock=this.enemies.filter(o=>o.nest===e.nest);
    const center=new THREE.Vector3();for(const o of flock)center.add(o.home);center.divideScalar(flock.length||1);
    for(const o of flock)o.nestCenter=center;
    return center;
  }
  /** A flare burst: hunting eagles lose most of their pace for a couple of seconds. */
  flare(duration=PREDATORS.eagle.flareDaze){
    this.flareBursts++;this.dazzled=Math.max(this.dazzled,duration);
  }
  ceasefire(){
    this.rocks.length=0;this.dazzled=0;
    for(const e of this.enemies){e.hostile=false;e.windup=0;e.cooldown=1;e.throwRecovery=0}
  }
  visible(from,to){
    const hit=traceProjectile(from,to,this.colliders);
    return !hit||hit.point.distanceTo(from)>=from.distanceTo(to)-.3;
  }
  volumes(e){
    if(e.type==='godzilla')return GODZILLA_VOLUMES.map(v=>({
      center:new THREE.Vector3(...v.offset).applyQuaternion(e.orientation).add(e.position),radius:v.radius,
    }));
    const r=PREDATORS[e.type].radius,result=[{center:e.position,radius:r}],flyer=e.type==='hawk'||e.type==='eagle';
    const offsets=flyer?[[e.type==='eagle'?-7:-6,0,0],[e.type==='eagle'?7:6,0,0]]:[[0,.6,-3],[0,0,2.4]];
    for(const v of offsets)result.push({center:new THREE.Vector3(...v).applyQuaternion(e.orientation).add(e.position),radius:flyer?2.2:2.4});
    return result;
  }
  trace(start,end){
    let nearest=Infinity,hit=null;
    for(const e of this.enemies){
      if(e.health<=0)continue;
      for(const v of this.volumes(e)){
        const d=segmentSphere(start,end,v.center,v.radius);
        if(d===null||d>=nearest)continue;
        nearest=d;const point=start.clone().addScaledVector(end.clone().sub(start).normalize(),d);
        const n=point.clone().sub(v.center).normalize();if(n.lengthSq()<.1)n.set(0,1,0);
        hit={point,normal:n,enemy:e,tag:PREDATORS[e.type].label};
      }
    }
    return hit;
  }
  damage(e,amount){
    if(!e||e.health<=0||amount<=0)return 0;
    const applied=Math.min(e.health,amount),first=!e.hostile;
    e.health-=applied;e.hostile=true;e.flash=.22;
    this.onEvent('hit',e);
    if(first){e.cooldown=Math.max(e.cooldown,1.25);this.onEvent('provoked',e)}
    if(first&&e.nest)this.alertNest(e);
    if(e.health===0){
      e.respawnIn=PREDATORS[e.type].respawn||24;e.windup=0;this.defeated++;this.onEvent('defeated',e);
      this.rocks=this.rocks.filter(r=>r.owner!==e.id);
    }
    return applied;
  }
  /** One hit on a nest sends the whole flock hunting, launching in a staggered wave. */
  alertNest(e){
    let launched=0,alerted=false;
    for(const other of this.enemies){
      if(other.nest!==e.nest||other===e||other.health<=0||other.hostile)continue;
      other.hostile=true;other.cooldown=Math.max(other.cooldown,1.2+launched*.6);launched++;alerted=true;
      // The flock leaves the nest one after another rather than as one blob.
      if(other.flight)other.flight.launch=.5+launched*.9;
    }
    if(alerted||e.flight){this.alerts++;this.onEvent('nest',e)}
  }
  /** Weapon damage against a given animal, including species-specific bonuses. */
  weaponDamage(e,weapon){
    return Math.round(weapon.damage*(PREDATORS[e.type].weaponBonus?.[weapon.id]??1));
  }
  impact(hit,weapon,distance=0){
    let applied=0;
    const damage=e=>this.weaponDamage(e,weapon)*(e.type==='godzilla'?godzillaDamageScale(weapon,distance):1);
    // Direct hit is applied once. Blast falloff uses the nearest body surface.
    if(hit.enemy)applied+=this.damage(hit.enemy,damage(hit.enemy));
    if(weapon.explosive){
      const from=hit.point.clone().addScaledVector(hit.normal,.3);
      for(const e of this.enemies){
        if(e===hit.enemy||e.health<=0)continue;
        const volumes=e.type==='godzilla'?this.volumes(e):[{center:e.position,radius:PREDATORS[e.type].radius}];
        let splash=0;
        for(const v of volumes){
          const gap=Math.max(0,v.center.distanceTo(hit.point)-v.radius);
          if(gap>=weapon.splashRadius)continue;
          if(this.visible(from,v.center))splash=Math.max(splash,damage(e)*(1-gap/weapon.splashRadius));
        }
        applied+=this.damage(e,e.type==='godzilla'?splash:Math.round(splash));
      }
    }
    return applied;
  }
  throwRock(e,target){
    const p=PREDATORS[e.type],from=e.position.clone();
    from.y+=e.type==='cat'?4:2;
    if(e.wall){from.x+=e.wall.normal[0]*3;from.z+=e.wall.normal[1]*3}
    const aim=target.position.clone().addScaledVector(target.velocity||new THREE.Vector3(),.35);
    const flight=clamp(from.distanceTo(aim)/65,.65,3.8),v=aim.sub(from).divideScalar(flight);
    v.y+=.5*18*flight;
    this.rocks.push({id:++this.serial,position:from,velocity:v,age:0,damage:p.damage,radius:e.type==='cat'?1.25:.85,owner:e.id});
    if(this.rocks.length>18)this.rocks.shift();
    this.attacks++;this.onEvent('throw',e);
  }
  throwDebris(e,target){
    const wagon=e.throwKind==='wagon',speed=wagon?GODZILLA.wagonSpeed:GODZILLA.rockSpeed;
    const from=godzillaMuzzle(e),aim=target.position.clone();
    aim.addScaledVector(target.velocity||velocity.set(0,0,0),Math.min(.7,from.distanceTo(aim)/speed));
    if(aim.distanceTo(e.position)>GODZILLA.range||!this.visible(from,aim))return false;
    const launch=ballisticVelocity(from,aim,speed);
    if(!launch)return false;
    this.rocks.push({
      id:++this.serial,kind:e.throwKind,position:from,velocity:launch,age:0,
      damage:wagon?GODZILLA.wagonDamage:GODZILLA.damage,radius:wagon?3.5:2.2,
      owner:e.id,origin:e.position.clone(),maxRange:GODZILLA.range,gravity:GODZILLA.gravity,
    });
    if(this.rocks.length>18)this.rocks.shift();
    e.throws++;e.throwRecovery=.45;this.attacks++;this.onEvent('throw',e);
    return true;
  }
  update(dt,target){
    if(dt<=0)return;
    this.time+=dt;
    const active=target?.active===true,player=target?.position;
    // Recent average aircraft speed; the lag is what lets a burst open a gap.
    if(target?.velocity)this.playerSpeed=THREE.MathUtils.damp(this.playerSpeed,target.velocity.length(),1/PREDATORS.eagle.lag,dt);
    this.dazzled=Math.max(0,this.dazzled-dt);
    for(const e of this.enemies){
      e.flash=Math.max(0,e.flash-dt);
      e.throwRecovery=Math.max(0,e.throwRecovery-dt);
      if(e.health<=0){
        e.respawnIn=Math.max(0,e.respawnIn-dt);
        if(e.respawnIn===0){e.health=e.maxHealth;e.hostile=false;e.position.copy(e.home);e.cooldown=2;e.travel=0;e.pathIndex=0;e.throws=0;e.throwKind='rock';if(e.type==='cat'&&e.wall)resetCatPatrol(e);if(e.type==='eagle'){e.flight=freshFlight();this.perchOrientation(e)}this.onEvent('respawn',e)}
        continue;
      }
      const p=PREDATORS[e.type],ang=this.time*.13+e.phase;before.copy(e.position);
      const hostile=e.hostile&&active,range=player?e.position.distanceTo(player):Infinity;
      if(e.type==='godzilla'){
        e.health=Math.min(e.maxHealth,e.health+p.regeneration*dt);
        if(hostile){
          delta.copy(player).sub(e.position);delta.y=0;
          if(delta.lengthSq()>.1)e.orientation.slerp(heading.setFromAxisAngle(upAxis,Math.atan2(-delta.x,-delta.z)),1-Math.exp(-dt*1.8));
        }
      }else if(e.type==='cat'){
        advanceCatPatrol(e,dt);
      }else if(e.type==='eagle'){
        this.updateEagle(e,dt,hostile,target,range);
      }else if(e.type==='hawk'){
        wanted.set(e.home.x+Math.cos(ang)*48,e.home.y+Math.sin(ang*1.6)*15,e.home.z+Math.sin(ang)*48);
        if(hostile&&range<500){wanted.copy(player);wanted.y+=e.cooldown>1?17:0}
        delta.copy(wanted).sub(e.position);const distance=delta.length();
        velocity.copy(delta).normalize().multiplyScalar(Math.min(p.speed*(hostile?1.5:1),distance/Math.max(dt,.001)));
        // Sphere collision keeps swoops outside façades; lift to clear an obstruction.
        const near=nearbyColliders(this.colliders,e.position.x,e.position.y,e.position.z,14,Infinity);
        const contact=moveWithCollisions(e.position,velocity,dt,near,3.4,410);
        if(contact.hit)e.position.y=Math.min(400,e.position.y+dt*14);
        if(velocity.lengthSq()>1)e.orientation.slerp(heading.setFromUnitVectors(forwardAxis,velocity.normalize()),1-Math.exp(-dt*5));
      }else{
        wanted.set(e.home.x+Math.cos(ang)*23,e.home.y,e.home.z+Math.sin(ang)*18);
        if(e.route){
          wanted.set(...e.route[e.pathIndex]);
          if(Math.hypot(wanted.x-e.position.x,wanted.z-e.position.z)<1.1)e.pathIndex=(e.pathIndex+1)%e.route.length;
        }else if(hostile&&range<160){wanted.x=player.x;wanted.z=player.z}
        delta.copy(wanted).sub(e.position);delta.y=0;
        velocity.copy(delta).normalize().multiplyScalar(p.speed*(hostile?1.4:.65));velocity.y=-18;
        const near=nearbyColliders(this.colliders,e.position.x,e.position.y,e.position.z,12,Infinity);
        moveWithCollisions(e.position,velocity,dt,near,3.4,410);
        if(delta.lengthSq()>.1)e.orientation.slerp(heading.setFromAxisAngle(upAxis,Math.atan2(-delta.x,-delta.z)),1-Math.exp(-dt*5));
      }
      e.speed=e.position.distanceTo(before)/dt;
      e.travel+=e.position.distanceTo(before);
      e.cooldown=Math.max(0,e.cooldown-dt);
      if(!hostile){e.windup=0;continue}
      if(e.type==='eagle')continue; // Strikes are part of the eagle's attack pass.
      if(e.type==='hawk'){
        if(range<8&&e.cooldown===0&&this.visible(e.position,player)){
          this.onPlayerHit(p.damage);e.cooldown=p.cooldown;this.attacks++;this.onEvent('strike',e);
        }
      }else if(e.windup>0){
        e.windup=Math.max(0,e.windup-dt);
        if(e.windup===0){
          // Recheck line of sight after the visible throwing windup.
          if(range<p.range&&this.visible(e.position,player)){
            if(e.type==='godzilla')this.throwDebris(e,target);else this.throwRock(e,target);
          }
          e.cooldown=e.type==='godzilla'&&e.throwKind==='wagon'?p.wagonCooldown:p.cooldown;
        }
      }else if(range<p.range&&e.cooldown===0&&this.visible(e.position,player)){
        if(e.type==='godzilla'){
          e.throwKind=e.throws%3===2?'wagon':'rock';
          e.windup=e.throwKind==='wagon'?p.wagonWindup:p.windup;
        }else e.windup=.65;
      }
    }
    for(let i=this.rocks.length-1;i>=0;i--){
      // A lethal hit can synchronously clear every projectile via ceasefire.
      const r=this.rocks[i];if(!r)continue;
      const gravity=r.gravity||18,to=rockEnd.copy(r.position).addScaledVector(r.velocity,dt);to.y-=.5*gravity*dt*dt;
      // A rooftop throw has a hard reach even when launched downhill. Never
      // let the large wagon's collision sphere reach a player outside it.
      if(r.origin&&to.distanceTo(r.origin)>r.maxRange){this.rocks.splice(i,1);continue}
      const wall=traceProjectile(r.position,to,this.colliders);
      const inRange=!r.origin||player?.distanceTo(r.origin)<=r.maxRange;
      const distance=active&&inRange?segmentSphere(r.position,to,player,r.radius+3):null;
      const playerHit=distance!==null&&(!wall||distance<r.position.distanceTo(wall.point));
      if(playerHit)this.onPlayerHit(r.damage);
      if(wall||playerHit||r.age>7||Math.abs(to.x)>1050||Math.abs(to.z)>1050){this.rocks.splice(i,1);continue}
      r.position.copy(to);r.velocity.y-=gravity*dt;r.age+=dt;
    }
  }
  /** Flock cruise speed: tracks the pilot's average pace between the baseline and the cap. */
  huntSpeed(){
    const p=PREDATORS.eagle;
    return clamp(this.playerSpeed*p.match,p.baseline,p.speed);
  }
  /**
   * Nest eagle flight. Neutral birds perch on the crown, take individual orbit
   * patrols and return. Hunting birds run approach → strike/overshoot → climb-out
   * passes, each with its own lead, flank, altitude, weave and pace, so the
   * flock arrives spread out and can be engaged one at a time.
   */
  updateEagle(e,dt,hostile,target,range){
    const p=PREDATORS.eagle,t=e.traits,f=e.flight,player=target?.position,nest=this.nestCenter(e);
    const attacking=s=>s==='approach'||s==='pass'||s==='climb';
    if(hostile&&!attacking(f.stage)){
      if(f.launch>0){f.launch-=dt;hostile=false}
      else{f.stage='approach';f.timer=0}
    }else if(!hostile&&attacking(f.stage)){f.stage='return';f.timer=0}
    if(!e.hostile)f.launch=0;
    let speed=0,agility=t.agility,flapping=false,fold=0;
    f.timer+=dt;
    if(f.stage==='perch'){
      e.position.copy(e.home);f.velocity.set(0,0,0);fold=1;
      this.perchOrientation(e);
      e.orientation.multiply(roll.setFromAxisAngle(upAxis,Math.sin(this.time*.7+e.phase)*.12));
      e.wingAmplitude=THREE.MathUtils.damp(e.wingAmplitude,.03,4,dt);e.wingFold=THREE.MathUtils.damp(e.wingFold,1,4,dt);
      e.wingPhase+=dt*1.4;
      if(f.timer>t.rest){f.stage='patrol';f.timer=0;f.velocity.copy(forwardAxis).applyQuaternion(e.orientation).multiplyScalar(10);f.velocity.y+=6}
      return;
    }
    if(f.stage==='patrol'){
      // Wide, tilted orbits around the tower; each bird owns a radius, height and direction.
      const a=this.time*.26*t.spin+e.phase;
      wanted.set(nest.x+Math.cos(a)*t.orbit,nest.y+t.orbitHeight+Math.sin(a*2.3+e.phase)*7,nest.z+Math.sin(a)*t.orbit);
      speed=p.patrolSpeed*(.85+.15*Math.sin(this.time*.9+e.phase));agility=1.6;
      flapping=f.velocity.y>1.5||f.velocity.length()<speed*.8;
      if(f.timer>t.rest*2.2){f.stage='return';f.timer=0}
    }else if(f.stage==='return'){
      wanted.copy(e.home);wanted.y+=e.position.distanceTo(e.home)>25?9:0;
      const distance=e.position.distanceTo(e.home);
      speed=Math.min(p.returnSpeed,8+distance*.9);agility=2.2;flapping=distance<40||f.velocity.y>1;
      if(distance<3.2){f.stage='perch';f.timer=0;e.position.copy(e.home);f.velocity.set(0,0,0);return}
    }else{
      // Hunting: lead the aircraft, flank it from an individual side and height,
      // weave on the way in, then overshoot and climb out for another pass.
      const aim=wanted.copy(player).addScaledVector(target.velocity||zero,t.lead);
      delta.copy(aim).sub(e.position);const distance=delta.length();
      if(distance>1e-6)delta.divideScalar(distance);
      side.crossVectors(delta,upAxis);if(side.lengthSq()<1e-6)side.set(1,0,0);side.normalize().multiplyScalar(t.side);
      const spread=clamp((distance-25)/120,0,1);
      speed=this.huntSpeed()*t.speed;
      if(this.dazzled>0){speed*=p.flareSlow;agility*=.7;flapping=false}
      if(f.stage==='approach'){
        const weave=Math.sin(this.time*t.weave*2.1+e.phase)*(6+distance*.04);
        aim.addScaledVector(side,(Math.min(distance*.35,45)+weave)*spread);aim.y+=t.height*spread;
        const visible=range<p.range*1.5&&this.visible(e.position,player);
        if(range<p.range&&e.cooldown===0&&visible){
          this.onPlayerHit(p.damage);e.cooldown=p.cooldown;this.attacks++;this.onEvent('strike',e);
          f.stage='pass';f.timer=0;
        }else if(range<9){f.stage='pass';f.timer=0}
        flapping=f.velocity.length()<speed*.9;
      }else if(f.stage==='pass'){
        // Carry the momentum through: no hovering at the target.
        aim.copy(e.position).addScaledVector(f.velocity,1.5);aim.y+=4+t.height*.25;
        agility=t.agility*.6;fold=-.18;
        if(f.timer>t.pass){f.stage='climb';f.timer=0}
      }else{
        delta.copy(e.position).sub(player);delta.y=0;if(delta.lengthSq()<1e-6)delta.copy(side);delta.normalize();
        aim.copy(player).addScaledVector(delta,90).addScaledVector(side,40);aim.y+=35+Math.max(0,t.height);
        speed*=.92;flapping=true;
        if(f.timer>1.4||range>110){f.stage='approach';f.timer=0}
      }
    }
    // Flock separation: birds converging on one target keep a wingspan apart.
    for(const other of this.enemies){
      if(other===e||other.nest!==e.nest||other.health<=0)continue;
      delta.copy(e.position).sub(other.position);const gap=delta.length();
      if(gap>1e-6&&gap<16)wanted.addScaledVector(delta,(16-gap)*1.6/gap);
    }
    // Steer: velocity turns toward the wanted direction at a bounded rate → banked arcs.
    delta.copy(wanted).sub(e.position);const distance=delta.length();
    if(distance>1e-6)delta.divideScalar(distance);
    velocity.copy(delta).multiplyScalar(Math.min(speed,distance/Math.max(dt,.001)));
    f.velocity.lerp(velocity,1-Math.exp(-dt*agility));
    const near=nearbyColliders(this.colliders,e.position.x,e.position.y,e.position.z,16,Infinity);
    const contact=moveWithCollisions(e.position,f.velocity,dt,near,3.4,410);
    if(contact.hit)e.position.y=Math.min(400,e.position.y+dt*16);
    // Attitude: nose along the velocity, rolled into the turn.
    const pace=f.velocity.length();
    if(pace>1){
      delta.copy(f.velocity).divideScalar(pace);
      previousForward.copy(forwardAxis).applyQuaternion(e.orientation);
      const turn=(previousForward.x*delta.z-previousForward.z*delta.x)/Math.max(dt,1e-4);
      f.bank=THREE.MathUtils.damp(f.bank,clamp(turn*.55,-1.15,1.15),5,dt);
      lookMatrix.lookAt(zero,delta,upAxis);heading.setFromRotationMatrix(lookMatrix);
      heading.multiply(roll.setFromAxisAngle(forwardAxis,f.bank));
      e.orientation.slerp(heading,1-Math.exp(-dt*7));
    }
    // Wingbeats: flap to accelerate or climb, soar when carrying speed.
    e.wingFold=THREE.MathUtils.damp(e.wingFold,fold,5,dt);
    e.wingAmplitude=THREE.MathUtils.damp(e.wingAmplitude,flapping?.34:.07,4,dt);
    e.wingPhase+=dt*(flapping?7+pace*.03:2.2);
  }
  snapshot(){
    return {attacks:this.attacks,defeated:this.defeated,alerts:this.alerts,huntSpeed:this.huntSpeed(),playerSpeed:this.playerSpeed,dazzled:this.dazzled,flareBursts:this.flareBursts,rocks:this.rocks.length,
      debris:this.rocks.map(r=>({kind:r.kind||'rock',position:r.position.toArray(),owner:r.owner})),enemies:this.enemies.map(e=>({
      id:e.id,type:e.type,position:e.position.toArray(),health:e.health,maxHealth:e.maxHealth,
      hostile:e.hostile,respawnIn:e.respawnIn,climbing:e.type==='cat'&&['climb','descend','mantle','unmantle'].includes(e.patrol?.stage),windup:e.windup,
      patrol:e.patrol?{...e.patrol}:null,region:e.region||null,travel:e.travel,
      surfaceNormal:e.surfaceNormal?.toArray()||[0,1,0],
      orientation:e.orientation.toArray(),
      throws:e.throws,throwKind:e.throwKind,regeneration:PREDATORS[e.type].regeneration||0,
      nest:e.nest,stage:e.flight?.stage||null,speed:e.speed,
    }))};
  }
}
