import { buildTower } from './tower.js';
import { buildNeighborhood } from './neighborhood.js';
import { buildStations } from './landmarks.js';
import { buildBridge } from './landmarks.js';
import { addAtmosphere } from './atmosphere.js';

export function createWorld(scene) {
  const tower=buildTower(scene);
  const neighborhood=buildNeighborhood(scene);
  const stations=buildStations(scene);
  const bridge=buildBridge(scene);
  const sky=addAtmosphere(scene);
  return {
    colliders:[...tower,...neighborhood.colliders,...stations.colliders,...bridge],
    buildings:neighborhood.buildings,
    update(time){neighborhood.update(time);stations.update(time);sky(time)}
  };
}
