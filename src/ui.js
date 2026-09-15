import { MAPS } from './maps/catalog.js';
import { FLIGHT } from './flight.js';
import { VTOL } from './vtol-flight.js';
import { PILOT_DEFAULTS, PILOT_RANGES } from './pilot-settings.js';
import { updateSoundButton } from './sound-settings.js';
import { createMinimapPaths,drawMinimapPaths,NEON_MINIMAP_COLORS } from './minimap-paths.js';
import { WEAPON_SLOTS } from './poop-cannon.js';
import { THRUSTERS } from './vtol-thrusters.js';

const $=id=>document.getElementById(id);
export const controls=`
  <div class="modal-eyebrow">A FEW SMALL FLAPS</div>
  <h2 id="modal-title">Make yourself at home.</h2>
  <p>Every tap of Space is one wingbeat and a little more speed. Keep tapping to reach up to 500 km/h outside. Tiny wing jets deploy above 100 km/h. Stop flapping and you’ll gradually glide to a hover. Holding Space produces only one flap.</p>
  <div class="control-grid">
    <div><kbd>W</kbd><kbd>S</kbd> Aim up / down</div>
    <div><kbd>A</kbd><kbd>D</kbd> Turn left / right</div>
    <div><kbd>Space</kbd> Flap to gain speed</div>
    <div><kbd>Shift</kbd> Brake</div>
    <div><kbd>E</kbd> Perch / take off</div>
    <div><kbd>R</kbd> Return to terrace</div>
    <div><kbd>B</kbd> A friendly coo</div>
    <div><kbd>Esc</kbd> Pause / resume</div>
    <div>Drag the scene to look around</div>
  </div>
  <p class="modal-note">Steering changes direction only. Hold W and tap Space to climb; hold S and tap Space to dive. C or Ctrl also brakes. Flaps are gentler near the office. Find twelve golden crumbs, explore the station and bridge, or perch somewhere sunny. On touch screens, tap Flap while holding an arrow to steer. Progress saves on this device.</p>`;

const pilotSlider=(key,label,description)=>{
  const range=PILOT_RANGES[key];
  return `<label for="vtol-${key}">${label}<output id="${key}-value" for="vtol-${key}"></output>
    <input id="vtol-${key}" data-pilot-setting="${key}" type="range" min="${range.min}" max="${range.max}" step="${range.step}" aria-describedby="${key}-description">
    <small id="${key}-description" class="setting-description">${description}</small></label>`;
};
const pilotDisplay=(key,value)=>key.startsWith('camera')?`${Number(value.toFixed(1))} m`:`${value.toFixed(2)}×`;
const vtolControls=`
  <div class="modal-eyebrow">PJN–01 · HELICOPTER FLIGHT</div>
  <h2 id="modal-title">Make it fly your way.</h2>
  <p>Adjust the feel, then resume and click the scene to fly. Defaults: 1× agility and 1.5× motion inertia.</p>
  <div class="flight-settings">
    ${pilotSlider('agility','Agility','Higher turns, pitches and rolls faster, with a quicker response. Lower feels more deliberate.')}
    ${pilotSlider('inertia','Motion inertia','Higher carries momentum longer in every direction. Lower slows the drift sooner. Counter-pitch to brake.')}
  </div>
  <details class="pilot-details" id="camera-settings">
    <summary>Chase camera <span>Distance & height</span></summary>
    <div class="flight-settings">
      ${pilotSlider('cameraDistance','Distance behind pigeon','Move closer for a larger pigeon, or farther back for more of the surroundings.')}
      ${pilotSlider('cameraHeight','Height above pigeon','Lower for a view just behind the wings; raise it to see more of the ground.')}
    </div>
  </details>
  <details class="pilot-details" id="mouse-settings">
    <summary>Mouse controls <span>Sensitivity & inversion</span></summary>
    <div class="flight-settings">
      ${pilotSlider('sensitivity','Mouse sensitivity','Adjust how much mouse movement steers. Agility also affects keyboard steering.')}
      <label><input id="invert-vtol" type="checkbox"> Inverted mouse Y <small>Pull back to pitch up</small></label>
    </div>
  </details>
  <div class="pilot-reset-row"><span>Settings save on this device.</span><button type="button" id="reset-pilot" class="text-button">Restore defaults ↺</button></div>
  <details class="pilot-details">
  <summary>How to fly <span>Keys & flying tips</span></summary>
  <p>Hold W in level flight to climb quickly, or S to descend quickly. Lower the nose to dive; holding W drives the dive faster. Bank to move sideways. A / D yaws the nose. To brake or recover height, gently pitch back, then level out. Releasing the mouse holds your attitude; it does not level the aircraft.</p>
  <div class="control-grid">
    <div><kbd>W</kbd><kbd>S</kbd> Throttle up / down</div>
    <div><kbd>A</kbd><kbd>D</kbd> Yaw left / right</div>
    <div><kbd>Shift</kbd> Hold for twin afterburners</div>
    <div><kbd>Q</kbd> Tap for a lift-thruster boost</div>
    <div><kbd>X</kbd> Deploy flares</div>
    <div>Mouse forward / back · Pitch</div>
    <div>Mouse left / right · Roll</div>
    <div><kbd>LMB</kbd> Fire selected weapon</div>
    <div><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> Cannon / rocket / bomb</div>
    <div><kbd>RMB</kbd> Chase: freelook / Cockpit: 1.25× zoom</div>
    <div><kbd>C</kbd> Cockpit / chase view</div>
    <div><kbd>R</kbd> Reload selected weapon</div>
    <div><kbd>↑</kbd><kbd>↓</kbd> Nose down / up</div>
    <div><kbd>←</kbd><kbd>→</kbd> Roll left / right</div>
    <div><kbd>Space</kbd> Hold for aggressive pitch up</div>
    <div><kbd>E</kbd> Hold for aggressive pitch down</div>
    <div><kbd>Esc</kbd> Release mouse / pause</div>
  </div>
  <p>Hold either Shift key to fire both afterburners and accelerate in the direction the nose points, easing toward 500 km/h. Release to cut jet thrust and coast; pitch back to brake. Press X for a burst of eight flares; the dispensers are ready again after three seconds. W / S still controls lift. Mouse roll has twice the previous response. At level attitude, neutral throttle sustains a hover. A low nose sheds height quickly, especially under power; raise it to recover. Momentum carries through yaw turns. Your rotor ducts and airframe need helicopter-sized clearance.</p>
  <p>Hold Space to pitch up continuously, or E to pitch down, at the normal maximum pitch rate. Release to stop turning; your attitude stays where you leave it. These keys follow nose direction regardless of mouse inversion. Holding Space and E cancels their input.</p>
  <p>Tap Q for a powerful lift-thruster boost: ${THRUSTERS.charges} charges, at least ${THRUSTERS.interval} seconds between taps. One charge automatically refills every ${THRUSTERS.recharge} seconds, starting with the first pulse. Remaining charges stay usable and further pulses do not delay recharge. Holding Q fires once. Pressing Q with no charges produces an electrical spark and a failed-ignition crackle. Each pulse adds roughly 50 m of lift as you coast from a level hover at default inertia. The thrusters push along the airframe’s up axis: bank to boost sideways, or invert to boost downward. Momentum and gravity still apply.</p>
  <p>Hard impacts explode the airframe and rebuild it in clear air after two seconds. Approach surfaces gently. Weapon 1 fires 20 rapid poop rounds, then automatically reloads for 2 seconds. Weapon 2 carries 8 robotic pigeon rockets, then reloads for 4 seconds. Rockets accelerate quickly along a straight flight path with no drop and a 6.5 m splash. Weapon 3 drops 4 heavy poop bombs, then reloads for 5 seconds. Bombs carry your momentum, fall under gravity and burst with 200 direct mess and a 16 m splash. Fly over the target and left click to release; the reticle is a flight reference while bombs are selected. Press R to reload the selected weapon early. Reloading continues when you switch weapons.</p>
  <p class="modal-note">Classic Battlefield-style controls with original handling tuning. Public references do not establish identical Battlefield physics. This mode is designed for PC keyboard and mouse.</p>
  </details>`;
const vtolBar='<span><kbd>W</kbd><kbd>S</kbd> Lift</span><span><kbd>A</kbd><kbd>D</kbd> Yaw</span><span>Mouse · Pitch / roll</span><span><kbd>Space</kbd> Pitch ↑</span><span><kbd>E</kbd> Pitch ↓</span><span><kbd>Shift</kbd> Boost</span><span><kbd>X</kbd> Flares</span><span><kbd>Q</kbd> Thrust</span><span><kbd>LMB</kbd> Fire / drop</span><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> Weapons</span><span><kbd>R</kbd> Reload</span><span><kbd>RMB</kbd> Look / zoom</span><span><kbd>C</kbd> View</span>';

export class UI {
  constructor(actions,map,signal){
    this.map=map;const meta=MAPS[map.id];
    this.minimapPaths=createMinimapPaths(map.data,map.buildings,map.riverWidth);
    this.thrusterPips=[...document.querySelectorAll('.thruster-charges i')];
    document.querySelector('.canopy-ident small').textContent=`${meta.city.toUpperCase()} · ${meta.district.toUpperCase()}`;
    $('office-jump').innerHTML=`<span>⌂</span> ${map.officeLabel}`;
    $('office-jump').title=map.officeLabel;
    $('station-jump').title=map.id==='berlin'?'Warschauer Straße':'Frankfurt Hauptbahnhof';
    $('bridge-jump').title=map.id==='berlin'?'Oberbaumbrücke':'Untermainbrücke';
    $('waypoint').querySelector('div').firstChild.textContent=map.waypointLabel;
    $('world').setAttribute('aria-label',`3D pigeon flight around ${meta.tower}, ${meta.city}`);
    this.actions=actions;this.toastTimer=null;this.dialogType=null;
    this.mode='pigeon';this.normalBar=document.querySelector('.controls-bar').innerHTML;
    this.normalControls=controls;
    if(map.id==='frankfurt'){
      this.normalBar=this.normalBar.replace('Terrace','Plaza');
      this.normalControls=controls.replace('Return to terrace','Return to the plaza').replace('Flaps are gentler near the office. ','');
    }
    this.modal=$('modal');
    $('start').onclick=()=>actions.start();
    $('start-vtol').onclick=()=>actions.start('vtol');
    $('mode-switch').onclick=()=>actions.start(this.mode==='vtol'?'pigeon':'vtol');
    $('help').onclick=()=>this.open('help');
    $('pause').onclick=()=>this.open('pause');
    $('close-modal').onclick=()=>this.close();
    $('office-jump').onclick=()=>actions.teleport('office');
    $('roof-jump').onclick=()=>actions.teleport('roof');
    $('station-jump').onclick=()=>actions.teleport('station');
    $('bridge-jump').onclick=()=>actions.teleport('bridge');
    $('home').onclick=e=>{e.preventDefault();actions.home()};
    $('sound').onclick=()=>actions.sound();
    for(const slot of WEAPON_SLOTS)$(`weapon-${slot}`).onclick=()=>actions.selectWeapon(slot);
    this.setSound(false);
    this.modal.addEventListener('cancel',e=>{e.preventDefault();this.close()},{signal});
    this.modal.addEventListener('click',e=>{if(e.target===this.modal){const r=this.modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)this.close()}},{signal});
  }
  showGame(){
    for(const id of ['welcome','welcome-footer','scene-label'])$(id).classList.add('hidden');
    for(const id of ['hud','pause'])$(id).classList.remove('hidden');
    document.body.classList.add('playing');
  }
  showHome(){
    this.clearPlayerHit();
    this.close();
    for(const id of ['welcome','welcome-footer','scene-label'])$(id).classList.remove('hidden');
    for(const id of ['hud','pause','waypoint'])$(id).classList.add('hidden');
    document.body.classList.remove('playing','vtol-mode','weapon-reloading');this.setCockpit(false);
    document.querySelector('.controls-bar').innerHTML=this.normalBar;
  }
  setMode(mode){
    this.clearPlayerHit();this.integrity(100);
    this.mode=mode;document.body.classList.toggle('vtol-mode',mode==='vtol');
    this.setCockpit(false);
    $('mode-switch').textContent=mode==='vtol'?'Small pigeon':'Cyborg VTOL';
    $('map-title').textContent=mode==='vtol'?'NAVIGATION':'YOUR LITTLE WORLD';
    $('minimap').setAttribute('aria-label',mode==='vtol'?'Navigation map showing the aircraft and city landmarks':'Map showing the pigeon, tower, and remaining crumbs');
    document.querySelector('.controls-bar').innerHTML=mode==='vtol'?vtolBar:this.normalBar;
  }
  setCockpit(enabled){
    document.body.classList.toggle('cockpit',enabled);
    if(!enabled){$('cockpit-aim').classList.add('hidden');this.setZoom(false)}
  }
  setZoom(zoomed){
    if(this.zoomed===zoomed)return;
    this.zoomed=zoomed;document.body.classList.toggle('cockpit-zoomed',zoomed);
    $('cockpit-zoom').textContent=zoomed?'OPTICS 1.25×':'OPTICS 1.00×';
  }
  setCapture(captured){
    $('vtol-capture-hint').classList.toggle('hidden',captured);
    if(captured){clearTimeout(this.toastTimer);$('toast').classList.add('hidden')}
  }
  weapon(cannon){
    const spec=cannon.weapon;
    $('weapon-name').textContent=spec.name.toUpperCase();
    for(const slot of WEAPON_SLOTS)$(`weapon-${slot}`).setAttribute('aria-pressed',String(spec.id===slot));
    this.ammo(cannon);
  }
  ammo(cannon){
    const spec=cannon.weapon,reload=cannon.reloadRemaining;
    $('weapon-ammo').textContent=`${cannon.ammo} / ${spec.magazine}`;
    $('weapon-hint').textContent=reload>0?`Reloading · ${reload.toFixed(1)} s`:spec.explosive?`${spec.damage} mess · ${spec.splashRadius} m splash${spec.id===3?' · Gravity drop':''}`:'10 mess · Rapid fire';
    $('ammo-fill').style.width=`${100*(reload>0?1-reload/spec.reload:cannon.ammo/spec.magazine)}%`;
    document.body.classList.toggle('weapon-reloading',reload>0);
    $('cockpit-weapon').textContent=`${spec.id} / ${spec.short} ${cannon.ammo}/${spec.magazine}${reload>0?` · RELOAD ${reload.toFixed(1)}s`:''}`;
  }
  thrusters(state){
    const label=`Q · THRUST ${state.charges}/${THRUSTERS.charges}`;
    const next=state.recharge>0?`+1 ${state.recharge.toFixed(1)}s`:'READY';
    for(const id of ['thruster-status','cockpit-thrusters']){
      $(id).textContent=id==='cockpit-thrusters'&&state.recharge>0?`${label} · ${next}`:label;
      $(id).classList.toggle('cooling',state.charges===0);
      $(id).classList.toggle('firing',state.flash>0);
      $(id).classList.toggle('misfire',state.spark>0);
      $(id).setAttribute('aria-label',`Lift thrusters: ${state.charges} of ${THRUSTERS.charges} charges${state.recharge>0?`; next charge in ${state.recharge.toFixed(1)} seconds`:''}`);
    }
    $('thruster-recharge').textContent=next;
    this.thrusterPips.forEach((pip,i)=>{
      const fill=i<state.charges?1:i===state.charges?1-state.recharge/THRUSTERS.recharge:0;
      pip.classList.toggle('charged',i<state.charges);
      pip.style.setProperty('--charge',String(fill));
    });
  }
  crash(remaining){
    const crashed=remaining>0;
    if(crashed&&!this.crashed){clearTimeout(this.toastTimer);$('toast').classList.add('hidden')}
    this.crashed=crashed;
    document.body.classList.toggle('vtol-crashed',crashed);
    $('crash-overlay').classList.toggle('hidden',!crashed);
    if(crashed)$('respawn-countdown').textContent=`Rebuilding · ${remaining.toFixed(1)} s`;
  }
  hit(){
    $('vtol-reticle').classList.add('hit');clearTimeout(this.hitTimer);
    this.hitTimer=setTimeout(()=>$('vtol-reticle').classList.remove('hit'),180);
  }
  integrity(health){
    health=Math.max(0,Math.min(100,health));
    if(this.health===health)return;
    this.health=health;
    $('vtol-health').textContent=`${Math.ceil(health)}%`;
    $('vtol-integrity').setAttribute('aria-valuenow',String(health));
    $('vtol-integrity').style.setProperty('--integrity-hue',String(Math.max(0,(health-20)/80)*140));
    $('integrity-fill').style.transform=`scaleX(${health/100})`;
  }
  playerHit(health){
    this.integrity(health);
    this.clearPlayerHit();
    this.playerHitAnimation=$('player-hit-overlay').animate([{opacity:1},{opacity:0}],{duration:650,easing:'ease-out'});
  }
  clearPlayerHit(){
    this.playerHitAnimation?.cancel();this.playerHitAnimation=null;
  }
  loaded(){$('loading').classList.add('hidden')}
  toast(text,time=3500){
    clearTimeout(this.toastTimer);$('toast').textContent=text;$('toast').classList.remove('hidden');
    this.toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),time);
  }
  setSound(enabled){
    updateSoundButton($('sound'),enabled);
  }
  open(type){
    this.dialogType=type;this.actions.pause(true);
    const content=type==='help'?(this.mode==='vtol'?vtolControls:this.normalControls):this.mode==='vtol'?`
      ${vtolControls}<div class="modal-buttons"><button class="primary-button" id="resume">Back to the cockpit ↗</button><button class="secondary-button" id="return-pigeon">Small pigeon</button></div>`:type==='complete'?`
      <div class="modal-eyebrow">A VERY GOOD DAY TO BE A BIRD</div><span class="celebration">✦</span>
      <h2 id="modal-title">Every last little crumb.</h2><p>Twelve treasures. One very happy pigeon. The city is still yours to explore — find a sunny perch and stay a while.</p>
      <div class="modal-buttons"><button class="primary-button" id="resume">Keep exploring ↗</button><button class="secondary-button" id="reset">Fresh crumbs</button></div>`:`
      <div class="modal-eyebrow">TAKE A BREATHER</div><h2 id="modal-title">A moment on the ledge.</h2><p>Your little world can wait. Pick up where you left off whenever you’re ready.</p>
      <div class="modal-buttons"><button class="primary-button" id="resume">Back to the breeze ↗</button><button class="secondary-button" id="reset">Fresh crumbs</button></div><p class="modal-note">Space to flap · W / S aim up / down · A / D turn · Shift brake · E perch · R return.</p>`;
    $('modal-content').innerHTML=content+(type==='pause'?'<div class="benchmark-menu"><button class="secondary-button" id="run-benchmark">30-second benchmark flight ↗</button><p>Automatic VTOL route · 5s warm-up · FPS, frame times & rendering workload. Restarts at spawn afterward.</p></div><button class="text-button" id="change-city">← Change city</button>':'');
    if($('run-benchmark'))$('run-benchmark').onclick=()=>this.actions.benchmark();
    if($('change-city'))$('change-city').onclick=()=>this.actions.home();
    if(!this.modal.open)this.modal.showModal();
    const resume=$('resume'),reset=$('reset');
    if(resume)resume.onclick=()=>this.close();
    if(reset)reset.onclick=()=>{this.actions.reset();this.close()};
    if($('return-pigeon'))$('return-pigeon').onclick=()=>{this.close();this.actions.start('pigeon')};
    if($('invert-vtol')){
      const syncSettings=()=>{
        const settings=this.actions.vtolSettings();
        $('invert-vtol').checked=settings.invert;
        for(const key of Object.keys(PILOT_RANGES)){
          $(`vtol-${key}`).value=settings[key];
          $(`${key}-value`).textContent=pilotDisplay(key,settings[key]);
        }
      };
      syncSettings();
      $('invert-vtol').onchange=e=>this.actions.configureVTOL({invert:e.target.checked});
      for(const key of Object.keys(PILOT_RANGES))$(`vtol-${key}`).oninput=e=>{
        this.actions.configureVTOL({[key]:Number(e.target.value)});syncSettings();
      };
      $('reset-pilot').onclick=()=>{
        this.actions.configureVTOL(PILOT_DEFAULTS);syncSettings();this.toast('Default flight feel and camera restored.');
      };
    }
  }
  close(){this.modal.close();this.dialogType=null;this.actions.pause(false)}
  progress(count,inside){
    $('crumb-count').textContent=`${count} / 12`;$('quest-progress').style.width=`${count/12*100}%`;
    $('quest-hint').textContent=count===12?'All crumbs found. The rest of the day is yours.':inside?'A few crumbs escaped around the desks and coffee area.':count>=8?this.map.lateHint:this.map.questHint;
  }
  update(p,speed,inside,nearOffice,perched,flapAge){
    $('altitude').textContent=`${Math.round(p.y)} m`;
    $('speed').textContent=Math.round(speed*3.6);
    $('location').textContent=this.map.location(p,inside,nearOffice);
    $('zone-label').textContent=inside?'Office':this.map.zone;
    $('flight-state').textContent=perched?'A NICE PLACE TO PERCH':speed>FLIGHT.jetSpeed?'WING JETS DEPLOYED':flapAge<.42?'ONE LITTLE WINGBEAT':speed===0?'HOVERING':'GLIDING';
    $('momentum-fill').style.width=`${Math.min(1,speed/FLIGHT.maxSpeed)*100}%`;
    $('flight-note').textContent=perched?'Tap Space when you’re ready.':speed===0?'One small flap starts your journey.':'Stop flapping to slow down. Shift to brake.';
  }
  updateVTOL(state,attitude,cannon,cockpit,armed,flareCooldown=0){
    this.integrity(state.health);
    this.thrusters(state.thrusters);
    const speed=state.velocity.length();this.update(state.position,speed,false,false,false,Infinity);
    $('flight-state').textContent=state.crashed?'AIRFRAME LOST':!armed?'AWAITING PILOT':state.afterburner>0?'TWIN AFTERBURNERS':state.grounded?'ON THE GROUND':speed<.5?'STABLE HOVER':'VTOL FLIGHT';
    $('flight-note').textContent=state.afterburner>0?'Release Shift to coast. Counter-pitch to brake.':'Shift to boost. Counter-pitch to brake.';
    $('momentum-fill').style.width=`${Math.min(1,speed/VTOL.maxSpeed)*100}%`;
    $('collective').textContent=`${Math.round(state.collective*100)}%`;
    $('vertical-speed').textContent=`${state.velocity.y>=0?'+':''}${state.velocity.y.toFixed(1)} m/s`;
    const pitch=attitude.pitch*180/Math.PI,roll=attitude.roll*180/Math.PI;
    const heading=((Math.round((this.map.data.origin.rotation-attitude.yaw)*180/Math.PI)%360)+360)%360;
    $('flight-heading').textContent=`${heading.toString().padStart(3,'0')}°`;
    $('vtol-pitch').textContent=`${Math.round(pitch)}°`;$('vtol-bank').textContent=`${Math.round(roll)}°`;
    $('artificial-horizon').style.transform=`rotate(${-roll}deg) translateY(${Math.max(-80,Math.min(80,pitch))}px)`;
    $('shots-fired').textContent=cannon.shots;$('splat-count').textContent=cannon.hits;
    $('mess-damage').textContent=Math.round(cannon.damage);
    this.ammo(cannon);
    const flareLabel=flareCooldown>0?`X · FLARES ${flareCooldown.toFixed(1)}s`:'X · FLARES READY';
    for(const id of ['flare-status','cockpit-flares']){$(id).textContent=flareLabel;$(id).classList.toggle('cooling',flareCooldown>0)}
    $('vtol-camera-label').textContent=state.crashed?'LOST':cockpit?'CANOPY':'CHASE';
    if(cockpit){
      const signed=value=>`${value>=0?'+':'−'}${Math.abs(Math.round(value)).toString().padStart(2,'0')}°`;
      $('cockpit-heading').textContent=`${heading.toString().padStart(3,'0')}°`;
      $('cockpit-speed').textContent=String(Math.round(speed*3.6)).padStart(3,'0');
      $('cockpit-altitude').textContent=String(Math.round(state.position.y)).padStart(3,'0');
      $('cockpit-lift').textContent=`${Math.round(state.collective*100)}%`;
      $('cockpit-afterburner').classList.toggle('active',state.afterburner>0);
      $('cockpit-vs').textContent=`${state.velocity.y>=0?'+':''}${state.velocity.y.toFixed(1)}`;
      $('cockpit-pitch').textContent=signed(pitch);$('cockpit-bank').textContent=signed(roll);
    }
  }
  dispose(){
    this.clearPlayerHit();
    clearTimeout(this.toastTimer);clearTimeout(this.hitTimer);$('toast').classList.add('hidden');
    for(const id of ['start','start-vtol','mode-switch','help','pause','close-modal','office-jump','roof-jump','station-jump','bridge-jump','home','sound',...WEAPON_SLOTS.map(slot=>`weapon-${slot}`)])$(id).onclick=null;
    $('modal-content').replaceChildren();
  }
  minimap(player,yaw,crumbs,buildings,inside){
    const neon=this.mode==='vtol';
    const ctx=$('minimap').getContext('2d'),w=340,h=250,s=inside?7:.32;
    ctx.clearRect(0,0,w,h);
    const cx=inside?0:player.x*.6,cz=inside?0:this.map.minimapOffset+player.z*.42;
    const px=x=>w/2+(x-cx)*s,pz=z=>h/2+(z-cz)*s;
    function rect(x,z,rw,rd,color){ctx.fillStyle=color;ctx.fillRect(px(x-rw/2),pz(z-rd/2),rw*s,rd*s)}
    if(!inside){
      drawMinimapPaths(ctx,this.minimapPaths,cx,cz,s,w,h,neon?NEON_MINIMAP_COLORS:undefined);
    }
    if(this.map.id==='berlin'){rect(0,0,44,34,neon?'#69a688':'#a6b7a0');rect(11,20,22,7,neon?'#3f796b':'#c9bf9a')}
    if(inside){
      rect(-1,-12.6,9,7.6,'#bdaf8b');
      for(const x of [-14,-7,.2])for(const z of [-3,4,11])rect(x,z,4.4,1.85,'#d0c09c');
      rect(11,-9,5.6,2.5,'#d0c09c');rect(13.2,8.5,9,9,'#d4d5bb');
    }else{
      ctx.fillStyle=neon?'#b1dfc8':'#5b7e75';ctx.font=neon?'10px Consolas, monospace':'10px Arial';ctx.textAlign='center';
      for(const [label,x,z] of this.map.mapLabels)ctx.fillText(label,px(x),pz(z));
    }
    for(const c of crumbs){
      if(c.collected)continue;
      if(inside&&Math.abs(c.position.y-this.map.officeY)>5)continue;
      ctx.beginPath();ctx.arc(px(c.position.x),pz(c.position.z),inside?4:3,0,Math.PI*2);ctx.fillStyle='#b69a53';ctx.fill();
    }
    ctx.save();ctx.translate(px(player.x),pz(player.z));ctx.rotate(-yaw);
    ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(5,6);ctx.lineTo(0,3);ctx.lineTo(-5,6);ctx.closePath();
    ctx.fillStyle=neon?'#8dffc0':'#3a6350';ctx.strokeStyle=neon?'#e6fff4':'#f7f7e9';ctx.lineWidth=2;
    if(neon){ctx.shadowColor='#8dffc0';ctx.shadowBlur=8}
    ctx.fill();ctx.stroke();ctx.restore();
  }
}
