import * as THREE from 'three';
import { Builder } from './geometry.js';
import { THRUSTERS } from './vtol-thrusters.js';

// Beveled armor in the X/Z plane. Moving assemblies get their own small batches.
function plate(b,points,y,depth,material,bevel=.035){
  const shape=new THREE.Shape(points.map(([x,z])=>new THREE.Vector2(x,-z)));
  const geometry=new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel*.6,bevelSegments:1});
  b.add(geometry,material,[0,y,0],[1,1,1],[-Math.PI/2,0,0]);
}

// Elliptical stations produce a shaped fuselage instead of intersecting spheres.
function hullGeometry(stations,segments=16){
  const positions=[],indices=[];
  for(const [z,rx,ry,y]of stations)for(let i=0;i<segments;i++){
    const a=i/segments*Math.PI*2;
    positions.push(Math.cos(a)*rx,y+Math.sin(a)*ry,z);
  }
  for(let j=0;j<stations.length-1;j++)for(let i=0;i<segments;i++){
    const a=j*segments+i,b=j*segments+(i+1)%segments,c=a+segments,d=b+segments;
    indices.push(a,b,c,b,d,c);
  }
  const front=positions.length/3;positions.push(0,stations[0][3],stations[0][0]);
  const last=stations.at(-1),back=positions.length/3;positions.push(0,last[3],last[0]);
  for(let i=0;i<segments;i++){
    indices.push(front,(i+1)%segments,i);
    const a=(stations.length-1)*segments+i,b=(stations.length-1)*segments+(i+1)%segments;
    indices.push(back,a,b);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}

function marking(parent,text,position,rotation,size){
  if(typeof document==='undefined')return;
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#d7ded5';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='600 56px Consolas, monospace';ctx.fillText(text,256,53);
  ctx.font='15px Consolas, monospace';ctx.fillStyle='#889b99';ctx.fillText('BERLIN / DUCTED FLIGHT SYSTEMS',256,108);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(size,size/4),new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
  mesh.position.set(...position);mesh.rotation.set(...rotation);parent.add(mesh);
}

export function createCyborgPigeon(){
  const aircraft=new THREE.Group();aircraft.name='PJN-01-armored-vtol';
  const b=new Builder(),wings=[],fans=[],legs=[],tailFeathers=[],exhausts=[],liftJets=[];
  const frame=b.mat('airframe-graphite','#24323c',{metalness:.7,roughness:.43});
  const armor=b.mat('airframe-titanium','#829499',{metalness:.65,roughness:.37});
  const edge=b.mat('airframe-edge','#b8c4c1',{metalness:.72,roughness:.32});
  const panel=b.mat('airframe-panels','#445761',{metalness:.6,roughness:.48});
  const black=b.mat('airframe-recess','#101c24',{metalness:.25,roughness:.63});
  const gold=b.mat('airframe-markings','#bba978',{metalness:.48,roughness:.46});
  const neckGreen=b.mat('neck-iridescent-green','#396e71',{metalness:.72,roughness:.3});
  const neckViolet=b.mat('neck-iridescent-violet','#555f7f',{metalness:.72,roughness:.32});
  const speedLight=b.mat('speed-light','#7ebed0',{emissive:'#79c4dc',emissiveIntensity:.7,roughness:.25,metalness:.15});
  const eye=b.mat('sensor-amber','#c89758',{emissive:'#eab777',emissiveIntensity:1.2});
  const engineLight=b.mat('engine-core','#5bacc0',{emissive:'#4fbed5',emissiveIntensity:1.1});
  const wingPaint=b.mat('adaptive-wing-coating','#49616f',{metalness:.7,roughness:.4});
  const glass=new THREE.MeshPhysicalMaterial({color:'#122e3a',metalness:.3,roughness:.14,clearcoat:1,clearcoatRoughness:.12});
  b.add(hullGeometry([[-2.05,.54,.57,.25],[-1.25,1.05,.92,.08],[0,1.35,1.06,0],[1.4,1.08,.78,-.05],[2.35,.5,.39,-.12]]),frame);
  // Layered breast and dorsal plates leave the structural dark seams exposed.
  for(const side of [-1,1]){
    const p=new Builder(),group=new THREE.Group();group.position.set(side*.67,.34,-.34);group.rotation.z=-side*.43;
    plate(p,[[-.44,-1.42],[.42,-1.28],[.58,-.2],[.42,1.53],[-.35,1.72],[-.53,.3]],.55,.12,armor,.07);
    plate(p,[[-.29,-1.05],[.27,-.97],[.34,.12],[.23,1.25],[-.22,1.35]],.70,.035,panel,.025);
    for(let i=0;i<5;i++)p.box(-.29,.745,-.8+i*.44,.07,.025,.12,edge);
    p.finish(group);aircraft.add(group);
    b.box(side*1.21,-.16,.72,.14,.42,1.2,panel,[0,0,-side*.12]);
    for(let i=0;i<5;i++)b.box(side*1.285,-.11,.3+i*.19,.035,.25,.065,black,[side*.2,0,0]);
    b.beam([side*.8,-.5,-1.15],[side*1.17,-.52,.92],.08,edge);
    b.box(side*.59,1.12,.45,.14,.055,1.55,edge);
  }
  plate(b,[[-.46,-.74],[.46,-.74],[.48,1.15],[.24,1.72],[-.24,1.72],[-.48,1.15]],1.05,.12,panel);
  for(let i=0;i<7;i++)b.box(0,1.23,.67+i*.11,.64,.035,.043,black);
  b.box(0,1.25,-.44,.5,.035,.09,gold);
  marking(aircraft,'PJN–01',[0,1.195,.10],[-Math.PI/2,0,0],.88);
  // Iridescent nape armor retains the distinctive pigeon neck and raised head.
  b.add(hullGeometry([[-2.47,.56,.6,.85],[-1.92,.74,.87,.55],[-1.37,.63,.76,.39]]),neckGreen);
  for(let row=0;row<3;row++)for(let i=0;i<7;i++){
    const a=(i-3)*.35;
    b.box(Math.sin(a)*(.64+row*.045),.8+Math.cos(a)*.28-row*.18,-1.7+row*.16,.23,.13,.36,(i+row)%2?neckGreen:neckViolet,[.18,0,-a*.65]);
  }
  b.add(hullGeometry([[-3.4,.43,.34,1.27],[-3.03,.77,.66,1.31],[-2.36,.83,.7,1.3],[-1.87,.56,.42,1.22]],16),armor);
  b.add(hullGeometry([[-3.54,.41,.24,1.25],[-3.19,.7,.38,1.32],[-2.91,.66,.36,1.31]],16),glass);
  b.box(0,1.73,-3.19,1.2,.065,.09,frame,[.1,0,0]);
  for(const side of [-1,1]){
    b.box(side*.71,1.84,-2.49,.17,.09,.61,panel,[0,side*.13,side*.15]);
    b.box(side*.82,1.13,-2.59,.095,.29,.8,frame,[0,side*.07,0]);
    b.cylinder(side*.846,1.49,-2.7,.19,.19,.09,black,20,[0,0,-side*Math.PI/2]);
    b.add(new THREE.TorusGeometry(.177,.034,6,20),edge,[side*.90,1.49,-2.7],[1,1,1],[0,side*Math.PI/2,0]);
    b.cylinder(side*.917,1.49,-2.7,.095,.095,.016,eye,16,[0,0,-side*Math.PI/2]);
    b.box(side*.87,1.66,-2.7,.04,.035,.42,frame);
    b.box(side*.68,1.02,-3.04,.13,.12,.34,edge,[0,-side*.12,0]);
  }
  const beak=new THREE.BufferGeometry();
  beak.setAttribute('position',new THREE.Float32BufferAttribute([
    -.35,1.23,-3.31, .35,1.23,-3.31, .07,1.16,-4.08, -.07,1.16,-4.08,
    0,1.44,-3.34, 0,1.27,-4.09, -.27,1.05,-3.36, .27,1.05,-3.36, 0,1.08,-4.02
  ],3));
  beak.setIndex([0,4,5,0,5,3,4,1,2,4,2,5,3,5,2,0,6,8,0,8,3,1,8,7,1,2,8,3,8,2]);
  beak.computeVertexNormals();b.add(beak,gold);
  b.box(0,1.16,-3.56,.55,.032,.54,frame,[.05,0,0]);

  for(const side of [-1,1]){
    const root=new THREE.Group();root.name=side<0?'port-wing':'starboard-wing';root.position.set(side*1.18,.1,-.15);
    const wb=new Builder(),mirrored=points=>points.map(([x,z])=>[side*x,z]);
    plate(wb,mirrored([[0,-.77],[1.13,-.91],[2.02,-.66],[2.03,.9],[1.3,1.19],[.08,.67]]),-.1,.2,armor,.05);
    plate(wb,mirrored([[.25,-.63],[1.14,-.7],[1.79,-.48],[1.77,.65],[1.3,.87],[.3,.48]]),.13,.045,panel);
    wb.cylinder(side*.13,.12,.02,.28,.28,.34,frame,16,[0,0,Math.PI/2]);
    wb.cylinder(side*.33,.12,.02,.15,.15,.08,edge,12,[0,0,Math.PI/2]);
    wb.beam([side*.32,.02,-.67],[side*1.96,.02,-.64],.07,edge);
    wb.beam([side*1.75,.03,-.69],[side*2.34,.03,-1.29],.10,frame);
    wb.beam([side*2.34,.03,-1.29],[side*3.79,.03,-1.48],.10,edge);
    wb.beam([side*3.79,.03,-1.48],[side*4.56,.03,-.8],.10,frame);
    for(let i=0;i<3;i++)wb.box(side*(.53+i*.28),.205,-.43,.10,.026,.37,gold,[0,-side*.28,0]);
    wb.box(side*1.31,-.32,-.26,.83,.42,1.08,frame);
    wb.box(side*1.31,-.25,-.27,.88,.09,1.13,armor);
    for(const x of [-.18,.18])for(const y of [-.1,.1]){
      wb.cylinder(side*1.31+x,-.32+y,-.824,.115,.115,.05,edge,12,[Math.PI/2,0,0]);
      wb.cylinder(side*1.31+x,-.32+y,-.858,.08,.08,.03,black,12,[Math.PI/2,0,0]);
    }
    // Twin four-cell flare dispensers sit beneath the aft wing roots.
    wb.box(side*1.12,-.46,1.55,.55,.38,.6,frame);
    wb.box(side*1.12,-.46,1.865,.57,.40,.045,armor);
    for(const dx of [-.13,.13])for(const dy of [-.085,.085]){
      wb.cylinder(side*1.12+dx,-.46+dy,1.895,.065,.065,.03,black,8,[Math.PI/2,0,0]);
    }
    wb.finish(root);
    const nacelle=new THREE.Group();nacelle.name='vectored-duct';nacelle.position.set(side*3.27,.11,-.12);
    const nb=new Builder();
    const profile=[[1.01,-.18],[1.12,-.24],[1.24,-.1],[1.27,.13],[1.17,.3],[1.04,.3],[1.01,.16],[1.01,-.18]].map(([x,y])=>new THREE.Vector2(x,y));
    nb.add(new THREE.LatheGeometry(profile,36),armor);
    nb.add(new THREE.TorusGeometry(1.055,.04,6,36),black,[0,.19,0],[1,1,1],[Math.PI/2,0,0]);
    nb.add(new THREE.TorusGeometry(1.19,.028,6,48),speedLight,[0,.27,0],[1,1,1],[Math.PI/2,0,0]);
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4;
      nb.box(Math.cos(a)*1.22,.085,Math.sin(a)*1.22,.18,.20,.30,i%2?frame:panel,[0,-a,0]);
    }
    for(let i=0;i<3;i++){
      const a=i*Math.PI*2/3;
      nb.beam([0,-.12,0],[Math.cos(a)*1.08,-.12,Math.sin(a)*1.08],.045,frame);
    }
    nb.cylinder(0,-.03,0,.28,.37,.3,frame,16);nb.finish(nacelle);
    const fan=new THREE.Group();fan.name='duct-fan';const fb=new Builder();
    for(let i=0;i<8;i++){
      const blade=new THREE.Shape([new THREE.Vector2(.17,-.045),new THREE.Vector2(.94,-.13),new THREE.Vector2(1.0,.035),new THREE.Vector2(.31,.115)]);
      const geometry=new THREE.ExtrudeGeometry(blade,{depth:.022,bevelEnabled:false});
      fb.add(geometry,panel,[0,0,0],[1,1,1],[-Math.PI/2,0,i*Math.PI/4]);
    }
    fb.cylinder(0,.025,0,.20,.29,.20,edge,16);fb.cylinder(0,.135,0,.1,.12,.065,gold,12);
    fb.finish(fan);fan.position.y=.1;nacelle.add(fan);fans.push({fan,side});root.add(nacelle);
    const feathers=[];
    for(let i=0;i<6;i++){
      const feather=new THREE.Group();feather.name=`primary-${i}`;feather.position.set(side*(.42+i*.72),.015,.84+Math.min(i,3)*.13);
      const pb=new Builder(),length=2.05-i*.13;
      plate(pb,[[-.32,-.15],[.31,-.15],[.28,length-.26],[.06,length],[-.24,length-.17]],0,.10,frame,.035);
      plate(pb,[[-.25,.06],[.245,.06],[.20,length-.32],[.04,length-.10],[-.17,length-.25]],.12,.035,wingPaint,.02);
      plate(pb,[[-.18,.24],[-.10,.24],[-.10,length-.47],[-.16,length-.32]],.162,.008,speedLight,.005);
      pb.box(.13,.169,.29,.12,.018,.04,frame);pb.box(.13,.169,.42,.12,.018,.04,frame);
      pb.cylinder(0,.10,-.02,.11,.11,.6,frame,12,[0,0,Math.PI/2]);
      pb.finish(feather);root.add(feather);feathers.push(feather);
    }
    aircraft.add(root);wings.push({root,nacelle,feathers,side});
    const leg=new THREE.Group();leg.name=side<0?'port-talon':'starboard-talon';leg.position.set(side*.75,-.68,.15);
    const lb=new Builder();
    lb.cylinder(0,0,0,.18,.18,.28,frame,12,[0,0,Math.PI/2]);
    lb.beam([0,0,0],[side*.19,-.58,.05],.10,armor);
    lb.beam([side*.19,-.58,.05],[side*.35,-1.08,-.24],.075,edge);
    lb.beam([side*.12,-.18,.19],[side*.32,-.92,-.11],.045,frame);
    lb.cylinder(side*.19,-.58,.05,.135,.135,.25,frame,12,[0,0,Math.PI/2]);
    for(let i=-1;i<=1;i++){
      lb.beam([side*.35,-1.11,-.18],[side*.35+i*.17,-1.16,-.62],.065,frame);
      lb.box(side*.35+i*.17,-1.18,-.64,.12,.09,.24,gold,[0,-i*.1,0]);
    }
    lb.finish(leg);aircraft.add(leg);legs.push(leg);
    const nozzle=new THREE.Group();nozzle.name=side<0?'port-afterburner':'starboard-afterburner';nozzle.position.set(side*.86,.52,1.92);
    const eb=new Builder();
    const jetProfile=[[.33,-.65],[.46,-.48],[.48,.18],[.37,.61],[.29,.61],[.36,.16],[.36,-.45],[.33,-.65]].map(([x,y])=>new THREE.Vector2(x,y));
    eb.add(new THREE.LatheGeometry(jetProfile,24),armor,[0,0,0],[1,1,1],[Math.PI/2,0,0]);
    eb.add(new THREE.TorusGeometry(.44,.045,6,24),frame,[0,0,-.38]);
    eb.add(new THREE.TorusGeometry(.35,.055,6,24),edge,[0,0,.61]);
    eb.cylinder(0,0,.47,.30,.30,.045,black,16,[Math.PI/2,0,0]);
    eb.add(new THREE.TorusGeometry(.23,.034,6,24),engineLight,[0,0,.50]);
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4;
      eb.box(Math.cos(a)*.44,Math.sin(a)*.44,-.05,.075,.075,.64,i%2?panel:frame,[0,0,a]);
      eb.box(Math.cos(a)*.38,Math.sin(a)*.38,.39,.065,.065,.34,edge,[0,0,a]);
    }
    eb.finish(nozzle);
    const flame=(radius,color)=>{
      const mesh=new THREE.Mesh(new THREE.ConeGeometry(radius,1,12),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
      mesh.geometry.translate(0,.5,0);mesh.rotation.x=Math.PI/2;mesh.position.z=.64;nozzle.add(mesh);return mesh;
    };
    const plume=flame(.39,'#6d92ff'),core=flame(.23,'#c4f3ff'),diamonds=[];
    const diamondGeometry=new THREE.OctahedronGeometry(1),diamondMaterial=new THREE.MeshBasicMaterial({color:'#e2faff',transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
    for(let i=0;i<4;i++){const mesh=new THREE.Mesh(diamondGeometry,diamondMaterial);nozzle.add(mesh);diamonds.push(mesh)}
    exhausts.push({plume,core,diamonds});aircraft.add(nozzle);
    // Fixed belly nozzles push along the airframe's up axis, independent of wing articulation.
    const liftNozzle=new THREE.Group();liftNozzle.name=side<0?'port-lift-thruster':'starboard-lift-thruster';
    liftNozzle.position.set(side*1.65,-.42,.35);
    const lbj=new Builder();
    const liftProfile=[[.24,.18],[.33,.08],[.29,-.25],[.23,-.35],[.18,-.35],[.22,-.08],[.24,.18]].map(([x,y])=>new THREE.Vector2(x,y));
    lbj.add(new THREE.LatheGeometry(liftProfile,12),armor);
    lbj.add(new THREE.TorusGeometry(.24,.045,4,12),edge,[0,-.35,0],[1,1,1],[Math.PI/2,0,0]);
    lbj.cylinder(0,-.28,0,.18,.18,.04,black,12);
    lbj.finish(liftNozzle);
    const sparks=new THREE.Group();sparks.name='lift-thruster-sparks';sparks.visible=false;
    const sb=new Builder(),sparkMaterial=new THREE.MeshBasicMaterial({color:'#c3e4ff',transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
    for(let i=0;i<3;i++){
      const a=i*Math.PI*2/3;
      const points=[[0,-.36,0],[Math.cos(a)*.19,-.46,Math.sin(a)*.19],
        [Math.cos(a+.5)*.12,-.61,Math.sin(a+.5)*.12],[Math.cos(a)*.35,-.79,Math.sin(a)*.35]];
      for(let j=1;j<points.length;j++)sb.beam(points[j-1],points[j],.018,sparkMaterial);
    }
    sb.finish(sparks);liftNozzle.add(sparks);
    const liftFlame=(radius,color)=>{
      const mesh=new THREE.Mesh(new THREE.ConeGeometry(radius,1,12),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
      mesh.geometry.translate(0,.5,0);mesh.rotation.z=Math.PI;mesh.position.y=-.37;mesh.visible=false;
      liftNozzle.add(mesh);return mesh;
    };
    const liftPlume=liftFlame(.27,'#69cfff'),liftCore=liftFlame(.14,'#e6ffff');
    liftJets.push({nozzle:liftNozzle,plume:liftPlume,core:liftCore,sparks,sparkMaterial});aircraft.add(liftNozzle);
  }
  const tail=new THREE.Group();tail.name='articulated-tail';tail.position.set(0,-.25,2.04);
  for(let i=-2;i<=2;i++){
    const feather=new THREE.Group();feather.position.x=i*.27;const tb=new Builder(),length=1.98-Math.abs(i)*.12;
    plate(tb,[[-.23,-.15],[.23,-.15],[.25,length-.22],[.08,length],[-.22,length-.12]],0,.095,frame);
    plate(tb,[[-.16,.1],[.15,.1],[.16,length-.28],[.05,length-.1],[-.14,length-.2]],.11,.035,armor,.02);
    tb.box(0,.16,length-.38,.25,.016,.06,gold);
    tb.finish(feather);tail.add(feather);tailFeathers.push({feather,index:i});
  }
  aircraft.add(tail);
  b.box(0,-.65,-1.72,.65,.37,.82,armor);
  b.cylinder(0,-.86,-1.84,.34,.34,.30,frame,16);
  b.finish(aircraft);
  const cannon=new THREE.Group();cannon.name='chin-cannon';const cb=new Builder();
  cb.cylinder(0,0,0,.24,.32,1.65,frame,16,[Math.PI/2,0,0]);
  cb.cylinder(0,0,-.25,.26,.26,.5,panel,16,[Math.PI/2,0,0]);
  for(const z of [-.76,-.47,.43])cb.add(new THREE.TorusGeometry(.24,.043,6,20),edge,[0,0,z]);
  cb.cylinder(0,0,-.84,.15,.15,.025,black,16,[Math.PI/2,0,0]);
  cb.box(0,.25,-.21,.12,.06,.85,armor);cb.finish(cannon);cannon.position.set(0,-.92,-2.36);aircraft.add(cannon);

  const motion={speed:0,pitch:0,bank:0,yaw:0,gear:1,brake:0,afterburner:0};
  const forward=new THREE.Vector3(),euler=new THREE.Euler(),cool=new THREE.Color('#79bed3'),warm=new THREE.Color('#d7b778'),hot=new THREE.Color('#e87b56'),lampColor=new THREE.Color();
  const paintCool=new THREE.Color('#49616f'),paintHot=new THREE.Color('#746451');
  let recoil=0,previousSpeed=0;
  aircraft.userData.motion=motion;
  aircraft.userData.fire=weapon=>{if(weapon!==3)recoil=weapon===2?.10:.22};
  aircraft.userData.animate=(time,state,dt)=>{
    if(dt<=0)return;
    const speed=state.velocity.length(),ratio=THREE.MathUtils.clamp(speed/95,0,1),collective=state.collective;
    forward.set(0,0,-1).applyQuaternion(state.orientation);euler.setFromQuaternion(state.orientation,'YXZ');
    const pitch=Math.asin(THREE.MathUtils.clamp(forward.y,-1,1));
    const targets={
      speed:ratio,pitch:THREE.MathUtils.clamp(pitch*.35+state.angularVelocity.x*.14,-.4,.4),
      bank:THREE.MathUtils.clamp(Math.sin(euler.z)*.16+state.angularVelocity.z*.22,-.5,.5),
      yaw:THREE.MathUtils.clamp(state.angularVelocity.y*.2,-.35,.35),
      gear:1-THREE.MathUtils.smoothstep(speed,5,24),
      afterburner:state.crashed?0:state.afterburner||0,
      brake:dt>0?THREE.MathUtils.clamp((previousSpeed-speed)/dt/24,0,1):0
    };
    for(const key of Object.keys(motion))motion[key]=THREE.MathUtils.damp(motion[key],targets[key],key==='gear'?3:key==='afterburner'?14:5,dt);
    previousSpeed=speed;
    for(const {root,nacelle,feathers,side}of wings){
      root.rotation.y=-side*(.02+motion.speed*.16)+motion.yaw*.06;
      root.rotation.z=side*(.075-motion.speed*.10)-motion.bank*.055;
      nacelle.rotation.x=THREE.MathUtils.clamp(motion.pitch*.65+motion.speed*.20,-.3,.3);
      nacelle.rotation.z=-motion.bank*.18;
      for(let i=0;i<feathers.length;i++){
        const feather=feathers[i];
        feather.rotation.x=motion.pitch+side*motion.bank*(.5+i*.1)-motion.brake*.35;
        feather.rotation.y=-side*(.03+i*.023)*(1-motion.speed*.65)+motion.yaw*.12;
        feather.rotation.z=side*(.035+i*.009)*(1-motion.speed)-motion.brake*side*.07;
      }
    }
    for(const {fan,side}of fans)fan.rotation.y+=dt*(31+collective*18)*side;
    legs.forEach(leg=>{leg.rotation.x=-(1-motion.gear)*1.52;leg.position.y=-.68+(1-motion.gear)*.25});
    tail.rotation.x=.04-motion.pitch*.75-motion.brake*.24;
    tail.rotation.y=motion.yaw*.8;tail.rotation.z=-motion.bank*.24;
    for(const {feather,index}of tailFeathers)feather.rotation.y=index*(.14-motion.speed*.07+motion.brake*.05);
    lampColor.copy(cool).lerp(warm,THREE.MathUtils.smoothstep(motion.speed,.12,.72)).lerp(hot,THREE.MathUtils.smoothstep(motion.speed,.72,1));
    speedLight.color.copy(lampColor);speedLight.emissive.copy(lampColor);speedLight.emissiveIntensity=.6+motion.speed*1.3;
    wingPaint.color.copy(paintCool).lerp(paintHot,motion.speed*.8);
    engineLight.color.copy(cool).lerp(warm,motion.afterburner);engineLight.emissive.copy(engineLight.color);
    engineLight.emissiveIntensity=.6+motion.speed*1.7+Math.max(0,collective-1)*.2+motion.afterburner*3;
    exhausts.forEach(({plume,core,diamonds},i)=>{
      const power=motion.afterburner,pulse=1+Math.sin(time*31+i*2)*.045,width=.45+power*.7;
      plume.scale.set(width,(.14+motion.speed*.55+power*5)*pulse,width);
      plume.material.opacity=.13+motion.speed*.13+power*.3;
      core.scale.set(width,(.10+motion.speed*.3+power*3.8)*pulse,width);
      core.material.opacity=power*.75;core.visible=power>.01;
      diamonds.forEach((diamond,j)=>{
        diamond.visible=power>.03;diamond.position.z=.64+(.8+j*.85)*power;
        const r=power*(.14-j*.015);diamond.scale.set(r,r,r*2.3*pulse);
      });
      diamonds[0].material.opacity=power*.65;
    });
    const liftPower=state.crashed?0:Math.min(1,(state.thrusters?.flash||0)/THRUSTERS.flash);
    const sparkPower=state.crashed?0:Math.min(1,(state.thrusters?.spark||0)/THRUSTERS.spark);
    for(const {plume,core,sparks,sparkMaterial} of liftJets){
      plume.visible=core.visible=liftPower>0;
      plume.scale.set(1,.4+liftPower*1.9,1);core.scale.set(1,.25+liftPower*1.3,1);
      plume.material.opacity=liftPower*.65;core.material.opacity=liftPower*.95;
      sparks.visible=sparkPower>0;
      sparks.rotation.y=(state.thrusters?.misfires||0)*2.399+(1-sparkPower)*2;
      sparkMaterial.opacity=sparkPower*(.45+.55*Math.abs(Math.cos((1-sparkPower)*Math.PI*3)));
    }
    recoil*=Math.exp(-dt*17);cannon.position.z=-2.36+recoil;
  };
  aircraft.userData.getAppearance=()=>({
    ...motion,wingColor:`#${speedLight.color.getHexString()}`,
    wings:wings.map(w=>({rotation:w.root.rotation.toArray().slice(0,3),duct:w.nacelle.rotation.toArray().slice(0,3),feathers:w.feathers.map(f=>f.rotation.x)})),
    tail:tail.rotation.toArray().slice(0,3),gear:legs.map(l=>l.rotation.x),
    afterburners:exhausts.map(({plume,core})=>({length:plume.scale.y,coreVisible:core.visible})),
    thrusters:liftJets.map(({plume,sparks})=>({active:plume.visible,length:plume.scale.y,sparking:sparks.visible}))
  });
  return aircraft;
}
