# Zeen

A phone-first app for making, publishing and reading 3D digital zines. Cut, fold and collage a sheet of paper in 3D, choreograph how it unfolds, then share it.

## Run

```sh
npm install
npm run dev          # http://localhost:5173, and on your LAN for testing on a phone
npm run build        # production build in dist/
```

On a desktop browser the app renders inside a phone frame. Open the LAN URL Vite prints on a phone for real touch: one finger uses the active tool, two fingers move the camera.

## How it's built

- **Paper engine** (`src/lib/paper.ts`, `src/lib/geom.ts`): the zine is a flat sheet polygon (cm). Each crease splits a panel; panels form a hinge tree and every panel's 3D matrix is its parent's matrix times a rotation about its crease. Cuts edit the sheet outline with boolean polygon ops, so content is never deleted (it's clipped). Page leaves are extra surfaces hinged on an existing crease.
- **Content** (`src/lib/compose.ts`): ink, text and scraps live in each surface's front/back page coordinates and are painted onto canvas textures, so anything that crosses a crease wraps across it and folds with the paper. Line boil redraws strokes on twos.
- **Scene** (`src/three/ZineScene.ts`): three.js renderer, camera rig (free orbit for Cut & Fold, page-locked 2.5D for Collage/Read, tilt for Preview), glowing fold handles (projected onto their on-screen arc), gestures, picking, page numbering by unfold order, and the paper look shader (halftone, dither, grain, riso, etc.).
- **Create flow** (`src/create/`): start sheet → Cut & Fold → Collage → Finalize → Publish, with unlimited undo/redo, a history panel and autosave to IndexedDB.
- **Social** (`src/screens/`): Home feed, Search, Preview, Read, Community, Prompt, Profile with zine shelves, Scrapbook, Edit profile, onboarding intro.
- **Music** (`src/lib/music.ts`) is synthesized per track (no licensed audio); album art comes from the design references.

Seed content lives in `src/lib/samples.ts`. Clear site data to reset.
