import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { partitionRanges, cullStaticRanges, STATIC_RANGES } from './static-ranges.js';

export const F = 142 / 36;
export const OFFICE_Y = F * 19;
export const ROOF_Y = F * 35;
export const TERRACE = new THREE.Vector3(12, OFFICE_Y + 1.9, 21);

export function seededRandom(seed = 319) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export class Builder {
  constructor() {
    this.materials = {};
    this.batches = new Map();
    this.colliders = [];
    this.matrix = new THREE.Matrix4();
  }
  mat(name, color, options = {}) {
    if (!this.materials[name]) {
      this.materials[name] = new THREE.MeshStandardMaterial({ color, roughness: .8, ...options });
    }
    return this.materials[name];
  }
  add(geometry, material, position = [0,0,0], scale = [1,1,1], rotation = [0,0,0]) {
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
    this.matrix.compose(new THREE.Vector3(...position), quaternion, new THREE.Vector3(...scale));
    const geo = geometry.index ? geometry.toNonIndexed() : geometry;
    if (geo !== geometry) geometry.dispose();
    geo.applyMatrix4(this.matrix);
    if (!geo.getAttribute('uv')) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count * 2), 2));
    if (!this.batches.has(material)) this.batches.set(material, []);
    this.batches.get(material).push(geo);
  }
  box(x,y,z,w,h,d,mat,rotation=[0,0,0]) {
    this.add(new THREE.BoxGeometry(1,1,1),mat,[x,y,z],[w,h,d],rotation);
  }
  cylinder(x,y,z,rt,rb,h,mat,segments=10,rotation=[0,0,0]) {
    this.add(new THREE.CylinderGeometry(rt,rb,h,segments),mat,[x,y,z],[1,1,1],rotation);
  }
  sphere(x,y,z,rx,ry,rz,mat,detail=1) {
    this.add(new THREE.IcosahedronGeometry(1,detail),mat,[x,y,z],[rx,ry,rz]);
  }
  collider(x,y,z,w,h,d,tag='solid') {
    const bounds = { min: {x:x-w/2,y:y-h/2,z:z-d/2}, max:{x:x+w/2,y:y+h/2,z:z+d/2}, tag };
    this.colliders.push(bounds);
    return bounds;
  }
  solidBox(x,y,z,w,h,d,mat,tag='solid') {
    this.box(x,y,z,w,h,d,mat);
    this.collider(x,y,z,w,h,d,tag);
  }
  polygon(points,y,height,mat,tag=null) {
    const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(p[0],-p[1])));
    const geo=height>0?new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false}):new THREE.ShapeGeometry(shape);
    this.add(geo,mat,[0,y,0],[1,1,1],[-Math.PI/2,0,0]);
    if(tag)this.polygonCollider(points,y,y+height,tag);
  }
  polygonCollider(points,bottom,top,tag='building') {
    this.colliders.push({polygon:points,min:{x:Math.min(...points.map(p=>p[0])),y:bottom,z:Math.min(...points.map(p=>p[1]))},max:{x:Math.max(...points.map(p=>p[0])),y:top,z:Math.max(...points.map(p=>p[1]))},tag});
  }
  segment(a,c,y,width,height,mat,tag=null) {
    const dx=c[0]-a[0],dz=c[1]-a[1],length=Math.hypot(dx,dz);
    if(length<.01)return;
    this.box((a[0]+c[0])/2,y,(a[1]+c[1])/2,length,height,width,mat,[0,-Math.atan2(dz,dx),0]);
    if(tag){
      const nx=-dz/length*width/2,nz=dx/length*width/2;
      this.polygonCollider([[a[0]+nx,a[1]+nz],[c[0]+nx,c[1]+nz],[c[0]-nx,c[1]-nz],[a[0]-nx,a[1]-nz]],y-height/2,y+height/2,tag);
    }
  }
  beam(a,c,r,mat) {
    const from=new THREE.Vector3(...a),to=new THREE.Vector3(...c),direction=to.clone().sub(from);
    const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.clone().normalize());
    const rotation=new THREE.Euler().setFromQuaternion(q);
    this.add(new THREE.CylinderGeometry(r,r,direction.length(),6),mat,from.add(to).multiplyScalar(.5).toArray(),[1,1,1],[rotation.x,rotation.y,rotation.z]);
  }
  transform(position,angle) {
    const matrix=new THREE.Matrix4().makeRotationY(angle);matrix.setPosition(...position);
    for(const geometries of this.batches.values())for(const geo of geometries)geo.applyMatrix4(matrix);
    const cosine=Math.cos(angle),sine=Math.sin(angle);
    for(const collider of this.colliders){
      const points=collider.polygon||[[collider.min.x,collider.min.z],[collider.max.x,collider.min.z],[collider.max.x,collider.max.z],[collider.min.x,collider.max.z]];
      collider.polygon=points.map(([x,z])=>[x*cosine+z*sine+position[0],-x*sine+z*cosine+position[2]]);
      collider.min={x:Math.min(...collider.polygon.map(p=>p[0])),y:collider.min.y+position[1],z:Math.min(...collider.polygon.map(p=>p[1]))};
      collider.max={x:Math.max(...collider.polygon.map(p=>p[0])),y:collider.max.y+position[1],z:Math.max(...collider.polygon.map(p=>p[1]))};
    }
  }
  finish(parent,{cellSize=0}={}) {
    for (const [mat, geometries] of this.batches) {
      const cells=new Map();
      for(const geo of geometries){
        let key='all';
        // Keep transparent surfaces in their original batch/sort order.
        if(cellSize&&!mat.transparent){
          geo.computeBoundingBox();const {min,max}=geo.boundingBox;
          key=max.x-min.x>cellSize*2||max.z-min.z>cellSize*2?'large'
            :`${Math.floor((min.x+max.x)/2/cellSize)},${Math.floor((min.z+max.z)/2/cellSize)}`;
        }
        if(!cells.has(key))cells.set(key,[]);cells.get(key).push(geo);
      }
      for(const cell of cells.values()){
        // Opaque batches are stored in spatial order so the shadow and camera
        // passes can skip sub-ranges outside their frustum (see static-ranges.js).
        const partition=!mat.transparent&&cell.length>1?partitionRanges(cell):null;
        const geometry = mergeGeometries(partition?partition.geometries:cell);
        const mesh = new THREE.Mesh(geometry,mat);
        // Very sparse batches (map-wide lane markings, rails) gain little from
        // culling but would cost hundreds of range tests per frame.
        if(partition&&partition.ranges.length>1&&partition.vertexCount>=STATIC_RANGES.minVertices&&partition.vertexCount/partition.ranges.length>=STATIC_RANGES.minAverageRange)cullStaticRanges(mesh,partition.ranges);
        mesh.castShadow = !mat.transparent && !mat.userData.surfaceOverlay && (!mat.emissive || mat.emissive.getHex() === 0);
        mesh.receiveShadow = true;
        mesh.name = `static-${mat.name || mat.color.getHexString()}`;
        // Geometry has its local transforms baked in. Moving parent assemblies
        // still update these meshes' world transforms.
        mesh.matrixAutoUpdate=false;
        parent.add(mesh);
      }
      for (const geo of geometries) geo.dispose();
    }
    this.batches.clear();
    return this.colliders;
  }
}

/** Batch only rigid direct children; articulated child groups remain intact. */
export function mergeRigidMeshes(parent){
  const groups=new Map();
  for(const mesh of parent.children){
    if(!mesh.isMesh||Array.isArray(mesh.material)||mesh.material.transparent)continue;
    if(!groups.has(mesh.material))groups.set(mesh.material,[]);
    groups.get(mesh.material).push(mesh);
  }
  for(const [material,meshes] of groups){
    if(meshes.length<2)continue;
    const geometries=meshes.map(mesh=>{
      mesh.updateMatrix();
      const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
      return geometry.applyMatrix4(mesh.matrix);
    });
    const merged=new THREE.Mesh(mergeGeometries(geometries),material);
    merged.castShadow=meshes[0].castShadow;merged.receiveShadow=meshes[0].receiveShadow;
    merged.matrixAutoUpdate=false;
    for(const mesh of meshes){parent.remove(mesh);mesh.geometry.dispose()}
    for(const geometry of geometries)geometry.dispose();
    parent.add(merged);
  }
}

/** Partition static instances without changing their geometry, colors or poses. */
export function spatialInstances(source,cellSize=320){
  const cells=new Map(),matrix=new THREE.Matrix4(),color=new THREE.Color(),result=[];
  for(let i=0;i<source.count;i++){
    source.getMatrixAt(i,matrix);
    const key=`${Math.floor(matrix.elements[12]/cellSize)},${Math.floor(matrix.elements[14]/cellSize)}`;
    if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i);
  }
  for(const ids of cells.values()){
    const mesh=new THREE.InstancedMesh(source.geometry,source.material,ids.length);
    mesh.castShadow=source.castShadow;mesh.receiveShadow=source.receiveShadow;
    ids.forEach((id,i)=>{
      source.getMatrixAt(id,matrix);mesh.setMatrixAt(i,matrix);
      if(source.instanceColor){source.getColorAt(id,color);mesh.setColorAt(i,color)}
    });
    mesh.matrixAutoUpdate=false;mesh.computeBoundingSphere();result.push(mesh);
  }
  source.dispose();return result;
}

export function sign(builder,text,x,y,z,w,h,{background='#f3f0df',color='#344d40',size=66,rotation=0,sub='',amazon=false}={}) {
  const canvas=document.createElement('canvas');
  canvas.width=1024;canvas.height=Math.round(1024*h/w);
  const ctx=canvas.getContext('2d');
  ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle=color;ctx.font=`600 ${size}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(text,512,canvas.height*(amazon?.39:sub?.4:.5),950);
  if (amazon) {
    ctx.strokeStyle='#e8a34c';ctx.lineWidth=10;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(360,canvas.height*.65);ctx.quadraticCurveTo(495,canvas.height*.93,670,canvas.height*.6);ctx.stroke();
    ctx.beginPath();ctx.moveTo(644,canvas.height*.61);ctx.lineTo(674,canvas.height*.59);ctx.lineTo(671,canvas.height*.72);ctx.stroke();
  }
  if(sub){ctx.font=`400 ${size*.34}px Arial`;ctx.fillText(sub,512,canvas.height*.76,940)}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const mat=new THREE.MeshStandardMaterial({map:texture,roughness:.9,side:THREE.DoubleSide});
  builder.add(new THREE.PlaneGeometry(w,h),mat,[x,y,z],[1,1,1],[0,rotation,0]);
}

export function tree(b,x,y,z,s=1,autumn=false) {
  const bark=b.mat('bark','#8a7861');
  const leaves=b.mat(autumn?'leafgold':'leaf','#91a878');
  const leavesLight=b.mat(autumn?'leafgoldlight':'leaflight',autumn?'#c7b481':'#b0bd87');
  b.cylinder(x,y+s*1.4,z,.16*s,.25*s,2.8*s,bark,7);
  b.sphere(x,y+3.3*s,z,1.8*s,2.1*s,1.7*s,leaves,1);
  b.sphere(x+.9*s,y+3.5*s,z-.3*s,1.1*s,1.6*s,1.2*s,leavesLight,1);
  b.sphere(x-.7*s,y+3*s,z+.6*s,1.3*s,1.2*s,1.3*s,leaves,1);
}

export function plant(b,x,y,z,s=1) {
  const pot=b.mat('pot','#d1bc9e'),stem=b.mat('stem','#4b6e4f'),leaf=b.mat('officeleaf','#7d9a65');
  b.cylinder(x,y+.3*s,z,.3*s,.22*s,.6*s,pot,12);
  for(let i=0;i<6;i++){
    const a=i*2.4;
    b.cylinder(x,y+.8*s,z,.018*s,.024*s,1.2*s,stem,5);
    b.sphere(x+Math.cos(a)*.25*s,y+(.8+i*.13)*s,z+Math.sin(a)*.25*s,.3*s,.15*s,.46*s,leaf,1);
  }
}
