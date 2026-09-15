import * as THREE from 'three';
import { Builder } from './geometry.js';
import { GODZILLA } from './godzilla.js';

// Bake colors into two shared materials per rig: armor and glowing reactor parts.
function finish(builder,parent,metal,lights=metal){
  const batches=new Map();
  for(const [material,geometries] of builder.batches){
    const target=material.emissive.getHex()?lights:metal;
    if(!batches.has(target))batches.set(target,[]);
    for(const geometry of geometries){
      const colors=new Float32Array(geometry.attributes.position.count*3);
      for(let i=0;i<colors.length;i+=3)material.color.toArray(colors,i);
      geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
      batches.get(target).push(geometry);
    }
  }
  builder.batches=batches;builder.finish(parent);
  return parent;
}

export function createTrainWagon(){
  const b=new Builder(),root=new THREE.Group();root.name='thrown-train-wagon';
  const silver=b.mat('wagon body','#d5dbd4'),red=b.mat('wagon stripe','#b9342b');
  const dark=b.mat('wagon undercarriage','#27383d'),glass=b.mat('wagon windows','#396a7c');
  b.box(0,0,0,3.2,2.8,9.4,silver);
  b.box(0,1.55,0,3.35,.45,9.65,silver);
  b.box(0,-1.5,0,2.8,.35,9.8,dark);
  for(const side of [-1,1]){
    b.box(side*1.62,-.7,0,.06,.45,9.4,red);
    for(let i=0;i<6;i++)b.box(side*1.64,.5,-3.5+i*1.35,.08,.85,.95,glass);
    for(const z of [-3,3]){
      b.cylinder(side*1.45,-1.7,z,.52,.52,.35,dark,8,[0,0,Math.PI/2]);
      b.box(side*1.64,0,z+side*.55,.09,2.2,.1,dark);
    }
  }
  for(const z of [-4.73,4.73]){
    b.box(0,.35,z,1.6,1.3,.08,glass);
    b.box(0,-1.2,z*1.09,.8,.4,.8,dark);
  }
  const metal=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.48,roughness:.55});
  finish(b,root,metal);
  Object.values(b.materials).forEach(m=>m.dispose());
  return root;
}

export function createGodzilla(){
  const root=new THREE.LOD(),detail=new THREE.Group(),low=new THREE.Group();
  root.name='cyborg-godzilla';root.addLevel(detail,0);root.addLevel(low,520);
  const metal=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.72,roughness:.4});
  const lights=new THREE.MeshStandardMaterial({vertexColors:true,emissive:'#42d8d2',emissiveIntensity:1.1,roughness:.3});
  const palette=new Builder();
  const dark=palette.mat('reptile armor','#273c42'),shell=palette.mat('armored scales','#536c70');
  const silver=palette.mat('steel edges','#b4c4bc'),black=palette.mat('recesses','#142327');
  const copper=palette.mat('hydraulics','#b9854b'),led=palette.mat('reactor','#66eee2',{emissive:'#40c6cd'});
  const red=palette.mat('warning','#e77746',{emissive:'#f26e37'});
  const part=(b,name,parent=detail,position=[0,0,0])=>{
    const group=new THREE.Group();group.name=name;group.position.set(...position);
    parent.add(group);return finish(b,group,metal,lights);
  };
  const spine=(b,x,y,z,size)=>{
    const shape=new THREE.Shape([
      new THREE.Vector2(-.65*size,0),new THREE.Vector2(-.8*size,.5*size),
      new THREE.Vector2(-.2*size,1.8*size),new THREE.Vector2(.2*size,1.2*size),
      new THREE.Vector2(.7*size,.2*size),
    ]);
    b.add(new THREE.ExtrudeGeometry(shape,{depth:.9,bevelEnabled:false}),shell,[x-.45,y,z],[1,1,1],[0,Math.PI/2,0]);
    // Illuminated side panels are outside the metal blade, so the dorsal
    // silhouette glows from either approach instead of hiding inside its shell.
    for(const side of [-1,1]){
      const panel=new THREE.ShapeGeometry(shape);
      panel.scale(.7,.72,1);
      if(side===-1){
        const indices=panel.index.array;
        for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
        panel.computeVertexNormals();
      }
      b.add(panel,led,[x+side*.48,y+size*.18,z],[1,1,1],[0,Math.PI/2,0]);
    }
  };
  const body=new Builder();
  body.sphere(0,-1,2,9.4,12,8.4,dark,2);
  body.sphere(0,-11,3,10,7,8,shell,1);
  body.sphere(0,10,-3,5.5,8,5.4,dark,1);
  // Overlapping ventral armor and a recessed circular reactor on the chest.
  for(let i=0;i<6;i++){
    body.box(0,7-i*3,-5.5-Math.sin(i*.5),11-i*.5,2.25,2.1,i%2?shell:silver,[.1,0,0]);
    for(const side of [-1,1]){
      body.box(side*(8.3-Math.abs(i-2)*.25),5-i*2.4,0,2,1.8,8,shell,[0,0,side*.2]);
      body.beam([side*7,7-i*2,4],[side*8,5-i*2,-4],.2,copper);
    }
  }
  body.cylinder(0,4,-7.5,2.6,2.6,.6,black,16,[Math.PI/2,0,0]);
  body.cylinder(0,4,-7.9,1.65,1.65,.3,led,12,[Math.PI/2,0,0]);
  for(let i=0;i<5;i++)spine(body,0,8-i*2.5,5+Math.sin(i*.55)*4.7,4.5-i*.3);
  for(const side of [-1,1]){
    // Folded haunches, forward knees, planted talons: a seated reptile silhouette.
    body.sphere(side*8,-10,-.5,5.1,6.4,6.4,shell,1);
    body.sphere(side*8,-12,-6,3.8,3.7,4,silver,1);
    body.beam([side*8,-12,-6],[side*8,-16,-8],1.9,dark);
    body.beam([side*10,-11,-5],[side*10,-16,-8],.38,copper);
    body.box(side*8,-17,-9,5.4,2,6.6,shell);
    for(let toe=-1;toe<=1;toe++){
      body.cylinder(side*8+toe*1.7,-17.3,-13,0,.7,3.2,silver,5,[Math.PI/2,0,0]);
      body.box(side*8+toe*1.6,-15.9,-10,.4,.2,2,led);
    }
    body.sphere(side*8,7,-1,3.2,3.4,3.4,silver,1);
    body.cylinder(side*10,7,-1,1.9,1.9,.6,copper,12,[0,0,Math.PI/2]);
  }
  part(body,'seated-armored-body');

  const skull=new Builder();
  skull.sphere(0,0,0,5.5,5.6,6.2,shell,2);
  skull.box(0,-1,-5.7,8.7,4.5,8,shell,[.08,0,0]);
  skull.box(0,-2.35,-7.1,8.9,.8,7.2,black);
  skull.box(0,-3.3,-5.8,8.1,1.4,8.7,silver);
  for(const side of [-1,1]){
    skull.box(side*4.55,1,-3.2,.38,.8,2.5,red,[0,side*.15,0]);
    skull.box(side*4.6,2,-3.5,1.5,1,3.9,dark,[0,side*.2,side*.12]);
    skull.box(side*2.5,.3,-9.8,1.2,.7,.2,black);
    for(let i=0;i<5;i++){
      skull.cylinder(side*3.6,-2.4,-3-i*1.3,.48,0,1.4,silver,4);
      skull.box(side*4.9,-.5,1+i*.65,.4,.6,.35,copper);
    }
  }
  spine(skull,0,4.2,2,2.3);
  const head=part(skull,'godzilla-jaw',detail,[0,17,-8]);

  const arms=[];
  for(const side of [-1,1]){
    const b=new Builder();
    b.beam([0,0,0],[side*2,-5,-3],1.7,dark);
    b.box(side*1,-2,-1.5,3.6,5,3.8,shell,[.35,0,side*.2]);
    b.sphere(side*2,-5,-3,2,2,2,copper,1);
    b.beam([side*2,-5,-3],[side*2.5,-5.5,-8],1.5,silver);
    b.beam([side*3.4,-4.6,-3],[side*3.4,-4.7,-7],.28,copper);
    b.box(side*2.5,-5.4,-8.5,3.6,2.5,3.8,shell);
    for(let finger=-1;finger<=1;finger++)b.beam([side*2.5+finger,-5.4,-10],[side*2.5+finger,-6.7,-11.5],.45,silver);
    b.box(side*2.5,-3.95,-7.5,1.4,.15,2.5,led);
    arms.push(part(b,side===1?'throwing-arm':'resting-arm',detail,[side*8.5,7,-1]));
  }
  const tail=[];let parent=detail;
  for(let i=0;i<6;i++){
    const b=new Builder(),r=4.5-i*.65;
    b.sphere(0,0,3,r,r*.8,5,shell,1);
    b.cylinder(0,0,.2,r*.85,r*.85,.6,copper,10,[Math.PI/2,0,0]);
    spine(b,0,r*.6,3,Math.max(1,3.3-i*.4));
    parent=part(b,`segmented-tail-${i}`,parent,i===0?[0,-8,9]:[0,-.35,6]);
    parent.rotation.y=.18;tail.push(parent);
  }
  const heldRock=new THREE.Mesh(new THREE.IcosahedronGeometry(2.2,1),new THREE.MeshStandardMaterial({color:'#948675',roughness:.95}));
  const heldWagon=createTrainWagon();
  // These sit in the right claw through the windup, then disappear on release.
  heldRock.position.set(2.5,-5.4,-11.5);heldWagon.position.copy(heldRock.position);heldWagon.rotation.y=Math.PI/2;
  arms[1].add(heldRock,heldWagon);heldRock.visible=heldWagon.visible=false;

  const distant=new Builder();
  distant.sphere(0,0,2,10,12,8,dark,1);
  distant.sphere(0,14,-6,5.7,8,6,shell,1);
  distant.box(0,16,-13,8,5,9,shell);distant.box(0,18,-17.6,7,.7,.15,red);
  for(const side of [-1,1]){
    distant.sphere(side*8,-11,-3,5,6,7,shell,0);
    distant.box(side*8,-17,-9,5,2,7,silver);
    distant.beam([side*9,6,0],[side*11,1,-10],1.9,shell);
  }
  distant.beam([0,-8,9],[4,-9,24],3.5,shell);
  distant.beam([4,-9,24],[17,-10,42],1.9,shell);
  for(let i=0;i<7;i++)spine(distant,i>3?(i-3)*3:0,10-i*2.5,6+i*4,4-i*.4);
  distant.cylinder(0,4,-7.4,1.8,1.8,.3,led,8,[Math.PI/2,0,0]);
  part(distant,'distant-godzilla',low);
  Object.values(palette.materials).forEach(m=>m.dispose());

  root.userData.animate=(time,e)=>{
    root.position.copy(e.position);root.quaternion.copy(e.orientation);root.visible=e.health>0;
    metal.emissive.set(e.flash>0?'#a16b43':'#000000');metal.emissiveIntensity=.5;
    lights.emissive.set(e.hostile?'#ff693f':'#42d8d2');
    lights.emissiveIntensity=(e.hostile?1.3:.85)+Math.sin(time*2.4)*.15;
    head.rotation.y=e.hostile?0:Math.sin(time*.35)*.17;
    head.rotation.x=Math.sin(time*.8)*.025-(e.windup>0?.07:0);
    const duration=e.throwKind==='wagon'?GODZILLA.wagonWindup:GODZILLA.windup;
    const winding=e.windup>0,progress=winding?1-e.windup/duration:0;
    arms[1].rotation.x=winding?.4+progress*1.65:e.throwRecovery>0?-.35*(e.throwRecovery/.45):Math.sin(time*.8)*.035;
    arms[0].rotation.x=Math.sin(time*.8+.8)*.05;
    heldRock.visible=winding&&e.throwKind==='rock';heldWagon.visible=winding&&e.throwKind==='wagon';
    tail.forEach((part,i)=>{part.rotation.y=.18+Math.sin(time*.65-i*.4)*.035});
  };
  root.userData.getPose=()=>({
    cyborg:true,seated:true,lod:detail.visible?'articulated':'distant',
    throwing:heldWagon.visible?'wagon':heldRock.visible?'rock':null,
    tailSegments:tail.length,
  });
  return root;
}
