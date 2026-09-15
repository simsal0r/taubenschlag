import './style.css';
import './cockpit.css';
import './map-select.css';
import './benchmark.css';
import './flight-hud.css';
import { MAPS } from './maps/catalog.js';
import { normalizePilotSettings } from './pilot-settings.js';
import { Ambience } from './audio.js';
import { readSoundPreference,saveSoundPreference,updateSoundButton } from './sound-settings.js';

const $=id=>document.getElementById(id);
let selected='berlin',loading=false,game=null;
let soundEnabled=readSoundPreference();
function soundPreference(enabled){soundEnabled=enabled;saveSoundPreference(enabled);updateSoundButton($('sound'),enabled)}
const normalBar=document.querySelector('.controls-bar').innerHTML;
const controls=`<div class="modal-eyebrow">ONE BIRD · TWO CITIES</div><h2 id="modal-title">Pick a place. Spread your wings.</h2>
<p>Choose Berlin or Frankfurt, then launch as a small pigeon or a cyborg VTOL.</p>
<p>Small pigeon: tap Space to flap, W / S to aim up and down, A / D to turn, Shift to brake. Holding Space produces only one flap. Stop flapping and you’ll glide to a hover. E perches, R returns to your starting landmark.</p>
<p>VTOL: W / S controls lift, mouse pitches and rolls, A / D yaws. Hold Space for aggressive pitch up, or E for aggressive pitch down. Hold Shift for afterburners up to 500 km/h; press X to deploy flares. Tap Q for a lift-thruster boost (five charges, 0.1 seconds between taps; one charge automatically refills every two seconds). Click the scene to capture your mouse. C enters the cockpit. Select 1 for the cannon, 2 for rockets, or 3 for heavy falling poop bombs; left click fires or drops the selected weapon. R reloads the selected weapon. Esc opens flight settings and releases your mouse.</p>
<p class="modal-note">Only the city you launch is loaded. Use “Change city” in the pause menu to return here.</p>`;
function showModal(html){$('modal-content').innerHTML=html;$('modal').showModal()}
function selectMap(id){
  selected=id;const map=MAPS[id];document.body.dataset.map=id;
  for(const card of document.querySelectorAll('[data-map-choice]'))card.setAttribute('aria-pressed',String(card.dataset.mapChoice===id));
  $('selected-map').textContent=`${map.city} · ${map.tower}`;
  $('map-description').textContent=map.description;
  document.querySelector('.coordinate').textContent=`⌖ ${map.coordinates}`;
}
function bindHome(){
  document.body.classList.add('map-selection');
  document.querySelector('.controls-bar').innerHTML=normalBar;
  document.querySelector('.brand-sub').textContent='A LITTLE PIGEON ADVENTURE';
  for(const id of ['welcome','welcome-footer'])$(id).classList.remove('hidden');
  for(const id of ['hud','pause','scene-label','loading','error','waypoint','toast','crash-overlay'])$(id).classList.add('hidden');
  $('sound').classList.remove('hidden');updateSoundButton($('sound'),soundEnabled);
  $('sound').onclick=()=>{if(!loading)soundPreference(!soundEnabled)};
  $('start').onclick=()=>launch('pigeon');$('start-vtol').onclick=()=>launch('vtol');
  $('start-benchmark').onclick=()=>launch('vtol',true);
  $('home').onclick=e=>e.preventDefault();
  $('help').onclick=()=>showModal(controls);
  $('close-modal').onclick=()=>$('modal').close();
  $('retry-map').onclick=()=>location.reload();
  for(const card of document.querySelectorAll('[data-map-choice]'))card.onclick=()=>{if(!loading)selectMap(card.dataset.mapChoice)};
  selectMap(selected);
  let settings=normalizePilotSettings();try{settings=normalizePilotSettings(JSON.parse(localStorage.getItem('little-wings-pilot')||'{}'))}catch{}
  const memory=window.__littleWings?.getState().memory||{geometries:0,textures:0};
  window.__littleWings={getState:()=>({started:false,mapId:null,selectedMap:selected,loading,memory,audio:{enabled:soundEnabled},vtol:{settings}})};
}
async function launch(mode,benchmark=false){
  if(loading||game)return;
  loading=true;$('loading').classList.remove('hidden');$('error').classList.add('hidden');
  $('loading').innerHTML=`<span class="loading-bird">✦</span> Opening ${MAPS[selected].city}…`;
  $('sound').disabled=true;
  for(const el of document.querySelectorAll('#welcome button'))el.disabled=true;
  const audio=new Ambience();
  try{
    // Unlock audio in the launch click, before the asynchronous scene import.
    if(soundEnabled)try{soundPreference(await audio.setEnabled(true,false))}catch{soundPreference(false)}
    // Give the loading state a paint before compiling the selected city's scene.
    await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
    const {createGame}=await import('./game.js');
    game=await createGame({mapId:selected,initialMode:mode,initialBenchmark:benchmark,audio,onSoundChange:soundPreference,onHome(){game=null;bindHome()}});
    document.body.classList.remove('map-selection');$('sound').classList.remove('hidden');
    document.querySelector('.brand-sub').textContent=`${MAPS[selected].city.toUpperCase()} · ${MAPS[selected].tower.toUpperCase()}`;
  }catch(error){
    console.error(error);game?.dispose();audio.dispose();game=null;
    $('loading').classList.add('hidden');$('error').classList.remove('hidden');
    $('error-message').textContent='This city could not load. Check that WebGL 2 is enabled, then try again.';
  }finally{
    loading=false;$('sound').disabled=false;for(const el of document.querySelectorAll('#welcome button'))el.disabled=false;
  }
}
$('modal').addEventListener('click',e=>{if(!game&&e.target===$('modal')){const r=$('modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('modal').close()}});
bindHome();
