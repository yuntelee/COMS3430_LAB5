# COMS 3430 Lab 5 - Automated Composition

This project implements automated composition in a browser app using from-scratch
1D cellular automata.

## Features

- Elementary cellular automata generation (`Rule 0-255`) with configurable width and generation count.
- Configurable random seed density or manual `0/1` seed row input.
- Track tempo control via BPM.
- Rhythm generation with variable note lengths (`0.5`, `1`, `1.5`, `2` beats).
- Optional rest insertion for low-activity CA rows.
- Fixed loop structure: 4 bars in `4/4` (`16` beats total).
- User-selected mapping implemented as: C major pitch pool, median live-cell row mapping, hold previous note on empty rows.
- Shared playback engine and pitch-roll visualization.

## Run

```bash
npm install
npm run dev
```

Open the local URL shown by Vite (usually `http://localhost:5173`).

## Build

```bash
npm run build
npm run preview
```

## GitHub Pages

This repo includes a GitHub Actions workflow at `.github/workflows/deploy.yml` that builds the site and deploys the `dist` folder to GitHub Pages on every push to `main`.

To publish it, enable GitHub Pages in the repository settings and set the source to GitHub Actions.

## Part III Reflection

The reflection is included at the bottom of the main page.
