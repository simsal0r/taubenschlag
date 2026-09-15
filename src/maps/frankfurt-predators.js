import * as THREE from 'three';
import { PredatorSimulation, PREDATORS } from '../predator-simulation.js';
import { createPredator } from '../predator-models.js';
import '../predators.css';
import { catTerritory,clearOfBuildings } from '../predator-navigation.js';
import { pointInPolygon } from '../collision.js';
import { GODZILLA, godzillaSpawn } from '../godzilla.js';
import { createGodzilla, createTrainWagon } from '../godzilla-model.js';
import { eagleNest } from './frankfurt-nest.js';

export function raccoonPatrols(data,colliders){
  const anchors=[[-90,-85],[-180,80],[-270,65],[-340,170],[-420,245],[-500,300],[-555,405],[-520,130]];
  const candidates=[];
  for(const road of data.roads){
    if(road.bridge||road.width<7||['footway','path','cycleway'].includes(road.kind))continue;
    for(const [a,b] of road.segments){
      const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<28)continue;
      const point=t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
      const mid=point(.5);if(mid[0]>50||mid[0]<-640||mid[1]<-180||mid[1]>500)continue;
      if(data.parks.some(p=>pointInPolygon(...mid,p.points)))continue;
      const start=point(.12),end=point(.88);
      if(!Array.from({length:9},(_,i)=>point(.12+i*.095)).every(p=>clearOfBuildings(...p,colliders,3.7)))continue;
      candidates.push({mid,route:[[start[0],3.55,start[1]],[end[0],3.55,end[1]]],name:road.name||'Bankenviertel lane'});
    }
  }
  const selected=[];
  for(const anchor of anchors){
    const ranked=candidates.filter(c=>selected.every(p=>Math.hypot(c.mid[0]-p.mid[0],c.mid[1]-p.mid[1])>35))
      .sort((a,b)=>Math.hypot(a.mid[0]-anchor[0],a.mid[1]-anchor[1])-Math.hypot(b.mid[0]-anchor[0],b.mid[1]-anchor[1]));
    if(ranked[0])selected.push(ranked[0]);
  }
  return selected.map(p=>({type:'raccoon',position:p.route[0],route:p.route,region:p.name}));
}
export function createFrankfurtPredators(scene,world,callbacks){
  const wall1=catTerritory(world.data.parts[368975736].points,169.5,world.data.landmarks.taunus.points,world.colliders,[-100,-60]);
  const wall2=catTerritory(world.data.parts[74730506].points,148,world.data.landmarks.eurotower.points,world.colliders,[-80,220]);
  const onWall=(wall,y)=>[wall.mid[0]+wall.normal[0]*3.35,y,wall.mid[1]+wall.normal[1]*3.35];
  const simulation=new PredatorSimulation({
    colliders:world.colliders,...callbacks,
    spawns:[
      {type:'hawk',position:[-105,148,90]},{type:'hawk',position:[-290,180,-150]},
      {type:'cat',position:onWall(wall1,76),wall:wall1},{type:'cat',position:onWall(wall2,53),wall:wall2},
      ...raccoonPatrols(world.data,world.colliders),
      godzillaSpawn(world.data),
      ...eagleNest(),
    ],
  });
  const group=new THREE.Group();group.name='Frankfurt predators';scene.add(group);
  const overlay=document.createElement('div');overlay.id='predator-overlay';overlay.setAttribute('aria-hidden','true');document.getElementById('app').append(overlay);
  const bars=simulation.enemies.map(e=>{
    const model=e.type==='godzilla'?createGodzilla():createPredator(e.type);group.add(model);
    const bar=document.createElement('div');bar.className='predator-health';bar.hidden=true;
    bar.innerHTML=`<span>${PREDATORS[e.type].label.toUpperCase()}</span><div><i></i></div><small></small>`;overlay.append(bar);
    if(e.type==='godzilla'){
      bar.classList.add('boss-health');bar.id='godzilla-health';
      bar.insertAdjacentHTML('afterbegin','<label>SILBERTURM / DEUTSCHE BAHN TOWER</label>');
      bar.insertAdjacentHTML('beforeend','<p></p>');
    }
    return{e,model,bar,fill:bar.querySelector('i'),value:bar.querySelector('small'),hint:bar.querySelector('p'),occluded:false};
  });
  const rockGeo=new THREE.IcosahedronGeometry(1,1),rockMat=new THREE.MeshStandardMaterial({color:'#827e72',roughness:.95});
  const rocks=new THREE.InstancedMesh(rockGeo,rockMat,18);rocks.count=0;rocks.castShadow=true;rocks.frustumCulled=false;group.add(rocks);
  const wagonTemplate=createTrainWagon(),wagonMesh=wagonTemplate.children[0];
  const wagons=new THREE.InstancedMesh(wagonMesh.geometry,wagonMesh.material,18);
  wagons.name='godzilla-thrown-wagons';wagons.count=0;wagons.castShadow=true;wagons.frustumCulled=false;group.add(wagons);
  const transform=new THREE.Object3D(),p=new THREE.Vector3(),forward=new THREE.Vector3(),offset=new THREE.Vector3();
  let labelTimer=0,playerPosition=new THREE.Vector3();
  return{
    simulation,
    poses:()=>bars.map(({e,model})=>({id:e.id,...model.userData.getPose()})),
    update(dt,target){
      simulation.update(dt,target);
      if(target?.position)playerPosition.copy(target.position);
      for(const {e,model} of bars)model.userData.animate(simulation.time,e);
      rocks.count=0;wagons.count=0;
      for(let i=0;i<simulation.rocks.length;i++){
        const r=simulation.rocks[i];
        const pool=r.kind==='wagon'?wagons:rocks;
        transform.position.copy(r.position);transform.scale.setScalar(r.kind==='wagon'?1:r.radius);transform.rotation.set(r.age*3,r.age*2,r.age);
        transform.updateMatrix();pool.setMatrixAt(pool.count++,transform.matrix);
      }
      if(rocks.count>0)rocks.instanceMatrix.needsUpdate=true;
      if(wagons.count>0)wagons.instanceMatrix.needsUpdate=true;
      labelTimer+=dt;
    },
    render(camera,visible){
      camera.getWorldDirection(forward);
      for(const item of bars){
        const {e,bar,fill,value,hint}=item;
        if(e.type==='godzilla'){
          bar.hidden=!visible||!e.hostile||e.health<=0;
          if(!bar.hidden){
            const range=Math.round(playerPosition.distanceTo(e.position));
            fill.style.transform=`scaleX(${e.health/e.maxHealth})`;
            value.textContent=`${Math.ceil(e.health)} / ${e.maxHealth}  ·  REPAIR +${GODZILLA.regeneration}/s  ·  ${range} m`;
            hint.textContent=e.windup>0?`${e.throwKind==='wagon'?'TRAIN WAGON':'ROCK'} INCOMING — BREAK AWAY`
              :range>GODZILLA.range?'OUTSIDE THROW RANGE · DISTANT SHOTS WEAKEN'
              :'CLOSE FIRE HITS HARDER · KEEP MOVING';
            bar.classList.toggle('winding',e.windup>0);
          }
          continue;
        }
        const active=visible&&e.hostile&&e.health>0&&camera.position.distanceTo(e.position)<650;
        p.copy(e.position);p.y+=e.type==='cat'?8:6;
        if(labelTimer>.15&&active)item.occluded=!simulation.visible(camera.position,p);
        const ahead=offset.copy(p).sub(camera.position).dot(forward)>0;
        p.project(camera);
        bar.hidden=!active||!ahead||item.occluded||Math.abs(p.x)>.96||Math.abs(p.y)>.93;
        if(!bar.hidden){
          bar.style.transform=`translate(-50%,-100%) translate(${(p.x*.5+.5)*innerWidth}px,${(-p.y*.5+.5)*innerHeight}px)`;
          fill.style.transform=`scaleX(${e.health/e.maxHealth})`;value.textContent=`${Math.ceil(e.health)} / ${e.maxHealth}`;
        }
      }
      if(labelTimer>.15)labelTimer=0;
    },
    dispose(){overlay.remove()},
  };
}
