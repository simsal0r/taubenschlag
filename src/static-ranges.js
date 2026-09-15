import * as THREE from 'three';

// Merged static batches keep their draw-call savings, but Three.js can only
// cull a whole mesh. A 320 m block or a map-wide road batch is therefore drawn
// completely into the 280 × 300 m shadow frustum and into narrow camera views.
// Geometry is stored in spatial order with a bounding sphere per sub-cell; the
// render hooks then draw only the sub-ranges that intersect the current frustum.
// Skipped triangles were fully clipped anyway, so the image is unchanged, and
// the remaining ranges keep their relative order.
export const STATIC_RANGES=Object.freeze({cellSize:40,minVertices:3000,minRangeVertices:1500,minAverageRange:150,minCulledFraction:.2,mergeGap:4500});

/** Reorder opaque geometries by spatial cell; returns merge order plus ranges. */
export function partitionRanges(geometries,{cellSize=STATIC_RANGES.cellSize,minRangeVertices=STATIC_RANGES.minRangeVertices}={}){
  const cells=new Map();
  for(const geo of geometries){
    if(!geo.boundingBox)geo.computeBoundingBox();
    const {min,max}=geo.boundingBox;
    const x=Math.floor((min.x+max.x)/2/cellSize),y=Math.floor((min.y+max.y)/2/cellSize),z=Math.floor((min.z+max.z)/2/cellSize),key=`${x},${y},${z}`;
    let cell=cells.get(key);
    if(!cell){cell={x,y,z,geometries:[],box:new THREE.Box3()};cells.set(key,cell)}
    cell.geometries.push(geo);cell.box.union(geo.boundingBox);
  }
  // Column-major order keeps neighbouring cells contiguous so visible ranges
  // merge into few draws; vertical slices let tall towers shed their crowns
  // from the shadow frustum.
  const ordered=[...cells.values()].sort((a,b)=>a.x-b.x||a.z-b.z||a.y-b.y),result=[],ranges=[],box=new THREE.Box3(),size=new THREE.Vector3();
  let start=0,pending=null;
  const flush=()=>{
    if(!pending)return;
    const sphere=new THREE.Sphere();pending.box.getBoundingSphere(sphere);
    ranges.push({start:pending.start,count:pending.count,sphere});pending=null;
  };
  for(const cell of ordered){
    let count=0;
    for(const geo of cell.geometries){result.push(geo);count+=geo.getAttribute('position').count}
    // Sparse neighbouring cells are coalesced: gaps below mergeGap would be drawn
    // anyway, and fewer ranges keep the per-frame frustum tests cheap.
    if(pending&&pending.count<minRangeVertices&&box.copy(pending.box).union(cell.box).getSize(size).length()<=cellSize*3){pending.count+=count;pending.box.union(cell.box)}
    else{flush();pending={start,count,box:cell.box.clone()}}
    start+=count;
  }
  flush();
  return {geometries:result,ranges,vertexCount:start};
}

const frustum=new THREE.Frustum(),projection=new THREE.Matrix4(),sphere=new THREE.Sphere();
let frustumCamera=null,frustumFrame=-1;
function frustumFor(renderer,camera){
  const frame=renderer.info.render.frame;
  if(frustumCamera!==camera||frustumFrame!==frame){
    projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projection,camera.coordinateSystem,camera.reversedDepth);
    frustumCamera=camera;frustumFrame=frame;
  }
  return frustum;
}
function isIdentityMatrix(m){
  const e=m.elements;
  return e[0]===1&&e[5]===1&&e[10]===1&&e[15]===1&&e[1]===0&&e[2]===0&&e[3]===0&&e[4]===0&&e[6]===0&&e[7]===0&&e[8]===0&&e[9]===0&&e[11]===0&&e[12]===0&&e[13]===0&&e[14]===0;
}

/**
 * Restrict a merged mesh's shadow and camera draws to the sub-ranges inside the
 * active frustum. Visible ranges are merged into contiguous runs; all but the
 * last run are submitted directly and the last one becomes the geometry's
 * drawRange for the renderer's own call, so no draw is wasted.
 */
export function cullStaticRanges(mesh,ranges,{minCulledFraction=STATIC_RANGES.minCulledFraction,mergeGap=STATIC_RANGES.mergeGap}={}){
  const geometry=mesh.geometry,total=geometry.getAttribute('position').count;
  const runs=ranges.map(()=>({start:0,count:0,materialIndex:0}));
  mesh.userData.staticRanges=ranges;
  function collect(renderer,camera){
    const planes=frustumFor(renderer,camera).planes,world=mesh.matrixWorld,identity=isIdentityMatrix(world);
    let n=0,drawn=0;
    for(let i=0;i<ranges.length;i++){
      const r=ranges[i],s=identity?r.sphere:sphere.copy(r.sphere).applyMatrix4(world),c=s.center,negRadius=-s.radius;
      let outside=false;
      for(let k=0;k<6;k++){
        const plane=planes[k],normal=plane.normal;
        if(normal.x*c.x+normal.y*c.y+normal.z*c.z+plane.constant<negRadius){outside=true;break}
      }
      if(outside)continue;
      const previous=n>0?runs[n-1]:null,end=previous?previous.start+previous.count:0;
      // A small clipped gap costs less than another submission: draw across it.
      if(previous&&r.start-end<=mergeGap){drawn+=r.start+r.count-end;previous.count=r.start+r.count-previous.start}
      else{drawn+=r.count;const run=runs[n++];run.start=r.start;run.count=r.count}
    }
    // A handful of clipped triangles is cheaper than extra submissions.
    if(n>0&&total-drawn<total*minCulledFraction)return -1;
    return n;
  }
  function apply(renderer,camera,scene,material,n){
    if(n<0)return;
    if(n===0){geometry.setDrawRange(0,0);return}
    for(let i=0;i<n-1;i++)renderer.renderBufferDirect(camera,scene,geometry,material,mesh,runs[i]);
    const last=runs[n-1];geometry.setDrawRange(last.start,last.count);
  }
  const restore=()=>geometry.setDrawRange(0,Infinity);
  mesh.onBeforeRender=function(renderer,scene,camera,geo,material){
    const n=collect(renderer,camera);
    if(n<0)return;
    // The renderer refreshes these after the hook; the early submissions need them now.
    mesh.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse,mesh.matrixWorld);
    mesh.normalMatrix.getNormalMatrix(mesh.modelViewMatrix);
    apply(renderer,camera,scene,material,n);
  };
  mesh.onAfterRender=restore;
  mesh.onBeforeShadow=function(renderer,object,camera,shadowCamera,geo,depthMaterial){
    apply(renderer,shadowCamera,null,depthMaterial,collect(renderer,shadowCamera));
  };
  mesh.onAfterShadow=restore;
  return mesh;
}
