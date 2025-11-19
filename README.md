# Name Revealing Screen Display in  style of Windows XP Screensaver 

This repo is a small browser-based remake of the classic Windows XP 3D text screensaver using Three.js.

This branch adds a few interactive features and a short demo recording (embedded below):

## What I implemented in this branch

- Multiple text actors: the input string is split into characters and each character becomes an independently  animated 3D object.
- Center on Enter: pressing the `Enter` key will stop the free motion, align all characters horizontally in the same order as entered, and center them on screen.
- Confetti celebration: after the text centers, a confetti celebration runs (using `canvas-confetti`) visible on top of the WebGL canvas.
- Exit controls: screensaver no longer exits on mouse move. It exits on `Esc` key, or double-tap on mobile.
- UI tweak: the text input field is now `type="password"` so typed text is hidden while entering.
- Small hint: a lightweight hint shows in the screensaver: "Press Esc to exit (double-tap to exit on mobile)".

## Demo recording

You can play the short recording captured during development here:

<video controls src="./20251103-2146-48.2215838.mp4" style="max-width:100%;height:auto">Your browser does not support the video tag.</video>

## How to run locally

1. Install deps:

```bash
npm install
```

2. Build the demo bundle (or run the demo server):

```bash
npm run build:demo   # builds public/main.min.js
npm run start        # builds + serves public/ on http://localhost:3000
```

3. Open the demo and interact:

- Type up to 20 characters in the (password) input field.
- Choose an animation and click Start.
- While the screensaver runs: press `Enter` to center and trigger confetti, `Esc` to exit. On mobile double-tap to exit.

## Branch / PR

Changes are on branch `feature/multi-text-confetti`. A branch was pushed to the fork; you can open a PR from there if you'd like to merge into upstream.

---

If you'd like any of the behaviors tuned (confetti duration, spacing between characters, initial random positions, etc.), tell me which values you prefer and I can update the code.
