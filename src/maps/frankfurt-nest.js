// Westend Tower (DZ Bank, Westendstraße 1): the shaft tops out at 198 m and the
// open crown ring at 207.6 m. The nest sits on that crown.
/** Five cyborg eagles perch around the open crown of the Westend Tower (DZ Bank, Westendstraße 1). */
export const WESTEND_NEST=Object.freeze({center:[-741,209.7,15],radius:11,count:5});
export function eagleNest(){
  const [x,y,z]=WESTEND_NEST.center;
  return Array.from({length:WESTEND_NEST.count},(_,i)=>{
    const a=-.4+i/WESTEND_NEST.count*Math.PI*2;
    return {type:'eagle',position:[x+Math.cos(a)*WESTEND_NEST.radius,y,z+Math.sin(a)*WESTEND_NEST.radius],nest:'westend',region:'Westend Tower'};
  });
}
