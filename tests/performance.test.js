import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ColliderIndex} from '../src/collider-index.js';
import {Builder,seededRandom,spatialInstances,mergeRigidMeshes} from '../src/geometry.js';
import {traceProjectile} from '../src/poop-cannon.js';
import {raycastColliderHit} from '../src/collision.js';

test('spatial broad phase retains all overlapping colliders in original order, including negative cells and large structures',()=>{
  const random=seededRandom(41),boxes=[];
  for(let i=0;i<500;i++){
    const x=random()*2000-1000,z=random()*2000-1000,w=2+random()*250,d=2+random()*160;
    boxes.push({min:{x,y:0,z},max:{x:x+w,y:10+random()*300,z:z+d},tag:String(i)});
  }
  boxes.push({min:{x:-3000,y:-2,z:-3000},max:{x:3000,y:0,z:3000}});
  const index=new ColliderIndex(boxes);
  for(let i=0;i<300;i++){
    const x=random()*2000-1000,z=random()*2000-1000,y=random()*320,r=i===0?4000:random()*150;
    const expected=boxes.filter(b=>b.min.x<=x+r&&b.max.x>=x-r&&b.min.y<=y+r&&b.max.y>=y-r&&b.min.z<=z+r&&b.max.z>=z-r);
    assert.deepEqual(index.query(x-r,y-r,z-r,x+r,y+r,z+r),expected);
  }
  const edge={min:{x:-64,y:0,z:64},max:{x:0,y:8,z:128}};
  assert.deepEqual(new ColliderIndex([edge]).query(0,8,128,0,8,128),[edge]);
});

test('indexed projectile rays match a full narrow-phase scan across city-scale geometry',()=>{
  const random=seededRandom(39),boxes=[];
  for(let i=0;i<300;i++){
    const x=random()*1800-900,z=random()*1800-900;
    boxes.push({min:{x,y:0,z},max:{x:x+25,y:50+random()*180,z:z+40},tag:String(i)});
  }
  for(let i=0;i<300;i++){
    const from=new THREE.Vector3(random()*1800-900,random()*230+1,random()*1800-900);
    const to=new THREE.Vector3(random()*1800-900,random()*230+1,random()*1800-900);
    const dir=to.clone().sub(from),length=dir.length();dir.normalize();
    let nearest=length,winner=null;
    for(const box of boxes){const hit=raycastColliderHit(from,dir,box,nearest);if(hit){nearest=hit.distance;winner=box}}
    const hit=traceProjectile(from,to,boxes);
    assert.equal(hit?.collider??null,winner);
    if(hit)assert.ok(Math.abs(hit.point.distanceTo(from)-nearest)<1e-8);
  }
});

test('spatial batches preserve every triangle and collider, including moving parents and transparent order',()=>{
  const b=new Builder(),mat=b.mat('wall','#806050'),glass=b.mat('glass','#eeeeee',{transparent:true,opacity:.5});
  for(const x of [-600,-10,0,600]){b.box(x,0,0,4,8,6,mat);b.box(x,0,5,4,8,.1,glass);b.collider(x,0,0,4,8,6)}
  const parent=new THREE.Group(),colliders=b.finish(parent,{cellSize:100});
  assert.equal(colliders.length,4);
  assert.equal(parent.children.filter(m=>m.material===glass).length,1,'transparent sort order remains one batch');
  assert.equal(parent.children.reduce((n,m)=>n+m.geometry.attributes.position.count/3,0),8*12);
  parent.position.set(12,20,3);parent.updateMatrixWorld(true);
  for(const mesh of parent.children)assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld).toArray(),[12,20,3]);
});

test('splitting trees retains every exact instance matrix/color while giving each cell its own bounds',()=>{
  const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial(),30),matrix=new THREE.Matrix4(),color=new THREE.Color();
  const expected=[];
  for(let i=0;i<30;i++){
    matrix.makeTranslation((i-15)*100,5,i%3*200);mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,color.setRGB(i/30,.4,.7));
    mesh.getMatrixAt(i,matrix);mesh.getColorAt(i,color);expected.push(JSON.stringify([matrix.toArray(),color.toArray()]));
  }
  const cells=spatialInstances(mesh),actual=[];
  assert.ok(cells.length>1);
  for(const cell of cells){
    assert.ok(cell.boundingSphere.radius<350);
    for(let i=0;i<cell.count;i++){cell.getMatrixAt(i,matrix);cell.getColorAt(i,color);actual.push(JSON.stringify([matrix.toArray(),color.toArray()]))}
  }
  assert.deepEqual(actual.sort(),expected.sort());
});

test('rigid pigeon batching leaves moving groups intact and keeps mesh topology and bounds',()=>{
  const parent=new THREE.Group(),joint=new THREE.Group(),mat=new THREE.MeshStandardMaterial();
  parent.add(joint);
  for(let i=0;i<6;i++){
    const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),mat);mesh.position.set(i*.2,0,i*.3);mesh.scale.set(1,.5,.2);
    parent.add(mesh);
  }
  const before=new THREE.Box3().setFromObject(parent),triangles=parent.children.filter(o=>o.isMesh).reduce((n,o)=>n+o.geometry.attributes.position.count,0);
  mergeRigidMeshes(parent);const after=new THREE.Box3().setFromObject(parent);
  assert.equal(parent.children.length,2);assert.equal(joint.parent,parent);
  assert.ok(before.min.distanceTo(after.min)<1e-6&&before.max.distanceTo(after.max)<1e-6);
  assert.equal(parent.children.find(o=>o.isMesh).geometry.attributes.position.count,triangles);
});
