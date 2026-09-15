// The map geometry never changes during a flight. Retain its vector paths,
// then translate/scale them for each HUD update at the original resolution.
// Same-colored shapes share one Path2D: thousands of footprints and road
// segments become a few dozen canvas calls per refresh.
const signedArea=ring=>ring.reduce((s,a,i)=>{const b=ring[(i+1)%ring.length];return s+a[0]*b[1]-b[0]*a[1]},0);
function addRing(path,ring,orientation=0){
  // With the nonzero rule, consistent winding keeps overlapping footprints
  // solid and opposite-wound holes open, exactly as separate fills did.
  const points=orientation&&Math.sign(signedArea(ring))===-orientation?[...ring].reverse():ring;
  points.forEach(([x,z],i)=>i?path.lineTo(x,z):path.moveTo(x,z));path.closePath();
}
export function createMinimapPaths(data,buildings,riverWidth){
  const lines=[],byStyle=new Map();
  const line=(segments,color,width)=>{
    const key=`${color}|${width}`;
    let entry=byStyle.get(key);
    if(!entry){entry={path:new Path2D(),color,width};byStyle.set(key,entry);lines.push(entry)}
    for(const [a,b] of segments){entry.path.moveTo(a[0],a[1]);entry.path.lineTo(b[0],b[1])}
  };
  const areas=(polygons,color)=>polygons.map(area=>{
    const path=new Path2D();
    for(const ring of [area.points,...area.holes||[]])addRing(path,ring);
    return {path,color};
  });
  const footprints=new Path2D();
  for(const building of buildings){
    addRing(footprints,building.points,1);
    for(const hole of building.holes||[])addRing(footprints,hole,-1);
  }
  if(!data.water)for(const r of data.rivers)line(r.segments,'#b7d0c7',riverWidth);
  for(const r of data.roads)if(!['footway','service','cycleway'].includes(r.kind))line(r.segments,'#e4e3d3',r.width||6);
  for(const r of data.rails)line(r.segments,'#bcbfad',1.3);
  return {
    areas:data.water?[...areas(data.water,'#8ecbcf'),...areas(data.parks,'#b7d4a0')]:[],
    lines,
    buildings:buildings.length?[{path:footprints,color:'#cbd0be'}]:[],
  };
}
export const NEON_MINIMAP_COLORS=Object.freeze({
  '#b7d0c7':'#266a77', // river centerlines
  '#8ecbcf':'#266a77', // water polygons
  '#b7d4a0':'#234d3e', // parks
  '#e4e3d3':'#4c817a', // roads
  '#bcbfad':'#6f9b8b', // rails
  '#cbd0be':'#30594f', // buildings
});
export function drawMinimapPaths(ctx,paths,cx,cz,scale,width,height,colors={}){
  ctx.save();ctx.translate(width/2-cx*scale,height/2-cz*scale);ctx.scale(scale,scale);
  for(const {path,color} of paths.areas){ctx.fillStyle=colors[color]||color;ctx.fill(path,'evenodd')}
  ctx.lineCap='round';
  for(const {path,color,width} of paths.lines){ctx.strokeStyle=colors[color]||color;ctx.lineWidth=width;ctx.stroke(path)}
  for(const {path,color} of paths.buildings){ctx.fillStyle=colors[color]||color;ctx.fill(path)}
  ctx.restore();
}
