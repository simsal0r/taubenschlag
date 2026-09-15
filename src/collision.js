export const BIRD_RADIUS=.3;
export const WORLD_LIMIT=950;

export function insideBox(p,b,r=0){
  return p.x>b.min.x-r&&p.x<b.max.x+r&&p.y>b.min.y-r&&p.y<b.max.y+r&&p.z>b.min.z-r&&p.z<b.max.z+r;
}
export function pointInPolygon(x,z,points){
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
function footprint(b){
  return b.polygon||[[b.min.x,b.min.z],[b.max.x,b.min.z],[b.max.x,b.max.z],[b.min.x,b.max.z]];
}
function contact(p,b,r){
  if(!insideBox(p,b,r))return null;
  const points=footprint(b),within=pointInPolygon(p.x,p.z,points);
  let nearest=Infinity,qx=0,qz=0,edgeX=0,edgeZ=0,area=0;
  for(let i=0;i<points.length;i++){
    const a=points[i],c=points[(i+1)%points.length],dx=c[0]-a[0],dz=c[1]-a[1];
    const lengthSquared=dx*dx+dz*dz;if(lengthSquared<1e-10)continue;
    const t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.z-a[1])*dz)/lengthSquared));
    const x=a[0]+t*dx,z=a[1]+t*dz,d=Math.hypot(x-p.x,z-p.z);
    area+=a[0]*c[1]-c[0]*a[1];
    if(d<nearest){nearest=d;qx=x;qz=z;edgeX=dx;edgeZ=dz}
  }
  const closestY=Math.max(b.min.y,Math.min(b.max.y,p.y));
  const dx=within?0:p.x-qx,dz=within?0:p.z-qz,dy=p.y-closestY,d=Math.hypot(dx,dy,dz);
  if(d>=r)return null;
  if(d>1e-8)return {x:dx/d,y:dy/d,z:dz/d,depth:r-d};
  const down=p.y-b.min.y,up=b.max.y-p.y;
  if(up<=nearest&&up<=down)return{x:0,y:1,z:0,depth:r+up};
  if(down<=nearest)return{x:0,y:-1,z:0,depth:r+down};
  if(nearest>1e-8)return{x:(qx-p.x)/nearest,y:0,z:(qz-p.z)/nearest,depth:r+nearest};
  const length=Math.hypot(edgeX,edgeZ),sign=area>0?1:-1;
  return{x:edgeZ/length*sign,y:0,z:-edgeX/length*sign,depth:r};
}

/** Swept substeps against extruded map footprints, rotated landmarks and office boxes. */
export function moveWithCollisions(position,velocity,dt,colliders,radius=BIRD_RADIUS,ceiling=480){
  const distance=Math.hypot(velocity.x,velocity.y,velocity.z)*dt;
  const steps=Math.max(1,Math.ceil(distance/(radius*.65))),step=dt/steps;
  let hit=false,grounded=false,impact=null;
  for(let i=0;i<steps;i++){
    position.x+=velocity.x*step;position.y+=velocity.y*step;position.z+=velocity.z*step;
    for(let pass=0;pass<2;pass++)for(const box of colliders){
      const c=contact(position,box,radius);if(!c)continue;
      position.x+=c.x*(c.depth+.00001);position.y+=c.y*(c.depth+.00001);position.z+=c.z*(c.depth+.00001);
      const inward=velocity.x*c.x+velocity.y*c.y+velocity.z*c.z;
      if(inward<0&&-inward>(impact?.speed||0)){
        impact={speed:-inward,normal:{x:c.x,y:c.y,z:c.z},
          point:{x:position.x-c.x*radius,y:position.y-c.y*radius,z:position.z-c.z*radius},tag:box.tag||'surface'};
      }
      if(c.y>.6&&velocity.y<=0)grounded=true;
      if(inward<0){velocity.x-=c.x*inward;velocity.y-=c.y*inward;velocity.z-=c.z*inward}
      hit=true;
    }
  }
  if(position.y<radius+.15){
    if(-velocity.y>(impact?.speed||0))impact={speed:-velocity.y,normal:{x:0,y:1,z:0},point:{x:position.x,y:.15,z:position.z},tag:'ground'};
    position.y=radius+.15;velocity.y=Math.max(0,velocity.y);grounded=true;
  }
  for(const axis of ['x','z']){
    if(Math.abs(position[axis])>WORLD_LIMIT){position[axis]=Math.sign(position[axis])*WORLD_LIMIT;velocity[axis]=0;hit=true}
  }
  if(position.y>ceiling){position.y=ceiling;velocity.y=Math.min(0,velocity.y);hit=true}
  return{hit,grounded,impact};
}
export function surfaceBelow(position,colliders,maxDistance=2.5){
  let highest=.15;
  for(const b of colliders){
    if(position.x>=b.min.x&&position.x<=b.max.x&&position.z>=b.min.z&&position.z<=b.max.z&&b.max.y<=position.y+.05&&
      (!b.polygon||pointInPolygon(position.x,position.z,b.polygon)))highest=Math.max(highest,b.max.y);
  }
  return position.y-highest<=maxDistance?highest:null;
}
export function raycastCollider(origin,direction,b,maxDistance=Infinity){
  return raycastColliderHit(origin,direction,b,maxDistance)?.distance??null;
}
export function raycastColliderHit(origin,direction,b,maxDistance=Infinity){
  const points=footprint(b);
  let nearest=maxDistance,normal=null;
  if(Math.abs(direction.y)>1e-8)for(const y of [b.min.y,b.max.y]){
    const t=(y-origin.y)/direction.y;
    if(t>0&&t<nearest&&pointInPolygon(origin.x+direction.x*t,origin.z+direction.z*t,points)){
      nearest=t;normal={x:0,y:y===b.max.y?1:-1,z:0};
    }
  }
  for(let i=0;i<points.length;i++){
    const a=points[i],c=points[(i+1)%points.length],ex=c[0]-a[0],ez=c[1]-a[1];
    const cross=direction.x*ez-direction.z*ex;
    if(Math.abs(cross)<1e-8)continue;
    const ax=a[0]-origin.x,az=a[1]-origin.z,t=(ax*ez-az*ex)/cross,u=(ax*direction.z-az*direction.x)/cross;
    const y=origin.y+t*direction.y;
    if(t>0&&t<nearest&&u>=0&&u<=1&&y>=b.min.y&&y<=b.max.y){
      nearest=t;const length=Math.hypot(ex,ez),sign=(ez*direction.x-ex*direction.z)>0?-1:1;
      normal={x:ez/length*sign,y:0,z:-ex/length*sign};
    }
  }
  return nearest<maxDistance?{distance:nearest,normal}:null;
}
