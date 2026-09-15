/** Dispose shared GPU resources once, including hidden models and render targets. */
export function disposeResources(...roots) {
  const seen=new Set();
  function dispose(value) {
    if(!value||typeof value!=='object'||seen.has(value))return;
    seen.add(value);
    if(value.isObject3D){
      for(const child of value.children)dispose(child);
      dispose(value.geometry);dispose(value.material);
      if(value.isInstancedMesh)value.dispose();
      return;
    }
    if(Array.isArray(value)){value.forEach(dispose);return}
    if(value.isMaterial){
      for(const item of Object.values(value))if(item?.isTexture)dispose(item);
      value.dispose();return;
    }
    if(value.isBufferGeometry||value.isTexture||value.isWebGLRenderTarget)value.dispose();
  }
  roots.forEach(dispose);
}
