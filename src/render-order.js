// Three r180 sorts using clip-space Z. Reversed depth flips that ordering,
// so retain front-to-back opaque and back-to-front transparent ordering.
export function reversedOpaqueOrder(a,b){
  return a.groupOrder-b.groupOrder||a.renderOrder-b.renderOrder||a.material.id-b.material.id||b.z-a.z||a.id-b.id;
}
export function reversedTransparentOrder(a,b){
  return a.groupOrder-b.groupOrder||a.renderOrder-b.renderOrder||a.z-b.z||a.id-b.id;
}
