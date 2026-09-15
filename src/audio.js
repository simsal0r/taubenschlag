export const VTOL_VOLUME=1.33*1.30;

export class Ambience {
  constructor(){this.enabled=false;this.context=null;this.engineDrive=0;this.rocketLaunches=0;this.predatorHits=0;this.lastPredatorHit=-Infinity;this.playerHits=0;this.lastPlayerHit=-Infinity;this.burnerIgnitions=0;this.lastJets=0;this.flareBursts=0;this.thrusterPulses=0;this.thrusterMisfires=0}
  dispose(){
    this.enabled=false;
    if(this.context){this.master.disconnect();void this.context.close();this.context=null}
  }
  init(context){
    this.context=context;
    this.master=context.createGain();this.master.gain.value=0;this.master.connect(context.destination);
    const buffer=context.createBuffer(1,context.sampleRate*4,context.sampleRate);
    const data=buffer.getChannelData(0);
    let last=0;
    for(let i=0;i<data.length;i++){last=(last+Math.random()*.035-.0175)/1.015;data[i]=last}
    const noise=context.createBufferSource();noise.buffer=buffer;noise.loop=true;
    const windFilter=context.createBiquadFilter();windFilter.type='lowpass';windFilter.frequency.value=350;
    this.wind=context.createGain();this.wind.gain.value=.045;
    noise.connect(windFilter);windFilter.connect(this.wind);this.wind.connect(this.master);noise.start();
    this.rocketNoise=context.createBuffer(1,Math.ceil(context.sampleRate*.9),context.sampleRate);
    const rocketData=this.rocketNoise.getChannelData(0);
    for(let i=0;i<rocketData.length;i++)rocketData[i]=Math.random()*2-1;
    // A bass motor, detuned turbine harmonics and rotor pulses form the engine.
    const rotor=context.createOscillator(),overtone=context.createOscillator(),sub=context.createOscillator();
    const overtoneGain=context.createGain(),subGain=context.createGain(),filter=context.createBiquadFilter();
    const rotorGain=context.createGain(),pulse=context.createOscillator(),pulseGain=context.createGain();
    rotor.type='sine';rotor.frequency.value=48;
    overtone.type='triangle';overtone.frequency.value=97;overtoneGain.gain.value=.07;
    sub.type='sine';sub.frequency.value=24;subGain.gain.value=.36;
    filter.type='lowpass';filter.frequency.value=190;filter.Q.value=.45;
    rotor.connect(filter);overtone.connect(overtoneGain);overtoneGain.connect(filter);sub.connect(subGain);subGain.connect(filter);
    rotorGain.gain.value=0;pulse.frequency.value=18;pulseGain.gain.value=0;
    pulse.connect(pulseGain);pulseGain.connect(rotorGain.gain);filter.connect(rotorGain);rotorGain.connect(this.master);
    rotor.start();overtone.start();sub.start();pulse.start();
    this.rotorGain=rotorGain;this.rotorOsc=rotor;this.turbineOsc=overtone;this.subOsc=sub;this.engineFilter=filter;
    this.rotorPulse=pulse;this.rotorPulseGain=pulseGain;
    const burner=context.createOscillator(),burnerFilter=context.createBiquadFilter(),burnerGain=context.createGain();
    burner.type='triangle';burner.frequency.value=64;
    burnerFilter.type='lowpass';burnerFilter.frequency.value=180;burnerFilter.Q.value=.4;
    burnerGain.gain.value=0;burner.connect(burnerFilter);burnerFilter.connect(burnerGain);burnerGain.connect(this.master);burner.start();
    this.burnerOsc=burner;this.burnerGain=burnerGain;
    // A gated, filtered exhaust roar gives the jets their own sound without
    // increasing background wind or adding a high-pitched turbine whistle.
    const jet=context.createBufferSource(),jetFilter=context.createBiquadFilter(),jetGain=context.createGain();
    jet.buffer=this.rocketNoise;jet.loop=true;jetFilter.type='bandpass';jetFilter.frequency.value=650;jetFilter.Q.value=.6;
    jetGain.gain.value=0;jet.connect(jetFilter);jetFilter.connect(jetGain);jetGain.connect(this.master);jet.start();
    this.burnerNoiseGain=jetGain;this.burnerFilter=jetFilter;
  }
  async setEnabled(enabled,cue=true){
    if(!this.context){
      if(!enabled)return false;
      const AudioContext=window.AudioContext||window.webkitAudioContext;
      if(!AudioContext)return false;
      this.init(new AudioContext());
    }
    const context=this.context;await context.resume();if(context!==this.context)return false;
    this.enabled=enabled;
    this.master.gain.setTargetAtTime(this.enabled?.26:0,this.context.currentTime,.2);
    if(this.enabled&&cue)this.coo();
    return this.enabled;
  }
  toggle(){return this.setEnabled(!this.enabled)}
  tone(frequency,duration,volume=.2,start=0,end=frequency){
    if(!this.enabled||!this.context)return;
    const t=this.context.currentTime+start,osc=this.context.createOscillator(),gain=this.context.createGain();
    osc.type='sine';osc.frequency.setValueAtTime(frequency,t);osc.frequency.exponentialRampToValueAtTime(end,t+duration);
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(volume,t+.025);gain.gain.exponentialRampToValueAtTime(.001,t+duration);
    osc.connect(gain);gain.connect(this.master);osc.start(t);osc.stop(t+duration+.02);
    osc.onended=()=>{osc.disconnect();gain.disconnect()};
  }
  coo(){this.tone(420,.22,.36,0,310);this.tone(360,.38,.3,.26,275)}
  crumb(){this.tone(784,.23,.3);this.tone(1046,.38,.23,.09)}
  poop(){this.tone(170,.13,.4,0,55)}
  splat(){this.tone(94,.09,.23,0,38)}
  bomb(){
    this.tone(115,.18,.3,0,48);
    this.tone(640,.8,.12,.08,145);
  }
  flares(){
    if(!this.enabled||!this.context)return;
    this.flareBursts++;const ctx=this.context,t=ctx.currentTime;
    for(let i=0;i<4;i++){
      const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),start=t+i*.045;
      source.buffer=this.rocketNoise;filter.type='bandpass';filter.frequency.value=850;filter.Q.value=.5;
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.25,start+.006);gain.gain.exponentialRampToValueAtTime(.001,start+.14);
      source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start(start);source.stop(start+.16);
      source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect()};
    }
    this.tone(210,.14,.2,0,65);
  }
  thruster(){
    if(!this.enabled||!this.context)return;
    this.thrusterPulses++;
    const ctx=this.context,t=ctx.currentTime,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    source.buffer=this.rocketNoise;filter.type='bandpass';filter.Q.value=.55;
    filter.frequency.setValueAtTime(1200,t);filter.frequency.exponentialRampToValueAtTime(340,t+.18);
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.5,t+.012);gain.gain.exponentialRampToValueAtTime(.001,t+.2);
    source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start(t);source.stop(t+.22);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect()};
    this.tone(140,.16,.24,0,55);
  }
  thrusterMisfire(){
    if(!this.enabled||!this.context)return;
    this.thrusterMisfires++;
    const ctx=this.context,t=ctx.currentTime;
    // Three dry electrical ticks with a weak ignition knock; no sustained jet whoosh.
    for(let i=0;i<3;i++){
      const start=t+i*.038,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
      source.buffer=this.rocketNoise;filter.type='highpass';filter.frequency.value=2200;filter.Q.value=.6;
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.24-i*.045,start+.001);
      gain.gain.exponentialRampToValueAtTime(.001,start+.019);
      source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start(start,i*.05);source.stop(start+.022);
      source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect()};
    }
    this.tone(90,.06,.1,.01,45);
  }
  predatorHit(type='raccoon',distance=0){
    if(!this.enabled||!this.context)return;
    const t=this.context.currentTime;
    // Short armor clank + a falling servo chirp. One blast hitting several
    // creatures is capped rather than stacking a wall of noise.
    if(t-this.lastPredatorHit<.055)return;
    this.lastPredatorHit=t;this.predatorHits++;
    const gain=Math.max(.12,1/(1+(distance/85)**2)),f=type==='godzilla'?125:type==='hawk'?510:type==='eagle'?440:type==='cat'?240:340;
    this.tone(f,.14,.24*gain,0,f*.57);
    this.tone(f*1.47,.095,.12*gain,0,f*.83);
    this.tone(95,.18,.25*gain,0,42);
  }
  playerHit(){
    if(!this.enabled||!this.context)return;
    const ctx=this.context,t=ctx.currentTime;
    if(t-this.lastPlayerHit<.055)return;
    this.lastPlayerHit=t;this.playerHits++;
    // A fast, dry crack with a small body thump, kept distinct from enemy clanks.
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    source.buffer=this.rocketNoise;filter.type='bandpass';filter.Q.value=.65;
    filter.frequency.setValueAtTime(2300,t);filter.frequency.exponentialRampToValueAtTime(850,t+.1);
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.65,t+.003);
    gain.gain.exponentialRampToValueAtTime(.001,t+.11);
    source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start(t);source.stop(t+.13);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect()};
    this.tone(210,.09,.18,0,65);
  }
  rocket(){
    if(!this.enabled||!this.context)return;
    const ctx=this.context,t=ctx.currentTime;
    this.rocketLaunches++;
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    source.buffer=this.rocketNoise;filter.type='bandpass';filter.Q.value=.65;
    filter.frequency.setValueAtTime(240,t);filter.frequency.exponentialRampToValueAtTime(1800,t+.16);filter.frequency.exponentialRampToValueAtTime(450,t+.85);
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.55,t+.025);
    gain.gain.exponentialRampToValueAtTime(.28,t+.24);gain.gain.exponentialRampToValueAtTime(.001,t+.85);
    source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start(t);source.stop(t+.9);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect()};
    const motor=ctx.createOscillator(),motorFilter=ctx.createBiquadFilter(),motorGain=ctx.createGain();
    motor.type='sawtooth';motor.frequency.setValueAtTime(105,t);
    motor.frequency.exponentialRampToValueAtTime(390,t+.18);motor.frequency.exponentialRampToValueAtTime(80,t+.85);
    motorFilter.type='lowpass';motorFilter.frequency.value=1100;
    motorGain.gain.setValueAtTime(0,t);motorGain.gain.linearRampToValueAtTime(.18,t+.05);motorGain.gain.exponentialRampToValueAtTime(.001,t+.85);
    motor.connect(motorFilter);motorFilter.connect(motorGain);motorGain.connect(this.master);motor.start(t);motor.stop(t+.9);
    motor.onended=()=>{motor.disconnect();motorFilter.disconnect();motorGain.disconnect()};
    this.tone(130,.19,.5,0,38);
  }
  boom(kind='crash'){
    if(!this.enabled||!this.context)return;
    const ctx=this.context,t=ctx.currentTime,duration=kind==='bomb'?.85:kind==='crash'?.65:.4;
    const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();source.buffer=buffer;
    filter.type='lowpass';filter.frequency.setValueAtTime(kind==='bomb'?320:kind==='crash'?950:460,t);filter.frequency.exponentialRampToValueAtTime(70,t+duration);
    gain.gain.setValueAtTime(.5,t);gain.gain.exponentialRampToValueAtTime(.001,t+duration);
    source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start(t);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect()};
    this.tone(kind==='bomb'?65:80,kind==='bomb'?.8:.45,kind==='bomb'?.45:.35,0,28);
  }
  rotor(collective,speed=0,acceleration=0,dt=1/60,afterburner=0){
    if(!this.rotorGain)return;
    const t=this.context.currentTime;
    const power=Math.max(0,Math.min(1,(collective-1)/1.5));
    const target=collective?Math.max(Math.min(1,Math.max(0,acceleration)/45),power*.85):0;
    this.engineDrive+=(target-this.engineDrive)*(1-Math.exp(-Math.max(0,dt)/(target>this.engineDrive?.22:.42)));
    if(!collective)this.engineDrive=0;
    const drive=this.engineDrive,airspeed=Math.min(95,Math.max(0,speed));
    const frequency=48+airspeed*.18+drive*27+power*5;
    this.rotorGain.gain.setTargetAtTime(collective?(.032+drive*.035+airspeed/95*.012)*VTOL_VOLUME:0,t,.1);
    this.rotorPulseGain.gain.setTargetAtTime(collective?(.0015+drive*.002)*VTOL_VOLUME:0,t,.12);
    this.rotorOsc.frequency.setTargetAtTime(frequency,t,.24);
    this.turbineOsc.frequency.setTargetAtTime(frequency*2.005,t,.24);
    this.subOsc.frequency.setTargetAtTime(frequency*.5,t,.24);
    this.engineFilter.frequency.setTargetAtTime(190+drive*130+airspeed*.6,t,.24);
    this.rotorPulse.frequency.setTargetAtTime(15+collective+drive*2,t,.2);
    const jets=collective?Math.max(0,Math.min(1,afterburner)):0;
    this.burnerGain.gain.setTargetAtTime(jets*.055*VTOL_VOLUME,t,jets?.09:.065);
    this.burnerOsc.frequency.setTargetAtTime(64+jets*12+airspeed*.06,t,.18);
    this.burnerNoiseGain.gain.setTargetAtTime(jets*.17*VTOL_VOLUME,t,jets?.075:.07);
    this.burnerFilter.frequency.setTargetAtTime(420+jets*300+Math.min(speed,500/3.6)*1.6,t,.16);
    if(jets>.2&&this.lastJets<=.2&&this.enabled){
      this.burnerIgnitions++;this.tone(135,.26,.35,0,42);this.tone(68,.32,.16,.025,39);
    }
    this.lastJets=jets;
  }
  flap(){
    if(!this.enabled||!this.context)return;
    const ctx=this.context,t=ctx.currentTime,buffer=ctx.createBuffer(1,ctx.sampleRate*.18,ctx.sampleRate);
    const data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1);
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    source.buffer=buffer;filter.type='lowpass';filter.frequency.setValueAtTime(1300,t);filter.frequency.exponentialRampToValueAtTime(170,t+.18);
    gain.gain.setValueAtTime(.001,t);gain.gain.linearRampToValueAtTime(.22,t+.035);gain.gain.exponentialRampToValueAtTime(.001,t+.18);
    source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start(t);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect()};
  }
  update(inside,speed,mode='pigeon'){
    const level=inside?.018:mode==='vtol'?.03+Math.min(speed,95)*.0003:.045+Math.min(speed,30)*.001;
    if(this.context&&this.wind)this.wind.gain.setTargetAtTime(level,this.context.currentTime,.7);
  }
  getState(){
    return{enabled:this.enabled,engineDrive:this.engineDrive,engineHz:this.rotorOsc?.frequency.value||0,
      engineGain:this.rotorGain?.gain.value||0,burnerGain:this.burnerGain?.gain.value||0,burnerRoarGain:this.burnerNoiseGain?.gain.value||0,burnerIgnitions:this.burnerIgnitions,flareBursts:this.flareBursts,thrusterPulses:this.thrusterPulses,thrusterMisfires:this.thrusterMisfires,windGain:this.wind?.gain.value||0,rocketLaunches:this.rocketLaunches,predatorHits:this.predatorHits,playerHits:this.playerHits,vtolVolume:VTOL_VOLUME};
  }
}
