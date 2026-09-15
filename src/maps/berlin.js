import { createWorld } from '../world.js';
import { OFFICE_Y, ROOF_Y, TERRACE } from '../geometry.js';
import { BRIDGE, STATION, bridgePoint } from '../landmarks.js';
import data from '../neighborhood-data.json';

export function createMap(scene) {
  return {
    ...createWorld(scene), id:'berlin', data, officeY:OFFICE_Y, roofY:ROOF_Y,
    terrace:TERRACE, storageKey:'little-wings-crumbs-v1', riverWidth:143,
    theme:{background:'#dce7e1',fog:'#dce7d9',fogNear:430,fogFar:1350,sky:'#e3f0f3',ground:'#b9ad8c',sun:'#fff0d4',exposure:1.03},
    pigeonSpawn:[44,OFFICE_Y+15,66],pigeonYaw:.55,vtolSpawn:[110,110,115],vtolYaw:.72,
    nearOffice:p=>Math.abs(p.x)<30&&p.z>-23&&p.z<34&&p.y>OFFICE_Y-.5&&p.y<OFFICE_Y+5,
    inside:p=>Math.abs(p.x)<21.8&&Math.abs(p.z)<16.8&&p.y>OFFICE_Y&&p.y<OFFICE_Y+3.94,
    waypointLabel:'THE OPEN TERRACE',officeLabel:'Visit the office',zone:'Friedrichshain',
    questHint:'Follow the golden crumbs to the open terrace.',lateHint:'Try the roof garden and the towers of Oberbaum Bridge.',
    mapLabels:[['EDGE',0,-22],['S + U',120,-60],['Oberbaumbrücke',-65,550],['Spree',-230,420]],
    minimapOffset:180,landmarks:{bridge:BRIDGE,station:STATION},
    location(p,inside,near){
      return inside?'Amazon · the shared workspace':near?'EDGE · the open terrace':p.y>128&&Math.abs(p.x)<30&&Math.abs(p.z)<30?'EDGE · roof garden':Math.hypot(p.x-BRIDGE.x,p.z-BRIDGE.z)<135?'Oberbaumbrücke · the Spree':Math.hypot(p.x-93,p.z+67)<150?'Warschauer Straße · S + U':p.z>380?'Above the Spree':'Above Friedrichshain';
    },
    jump(where,mode){
      if(mode==='vtol'){
        if(where==='roof')return{position:[5.5,ROOF_Y+18,25],yaw:0};
        if(where==='station')return{position:[150,38,-26],yaw:.78};
        if(where==='bridge'){const p=bridgePoint(-70,-65,44);return{position:p.toArray(),yaw:Math.atan2(p.x-BRIDGE.x,p.z-BRIDGE.z)}}
        return{position:[110,110,115],yaw:.72};
      }
      if(where==='roof')return{position:[5.5,ROOF_Y+2.2,11.5],yaw:0,message:'A roof garden, a little breeze, and all of Berlin.'};
      if(where==='station')return{position:[150,19,-26],yaw:.78,message:'Warschauer Straße. Watch the trains come and go.'};
      if(where==='bridge'){const p=bridgePoint(-64,-65,27);return{position:p.toArray(),yaw:Math.atan2(p.x-BRIDGE.x,p.z-BRIDGE.z),message:'Oberbaumbrücke. Follow the yellow train across the Spree.'}}
      return{position:[12,OFFICE_Y+1.95,26.5],yaw:0,message:'The doors are open. Tap Space to flap through.'};
    },
    crumbPositions:[
      [12,OFFICE_Y+2,30],[12,OFFICE_Y+1.8,20],[12,OFFICE_Y+1.8,13],
      [10,OFFICE_Y+1.9,7.7],[3,OFFICE_Y+1.9,4],[-8,OFFICE_Y+1.9,4],
      [-14,OFFICE_Y+1.9,-3],[18,OFFICE_Y+2,-11],
      [-31,OFFICE_Y+7,25],[32,OFFICE_Y+15,-4],[5.5,ROOF_Y+1.7,10],bridgePoint(-6,0,10).toArray(),
    ],
  };
}
