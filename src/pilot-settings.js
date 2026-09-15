// Agility defaults to 1× and motion inertia to 1.5×; framing follows the video reference.
export const PILOT_RANGES=Object.freeze({
  agility:Object.freeze({min:.4,max:2.5,step:.05,default:1}),
  inertia:Object.freeze({min:.3,max:3,step:.05,default:1.5}),
  sensitivity:Object.freeze({min:.25,max:2,step:.05,default:1}),
  cameraDistance:Object.freeze({min:14,max:42,step:1,default:22}),
  cameraHeight:Object.freeze({min:2,max:20,step:.5,default:7}),
});
export const PILOT_DEFAULTS=Object.freeze({
  invert:true,...Object.fromEntries(Object.entries(PILOT_RANGES).map(([key,range])=>[key,range.default])),
});

export function pilotValue(key,value){
  const range=PILOT_RANGES[key];
  return Number.isFinite(value)?Math.max(range.min,Math.min(range.max,value)):range.default;
}

// Migrate older saves and discard unknown/malformed fields before they reach flight math.
export function normalizePilotSettings(saved){
  const source=saved&&typeof saved==='object'?saved:{};
  return {
    invert:typeof source.invert==='boolean'?source.invert:PILOT_DEFAULTS.invert,
    ...Object.fromEntries(Object.keys(PILOT_RANGES).map(key=>[key,pilotValue(key,source[key])])),
  };
}
