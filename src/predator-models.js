import * as THREE from 'three';
import { Builder } from './geometry.js';
import { CAT_GAIT,edgeDistance } from './predator-navigation.js';
import { pointInPolygon } from './collision.js';

// Articulated close models use two batched materials. Distant silhouettes use
// only two draw calls, so the denser street population doesn't multiply the cost.
export function createPredator(type){
  const root=new THREE.LOD(),detail=new THREE.Group(),low=new THREE.Group();
  root.name=`cyborg-${type}`;root.addLevel(detail,0);root.addLevel(low,230);
  const metal=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.43,metalness:.63});
  const lights=new THREE.MeshStandardMaterial({vertexColors:true,emissive:'#61c7de',emissiveIntensity:.65,roughness:.35});
  const palette=new Builder(),cat=type==='cat',eagle=type==='eagle',hawk=type==='hawk'||eagle;
  // Eagles wear near-black plumage armor with a pale head, gold beak and red sensors.
  const shell=palette.mat('shell',cat?'#a8aba4':eagle?'#45423f':hawk?'#8d9d9e':'#bbc4c0');
  const dark=palette.mat('graphite',eagle?'#1e2427':'#293b45'),trim=palette.mat('titanium',eagle?'#ece7da':'#d7d8ca'),bronze=palette.mat('copper',eagle?'#c9a24a':'#a77648');
  const joint=palette.mat('joints','#4e666f'),glass=palette.mat('visor','#172d3a');
  const led=palette.mat('led',eagle?'#ff8a5a':'#79def3',{emissive:eagle?'#ff5a30':'#64d8f0'}),amber=palette.mat('amber',eagle?'#ffd35c':'#ffb960',{emissive:eagle?'#e0a020':'#d58545'});
  const span=eagle?1.3:1;
  const finish=(b,parent=detail,position=[0,0,0])=>{
    const batches=new Map();
    for(const [m,geos] of b.batches){
      const target=m.emissive?.getHex()?lights:metal;
      if(!batches.has(target))batches.set(target,[]);
      for(const geo of geos){
        const colors=new Float32Array(geo.attributes.position.count*3);
        for(let i=0;i<colors.length;i+=3)m.color.toArray(colors,i);
        geo.setAttribute('color',new THREE.BufferAttribute(colors,3));batches.get(target).push(geo);
      }
    }
    b.batches=batches;const g=new THREE.Group();g.position.set(...position);b.finish(g);parent.add(g);return g;
  };
  const plate=(b,x,y,z,w,d,h,m)=>{
    const c=Math.min(w,d)*.2;
    b.polygon([[-w/2+c,-d/2],[w/2-c,-d/2],[w/2,-d/2+c],[w/2,d/2-c],[w/2-c,d/2],[-w/2+c,d/2],[-w/2,d/2-c],[-w/2,-d/2+c]].map(([a,c])=>[a+x,c+z]),y,h,m);
  };
  const b=new Builder(),wings=[],tailParts=[],legs=[];
  b.sphere(0,0,.2,eagle?2.1:hawk?1.8:cat?1.9:2.65,eagle?1.55:hawk?1.35:1.65,eagle?4.1:hawk?3.5:3.8,dark,2);
  for(let i=0;i<4;i++){
    plate(b,0,1.05+Math.sin(i*.8)*.28,-2.1+i*1.4,hawk?2.8:cat?3.8:4.9,1.55,.45,i%2?shell:trim);
    b.box(0,1.65,-2.2+i*1.35,.35,.13,.9,led);
  }
  for(const side of [-1,1]){
    b.beam([side*1.4,.4,-2.7],[side*1.6,.1,2.9],.23,bronze);
    for(let i=0;i<6;i++){
      b.box(side*(hawk?1.65:cat?1.85:2.55),.2,-2.3+i*.8,.28,1.2,.32,shell,[0,0,side*.18]);
      b.box(side*(hawk?1.8:cat?2:2.7),.45,-2.3+i*.8,.08,.5,.12,led);
    }
    if(!hawk){
      b.sphere(side*1.65,-.5,-2.5,.8,.85,.85,joint,1);
      b.sphere(side*1.65,-.5,2.3,1,1.05,1.15,shell,1);
      if(!cat){plate(b,side*2.6,.6,.6,1.3,3.8,.8,shell);b.box(side*3.1,.55,.6,.12,.3,2.5,bronze)}
    }
  }
  const headBuilder=new Builder();
  headBuilder.sphere(0,0,0,hawk?1.35:1.65,1.35,1.7,eagle?trim:shell,2);
  headBuilder.sphere(0,-.2,-1.35,hawk?.9:1.35,.66,.68,trim,1);
  // Raccoon's bandit mask and the cat's swept visor remain unmistakable.
  headBuilder.sphere(0,.3,-1.25,hawk?1.2:1.65,.6,.5,glass,1);
  for(const side of [-1,1]){
    headBuilder.sphere(side*.86,.35,-1.65,.32,.22,.13,amber,1);
    headBuilder.box(side*.84,.62,-1.47,.8,.16,.34,dark,[0,0,side*-.15]);
    if(cat){
      headBuilder.cylinder(side*1.1,1.4,.2,0,.72,2.1,shell,3,[0,side*.25,-side*.16]);
      headBuilder.beam([side*1.15,1.2,-.12],[side*1.25,2.25,.13],.07,led);
      for(let j=0;j<3;j++)headBuilder.beam([side*.85,-.2,-1.5],[side*(2.1+j*.12),j*.2-.35,-1.8],.026,bronze);
    }else if(!hawk){
      headBuilder.sphere(side*1.22,1.35,.35,.65,.7,.38,dark,1);
      headBuilder.sphere(side*1.22,1.38,.08,.42,.46,.12,trim,1);
    }
    headBuilder.cylinder(side*1.5,-.2,-.2,.42,.42,.24,joint,10,[0,0,Math.PI/2]);
  }
  if(hawk)headBuilder.cylinder(0,-.15,-2,0,eagle?.68:.55,eagle?2.1:1.6,bronze,5,[Math.PI/2+.18,0,0]);
  else headBuilder.sphere(0,-.3,-1.9,.35,.22,.2,dark,1);
  const head=finish(headBuilder,detail,[0,.85,-3]);
  if(hawk){
    for(const side of [-1,1]){
      const wing=new Builder();
      wing.beam([0,0,0],[side*6.5*span,0,.7],.25,bronze);
      for(let i=0;i<8;i++){
        plate(wing,side*(1.4+i*.88)*span,-.06,1+i*.16,1.25*span,(3.5-i*.14)*(eagle?1.15:1),.24,i%3?shell:dark);
        plate(wing,side*(1.4+i*.88)*span,.2,.4+i*.16,.35,1.25,.07,i%2?led:amber);
      }
      if(eagle)for(let i=0;i<5;i++)plate(wing,side*(7.9+i*.55),-.08,1.9+i*.25,.5,3.2-i*.4,.16,i%2?dark:shell);
      wing.cylinder(side*2.5,.06,.4,.7,.7,.32,joint,12);
      wings.push(finish(wing,detail,[side*1.2,.35,-.3]));
      b.beam([side*.8,-1,1],[side*1.1,-2,1.6],.22,joint);
      for(let j=-1;j<=1;j++)b.beam([side*1.1,-2,1.6],[side*1.1+j*.4,-2.4,.3],.12,trim);
    }
    const tb=new Builder();
    for(let i=-2;i<=2;i++){plate(tb,i*.55,0,1.8,.8,4,.12,eagle?trim:shell);plate(tb,i*.55,.13,2.3,.25,1,.04,amber)}
    tailParts.push(finish(tb,detail,[0,.1,2.5]));
  }else{
    // Shared piston segments, knees, magnetic pads and hooked steel claws.
    const upper=new Builder(),lower=new Builder(),paw=new Builder();
    upper.cylinder(0,.5,0,.34,.52,1,shell,8);upper.box(0,.5,.32,.35,.7,.28,dark);upper.box(0,.5,.49,.1,.52,.06,led);
    lower.cylinder(0,.5,0,.2,.3,1,joint,8);lower.cylinder(.22,.5,.08,.075,.075,1,bronze,6);
    lower.sphere(0,0,0,.4,.3,.38,trim,1);
    plate(paw,0,0,0,1.25,1.7,.35,dark);plate(paw,0,.35,-.1,.95,1.3,.14,shell);
    paw.box(0,-.06,0,.85,.12,1.1,led);
    for(let i=-1;i<=1;i++)paw.beam([i*.38,.1,-.65],[i*.38,-.15,-1.15],.09,trim);
    const upperTemplate=finish(upper,new THREE.Group()),lowerTemplate=finish(lower,new THREE.Group()),pawTemplate=finish(paw,new THREE.Group());
    for(const side of [-1,1])for(const z of [-2.45,2.45]){
      const leg={hip:new THREE.Vector3(side*1.6,-.55,z),upper:upperTemplate.clone(true),lower:lowerTemplate.clone(true),paw:pawTemplate.clone(true),anchor:new THREE.Vector3(),lift:new THREE.Vector3(),landing:new THREE.Vector3(),swing:false,ready:false,contact:false};
      detail.add(leg.upper,leg.lower,leg.paw);legs.push(leg);
    }
    let parent=detail;
    for(let i=0;i<5;i++){
      const tb=new Builder();tb.sphere(0,0,.55,cat?.4:.85,cat?.4:.72,.86,i%2?dark:shell,1);
      tb.cylinder(0,0,.25,cat?.28:.57,cat?.28:.57,.14,bronze,8,[Math.PI/2,0,0]);
      tb.box(0,cat?.4:.72,.5,.14,.06,.5,led);
      const g=finish(tb,parent,i===0?[0,.35,3.1]:[0,.06,1.05]);tailParts.push(g);parent=g;
    }
  }
  finish(b);
  // Cheap but recognizable distant armor silhouette. No articulated submeshes.
  const distant=new Builder();distant.sphere(0,0,0,cat?2.1:hawk?1.8:2.7,1.6,3.7,shell,1);
  distant.sphere(0,.8,-3,1.5,1.3,1.7,shell,1);distant.box(0,1,-4.3,2,.35,.15,amber);
  if(hawk)for(const side of [-1,1])plate(distant,side*5*span,0,.6,8*span,4,.2,shell);
  else{
    for(const side of [-1,1])for(const z of [-2.4,2.4])distant.box(side*1.6,-1.9,z,.85,2.5,1.1,dark);
    distant.beam([0,.3,3],[0,.6,7],cat?.4:.8,dark);
    for(const side of [-1,1])distant.sphere(side*1.1,2.1,-2.6,.45,.7,.35,dark,0);
  }
  finish(distant,low);
  const inverse=new THREE.Quaternion(),dir=new THREE.Vector3(),bend=new THREE.Vector3(),knee=new THREE.Vector3(),localFoot=new THREE.Vector3(),worldFoot=new THREE.Vector3();
  let lastStage='',lastPosition=new THREE.Vector3(Infinity,0,0);
  const roofContact=(foot,e)=>{
    const p=e.wall?.roofPoints;if(e.patrol?.stage!=='roof'||!p)return;
    const x=foot.x,z=foot.z;
    // Shorten the step at roof edges, including TaunusTurm's narrow spine.
    for(let i=0;i<=10;i++){
      const s=1-i/10;foot.x=e.position.x+(x-e.position.x)*s;foot.z=e.position.z+(z-e.position.z)*s;
      if(pointInPolygon(foot.x,foot.z,p)&&p.every((a,j)=>edgeDistance(foot.x,foot.z,a,p[(j+1)%p.length])>.55))break;
    }
    foot.y=e.wall.roofY+.14;
  };
  const link=(mesh,a,c)=>{dir.copy(c).sub(a);mesh.position.copy(a);mesh.quaternion.setFromUnitVectors(upAxis,dir.clone().normalize());mesh.scale.set(1,dir.length(),1)};
  root.userData.animate=(time,e)=>{
    root.position.copy(e.position);root.quaternion.copy(e.orientation);root.visible=e.health>0;
    metal.emissive.set(e.flash>0?'#a17b50':'#000000');metal.emissiveIntensity=.35;
    lights.emissive.set(e.hostile?'#e59b56':'#61c7de');lights.emissiveIntensity=e.flash>0?1.3:.65;
    if(!detail.visible){for(const l of legs)l.ready=false;return}
    const stage=e.patrol?.stage||'ground',travel=e.travel||0,wall=cat&&['climb','descend'].includes(stage);
    const reset=lastStage!==stage||lastPosition.distanceTo(e.position)>10;
    inverse.copy(e.orientation).invert();
    head.rotation.y=Math.sin(time*.8)*.09;head.rotation.x=e.windup>0?-.12:Math.sin(travel*.8)*.035;
    wings.forEach((wing,i)=>{
      const sign=i===0?-1:1;
      // Eagles fold on the perch, beat hard to accelerate and soar with a slow shimmer.
      const fold=eagle?e.wingFold||0:0;
      if(eagle)wing.rotation.z=sign*(fold*.55+.06+Math.sin(e.wingPhase||0)*(e.wingAmplitude||0));
      else wing.rotation.z=sign*(.08+Math.sin(time*4.3)*.2);
      // Folded wings sweep back along the body; in flight they trail slightly with speed.
      wing.rotation.y=sign*Math.min(eagle?.32:.22,e.speed*.005)-sign*fold*1.15;
    });
    for(let i=0;i<legs.length;i++){
      const l=legs[i],phase=(travel/CAT_GAIT.stride+[0,.5,.25,.75][i])%1,swingFraction=wall?.22:.34;
      const swing=phase<swingFraction;
      // A stance foot stays fixed in world coordinates while the body passes it.
      const neutral=l.hip.clone();neutral.y=-CAT_GAIT.bodyHeight+.14;neutral.z-=.35;
      const step=stage==='descend'?-1:1;
      const goal=neutral.clone();goal.z-=step*CAT_GAIT.stride*.42;
      goal.applyQuaternion(e.orientation).add(e.position);
      roofContact(goal,e);
      if(reset||!l.ready){l.anchor.copy(neutral).applyQuaternion(e.orientation).add(e.position);roofContact(l.anchor,e);l.lift.copy(l.anchor);l.landing.copy(goal);l.ready=true;l.swing=swing}
      if(swing&&!l.swing){l.lift.copy(l.anchor);l.landing.copy(goal)}
      if(swing){
        const t=phase/swingFraction,s=t*t*(3-2*t);worldFoot.lerpVectors(l.lift,l.landing,s);
        worldFoot.addScaledVector(e.surfaceNormal||upAxis,Math.sin(t*Math.PI)*.65);
        l.anchor.copy(worldFoot);
      }else worldFoot.copy(l.anchor);
      l.swing=swing;l.contact=!swing;
      localFoot.copy(worldFoot).sub(e.position).applyQuaternion(inverse);
      if(i===0&&e.windup>0){localFoot.y+=1.2;localFoot.z-=Math.sin(e.windup/.65*Math.PI)*1.5;l.contact=false}
      dir.copy(localFoot).sub(l.hip);const length=THREE.MathUtils.clamp(dir.length(),.3,4.3);dir.normalize();
      localFoot.copy(l.hip).addScaledVector(dir,length);
      bend.set(0,0,i%2===0?-1:1).addScaledVector(dir,-dir.z*(i%2===0?-1:1)).normalize();
      knee.copy(l.hip).addScaledVector(dir,length*.5).addScaledVector(bend,Math.sqrt(Math.max(.02,2.2**2-(length*.5)**2)));
      link(l.upper,l.hip,knee);link(l.lower,knee,localFoot);l.paw.position.copy(localFoot);
      const surface=(e.surfaceNormal||upAxis).clone().applyQuaternion(inverse);l.paw.quaternion.setFromUnitVectors(upAxis,surface);
    }
    tailParts.forEach((tail,i)=>{tail.rotation.y=Math.sin(time*1.7-i*.65)*.12;tail.rotation.x=cat?-.12+Math.sin(time-i*.6)*.09:.05});
    lastStage=stage;lastPosition.copy(e.position);
  };
  root.userData.getPose=()=>({cyborg:true,lod:detail.visible?'articulated':'distant',feet:legs.map(l=>({contact:l.contact,anchor:l.anchor.toArray(),position:l.paw.position.toArray()}))});
  return root;
}
const upAxis=new THREE.Vector3(0,1,0);
