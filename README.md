# Taubenschlag

A browser flight game set in Berlin and Frankfurt. Fly a small pigeon around
EDGE East Side, Warschauer Straße and Oberbaumbrücke, or around TaunusTurm, the
Frankfurt skyline, Hauptbahnhof and the Main. Collect twelve crumbs per city, or
switch to the cyborg VTOL for a helicopter-style flight model with weapons,
afterburners and a cast of cyborg wildlife to provoke.

Everything runs locally: vanilla JavaScript, Three.js and Vite. Geometry,
textures and sound are generated at runtime, so no map or texture service is
needed while playing.

## Run it

Requirements: Node.js 20.19+ or 22.12+ and a current browser with WebGL 2
(Chrome, Edge, Firefox or Safari).

```sh
npm install
npm run dev
```

Open the address Vite prints (normally `http://127.0.0.1:5173`), pick a city and
choose **Let’s fly** (small pigeon) or **Deploy cyborg VTOL**.

For a static build that can be dropped onto any web server:

```sh
npm run build      # writes dist/
npm run preview    # serves dist/ locally for a check
```

Deploy the contents of `dist/` at the root path of a static host.

## Controls

### Small pigeon

| Key | Action |
| --- | --- |
| W / S or ↑ / ↓ | Aim up / down |
| A / D or ← / → | Turn |
| Space (tap) | One wingbeat; the only thing that adds speed |
| Shift, C or Ctrl | Brake |
| E | Perch on a nearby surface / take off |
| R | Return to the start point |
| B | Coo |
| Esc | Pause / resume |
| Drag the scene | Look around |

Tap Space repeatedly to build speed and hold W or S while flapping to climb or
dive. Sound is optional (speaker button); collected crumbs are saved in the
browser's local storage. On touch screens, tap **Flap** while holding an arrow.

### Cyborg VTOL (keyboard and mouse)

Click the scene to capture the mouse.

| Key | Action |
| --- | --- |
| W / S | Throttle up / down (collective lift) |
| A / D | Yaw |
| Mouse | Pitch (forward/back) and roll (left/right) |
| Arrow keys | Backup cyclic |
| Hold Space / E | Continuous pitch up / down |
| Hold Shift | Twin afterburners |
| Q | Lift-thruster pulse (5 charges, recharge over time) |
| X | Flare burst (3 s cooldown) |
| Hold left mouse | Fire selected weapon |
| 1 / 2 / 3 | Poop cannon / pigeon rocket / poop bomb |
| R | Reload |
| Hold right mouse | Freelook (chase) or 1.25× zoom (cockpit) |
| C | Chase / cockpit view |
| Esc | Release mouse and pause |

Esc opens flight tuning (agility, motion inertia, mouse sensitivity and
inversion, chase-camera distance and height). Settings persist in the browser.

Wildlife in Frankfurt (cyborg hawks, cats, raccoons, the Westend eagle nest and
the Godzilla on Silberturm) is peaceful until you hit it. Crashing into a surface
at 90 km/h or more destroys the VTOL and rebuilds it after two seconds.

### Benchmark

**30-second benchmark flight** on the start screen or in the pause menu runs a
fixed VTOL route and reports FPS, frame times and rendering workload. It saves a
local baseline per city so later runs can be compared. Results stay on your
device.

## Tests

```sh
npm test
```

Runs the Node unit tests (flight physics, collisions, weapons, wildlife and
boss behaviour, camera, settings, rendering helpers). No browser is needed.

## Project layout

- `index.html`, `src/main.js` — start screen and deferred city loading
- `src/game.js` — game loop, input, camera, collectibles, scene lifecycle
- `src/maps/` — Berlin and Frankfurt scenes, mapped data, wildlife routes
- `src/flight.js`, `src/vtol-flight.js` — pigeon and VTOL flight models
- `src/pigeon.js`, `src/cyborg-pigeon.js` — animated player models
- `src/poop-cannon.js`, `src/pigeon-rocket.js`, `src/poop-bomb.js` — weapons
- `src/predator-*.js`, `src/godzilla*.js` — cyborg wildlife and the boss
- `src/benchmark*.js` — benchmark route, timing and results UI
- `src/ui.js`, `src/style.css`, `src/cockpit.*` — menus, HUD, cockpit
- `src/audio.js` — synthesized sound
- `tests/` — unit tests

## Credits and licenses

Original code, art and audio: see [LICENSE](LICENSE) (all rights reserved).

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors, available under the Open Database License (ODbL) 1.0. The derived
data files are `src/neighborhood-data.json` and `src/maps/frankfurt-data.json`.

Three.js and Vite are MIT licensed. The bundled Manrope and DM Sans fonts are
under the SIL Open Font License; the license texts sit next to the font files in
`public/fonts/`.

The cities are stylized interpretations, not digital twins. This project is
independent of and unaffiliated with the buildings shown, their owners, tenants
or architects.
