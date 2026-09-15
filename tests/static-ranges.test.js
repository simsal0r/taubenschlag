import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Builder,seededRandom} from '../src/geometry.js';
import {partitionRanges,cullStaticRanges,STATIC_RANGES} from '../src/static-ranges.js';
import {ColliderIndex} from '../src/collider-index.js';

/** Fake renderer: records direct submissions the way WebGLRenderer.renderBufferDirect would. */
function fakeRenderer(){
  const calls=[];
  return {info:{render:{frame:1}},calls,renderBufferDirect(camera,scene,geometry,material,object,group){calls.push({start:group.start,count:group.count})}};
}
function drawnVertices(renderer,geometry){
  const ranges=[...renderer.calls];
  const range=geometry.drawRange;
  if(range.count!==Infinity)ranges.push({start:range.start,count:range.count});
  return ranges;
}
function cityBuilder(){
  const b=new Builder(),wall=b.mat('wall','#a09080'),random=seededRandom(7);
  for(let i=0;i<400;i++){
    const x=random()*1600-800,z=random()*1600-800;
    b.cylinder(x,random()*60+10,z,4+random()*8,4+random()*8,20+random()*120,wall,24);
  }
  return {b,wall};
}

test('spatial ranges reorder geometry without changing its triangles and cover the buffer contiguously',()=>{
  const {b}=cityBuilder(),geometries=[...b.batches.values()][0];
  const expected=geometries.map(g=>Array.from(g.getAttribute('position').array)).sort();
  const {geometries:ordered,ranges,vertexCount}=partitionRanges(geometries);
  assert.deepEqual(ordered.map(g=>Array.from(g.getAttribute('position').array)).sort(),expected,'same geometry set');
  assert.equal(vertexCount,geometries.reduce((n,g)=>n+g.getAttribute('position').count,0));
  let cursor=0,vertex=new THREE.Vector3();
  for(const range of ranges){
    assert.equal(range.start,cursor,'ranges are contiguous');cursor+=range.count;
    // Every vertex in the range lies inside its bounding sphere.
    let offset=0;
    for(const g of ordered){
      const count=g.getAttribute('position').count;
      if(offset>=range.start&&offset<range.start+range.count){
        for(let i=0;i<count;i++){vertex.fromBufferAttribute(g.getAttribute('position'),i);assert.ok(range.sphere.containsPoint(vertex)||range.sphere.distanceToPoint(vertex)<1e-6)}
      }
      offset+=count;
    }
  }
  assert.equal(cursor,vertexCount);assert.ok(ranges.length>10);
});

test('range culling draws exactly the sub-ranges that intersect the frustum and restores the geometry afterwards',()=>{
  const {b,wall}=cityBuilder(),parent=new THREE.Group();
  b.finish(parent);
  const mesh=parent.children[0];assert.equal(mesh.material,wall);
  const ranges=mesh.userData.staticRanges;assert.ok(ranges&&ranges.length>10,'large opaque batches receive ranges');
  const camera=new THREE.PerspectiveCamera(50,1.5,.1,600);
  camera.position.set(-900,120,0);camera.lookAt(0,40,0);camera.updateMatrixWorld();camera.updateProjectionMatrix();
  const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  const visible=ranges.filter(r=>frustum.intersectsSphere(r.sphere)),hidden=ranges.filter(r=>!frustum.intersectsSphere(r.sphere));
  assert.ok(visible.length>0&&hidden.length>0,'the test camera sees only part of the city');
  const renderer=fakeRenderer();
  mesh.onBeforeRender(renderer,new THREE.Scene(),camera,mesh.geometry,mesh.material,null);
  const drawn=drawnVertices(renderer,mesh.geometry);
  const covered=v=>drawn.some(d=>v>=d.start&&v<d.start+d.count);
  for(const r of visible)for(let v=r.start;v<r.start+r.count;v+=3)assert.ok(covered(v),'visible range is submitted');
  const total=mesh.geometry.getAttribute('position').count,drawnCount=drawn.reduce((n,d)=>n+d.count,0);
  assert.ok(drawnCount<total,'hidden geometry is skipped');
  for(let i=1;i<drawn.length;i++)assert.ok(drawn[i].start>drawn[i-1].start+drawn[i-1].count+STATIC_RANGES.mergeGap,'runs are separated by more than the merge gap');
  mesh.onAfterRender();
  assert.equal(mesh.geometry.drawRange.count,Infinity);assert.equal(mesh.geometry.drawRange.start,0);
  // Shadow pass uses the same ranges with the light's orthographic camera.
  const light=new THREE.OrthographicCamera(-140,140,150,-150,1,500);
  light.position.set(-95,200,130);light.lookAt(0,40,0);light.updateMatrixWorld();light.updateProjectionMatrix();
  const shadowRenderer=fakeRenderer();
  mesh.onBeforeShadow(shadowRenderer,mesh,camera,light,mesh.geometry,new THREE.MeshDepthMaterial(),null);
  const shadowDrawn=drawnVertices(shadowRenderer,mesh.geometry);
  assert.ok(shadowDrawn.reduce((n,d)=>n+d.count,0)<total*.6,'a 280 m shadow frustum skips most of a 1.6 km city');
  mesh.onAfterShadow();assert.equal(mesh.geometry.drawRange.count,Infinity);
  // A camera that sees nothing of the mesh submits nothing.
  const away=new THREE.PerspectiveCamera(30,1,.1,50);away.position.set(0,5000,0);away.lookAt(0,6000,0);away.updateMatrixWorld();away.updateProjectionMatrix();
  const none=fakeRenderer();none.info.render.frame=2;
  mesh.onBeforeRender(none,new THREE.Scene(),away,mesh.geometry,mesh.material,null);
  assert.equal(none.calls.length,0);assert.equal(mesh.geometry.drawRange.count,0);mesh.onAfterRender();
  // Fully visible: the renderer's own single call is left untouched.
  const wide=new THREE.PerspectiveCamera(120,1,.1,5000);wide.position.set(0,2500,0);wide.lookAt(0,0,0);wide.updateMatrixWorld();wide.updateProjectionMatrix();
  const all=fakeRenderer();all.info.render.frame=3;
  mesh.onBeforeRender(all,new THREE.Scene(),wide,mesh.geometry,mesh.material,null);
  assert.equal(all.calls.length,0);assert.equal(mesh.geometry.drawRange.count,Infinity);
});

test('transparent and small batches keep plain single-draw meshes',()=>{
  const b=new Builder(),glass=b.mat('glass','#ffffff',{transparent:true,opacity:.5}),tiny=b.mat('tiny','#ffffff');
  for(let x=-600;x<=600;x+=100){b.box(x,10,0,10,10,10,glass);b.box(x,10,50,1,1,1,tiny)}
  const parent=new THREE.Group();b.finish(parent);
  for(const mesh of parent.children)assert.equal(mesh.userData.staticRanges,undefined);
});

test('allocation-free collider queries return the same ordered candidates as a full scan',()=>{
  const random=seededRandom(11),boxes=[];
  for(let i=0;i<400;i++){const x=random()*1800-900,z=random()*1800-900;boxes.push({min:{x,y:0,z},max:{x:x+5+random()*60,y:random()*200,z:z+5+random()*60}})}
  boxes.push({min:{x:-3000,y:-2,z:-3000},max:{x:3000,y:0,z:3000}});
  const index=new ColliderIndex(boxes);
  for(let i=0;i<200;i++){
    const x=random()*1800-900,z=random()*1800-900,y=random()*200,r=random()*120;
    const expected=boxes.filter(b=>b.min.x<=x+r&&b.max.x>=x-r&&b.min.y<=y+r&&b.max.y>=y-r&&b.min.z<=z+r&&b.max.z>=z-r);
    const first=index.query(x-r,y-r,z-r,x+r,y+r,z+r),second=index.query(x-r,y-r,z-r,x+r,y+r,z+r);
    assert.deepEqual(first,expected);assert.deepEqual(second,expected);assert.notEqual(first,second,'each query returns its own array');
  }
});
