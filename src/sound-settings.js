const key='little-wings-sound';
export function readSoundPreference(){try{return localStorage.getItem(key)==='on'}catch{return false}}
export function saveSoundPreference(enabled){try{localStorage.setItem(key,enabled?'on':'off')}catch{}}
export function updateSoundButton(button,enabled){
  button.setAttribute('aria-pressed',String(enabled));
  button.setAttribute('aria-label',enabled?'Mute sound':'Enable sound');
  button.title=enabled?'Sound on · click to mute':'Sound off · click to enable';
  button.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m11 5-5 4H3v6h3l5 4V5Z"/>${enabled?'<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>':'<path d="m16 9 5 6m0-6-5 6"/>'}</svg>`;
}
