import "./style.css";
import { SoundFontPlayer } from "@magenta/music/esm/core/player";

const SOUNDFONT_URL = "https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus";
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTE_TO_SEMITONE = {
  C: 0,
  "C#": 1,
  DB: 1,
  D: 2,
  "D#": 3,
  EB: 3,
  E: 4,
  F: 5,
  "F#": 6,
  GB: 6,
  G: 7,
  "G#": 8,
  AB: 8,
  A: 9,
  "A#": 10,
  BB: 10,
  B: 11,
};

const KEY_ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const KEY_MODES = [
  { name: "major", intervals: [0, 2, 4, 5, 7, 9, 11] },
  { name: "minor", intervals: [0, 2, 3, 5, 7, 8, 10] },
];
const DEFAULT_SEED_WIDTH = 24;
const HIDDEN_WIDTH_RANGE = [16, 32];
const HIDDEN_GENERATION_RANGE = [24, 64];
const HIDDEN_DENSITY_RANGE = [0.18, 0.5];
const HIDDEN_REST_RANGE = [0.03, 0.16];
const HIDDEN_RULE_RANGE = [0, 255];

const TIME_SIGNATURE = { numerator: 4, denominator: 4 };
const LOOP_BARS = 4;
const TOTAL_BEATS = TIME_SIGNATURE.numerator * LOOP_BARS;
const PLAYHEAD_LATENCY_COMPENSATION_SEC = 0.12;
const RHYTHM_NOTE_VALUES = [
  { name: "eighth", beats: 0.5 },
  { name: "quarter", beats: 1 },
  { name: "dotted quarter", beats: 1.5 },
  { name: "half", beats: 2 },
  { name: "dotted half", beats: 3 },
  { name: "whole", beats: 4 },
];

const appState = {
  player: new SoundFontPlayer(SOUNDFONT_URL),
  caRows: [],
  generatedCAPitches: [],
  generatedCAEvents: [],
  generatedCASequence: null,
  generatedKey: null,
  loopDurationSec: 0,
  loopStartedAtMs: null,
  loopTimeoutId: null,
  loopAnimationFrameId: null,
};

document.querySelector("#app").innerHTML = `
  <main class="minimal">
    <h1>Cellular Automata Loop</h1>

    <label for="ca-seed-input">Initial row</label>
    <div class="seed-field">
      <input id="ca-seed-input" type="text" placeholder="001001001001" />
      <button id="seed-randomize" type="button" class="seed-randomize">Randomize</button>
    </div>

    <div class="control-grid">
      <label for="bpm-input">BPM</label>
      <input id="bpm-input" type="number" min="50" max="220" step="1" value="120" />
    </div>

    <div class="button-row">
      <button id="generate-ca">Generate</button>
      <button id="play-ca">Play Loop</button>
    </div>

    <div class="piano-roll" id="ca-roll"></div>

    <div class="loop-indicator" aria-live="polite">
      <div class="loop-track">
        <span class="loop-playhead" id="loop-playhead"></span>
      </div>
    </div>

    <details class="ca-details">
      <summary>Cellular Automata Output</summary>
      <div class="ca-grid" id="ca-grid" aria-label="Cellular automata generations"></div>
    </details>

    <h2>Cellular Automata as a Looping Instrument</h2>
    <p class="meta">April 24, 2026</p>
    <p class="sequence-text">
      <strong>Introduction:</strong>
      This lab turned out to be less about running cellular automata and more about making algorithmic behavior feel
      musical inside a browser loop.
    </p>
    <p class="sequence-text">
      <strong>What this is:</strong>
      This is a note and sequence generator based on an elementary cellular automaton. The CA engine itself is
      straightforward: evolve binary rows from a seed and rule, then map each row to musical decisions.
    </p>
    <p class="sequence-text">
      <strong>How it works very briefly:</strong>
      A seeded binary row evolves across generations. Each generation is translated into pitch, rhythmic value, and
      rest placement, then packed into a four-bar loop that can be played back in the browser.
    </p>
    <p class="sequence-text">
      <strong>Thoughts:</strong>
      Writing music comes naturally to me, and I usually do not think about it as explicit algorithms. That was not
      the case for this system. My first versions sounded like a random note machine, so I had to add specific
      constraints and guidelines: keeping notes diatonic to a key, quantizing rhythm to recognizable values (eighth,
      quarter, dotted values, etc.), limiting form to a four-bar loop, and using repetition to support coherence.
      Even with those constraints, the output still feels machine-generated, which made me think more critically about
      what makes sound feel organized. A key improvement was mapping pitch by median live-cell position, which gave a
      much more stable melodic contour.
    </p>
  </main>
`;

const ui = {
  caSeedInput: document.querySelector("#ca-seed-input"),
  seedRandomizeButton: document.querySelector("#seed-randomize"),
  bpmInput: document.querySelector("#bpm-input"),
  generateCAButton: document.querySelector("#generate-ca"),
  playCAButton: document.querySelector("#play-ca"),
  caStatus: document.querySelector("#ca-status"),
  loopPlayhead: document.querySelector("#loop-playhead"),
  loopPosition: document.querySelector("#loop-position"),
  caRoll: document.querySelector("#ca-roll"),
  caGrid: document.querySelector("#ca-grid"),
};

ui.caSeedInput.value = buildCenteredSeedString(DEFAULT_SEED_WIDTH);
resetLoopIndicator();

wireEvents();
composeCAFromForm();

function wireEvents() {
  ui.seedRandomizeButton.addEventListener("click", () => {
    const currentSeed = ui.caSeedInput.value.trim().replace(/\s+/g, "");
    const width =
      currentSeed.length >= 8
        ? clamp(currentSeed.length, HIDDEN_WIDTH_RANGE[0], HIDDEN_WIDTH_RANGE[1])
        : DEFAULT_SEED_WIDTH;
    const density = randomFloat(HIDDEN_DENSITY_RANGE[0], HIDDEN_DENSITY_RANGE[1]);
    ui.caSeedInput.value = createRandomSeedRow(width, density).join("");
  });

  ui.generateCAButton.addEventListener("click", () => {
    composeCAFromForm();
  });

  ui.playCAButton.addEventListener("click", () => {
    if (isLoopPlaying()) {
      stopPlayback();
      setStatus(ui.caStatus, "Playback stopped.");
      return;
    }

    playSequence(appState.generatedCASequence, "Generate a cellular automata loop first.", ui.caStatus);
  });
}

function isLoopPlaying() {
  return appState.loopStartedAtMs !== null;
}

function updatePlaybackButtonLabel() {
  ui.playCAButton.textContent = isLoopPlaying() ? "Stop Loop" : "Play Loop";
}

function setStatus(element, text, isError = false) {
  if (!element) {
    return;
  }

  element.textContent = text;
  element.classList.toggle("error", isError);
}

function midiToNoteName(midi) {
  const note = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function formatLoopLine(events) {
  if (!events.length) {
    return "No events.";
  }

  return events
    .map((event) => {
      const beatLabel = `${formatBeatCount(event.durationBeats)} beat${event.durationBeats === 1 ? "" : "s"}`;
      if (event.type === "rest") {
        return `Rest (${event.noteValue}, ${beatLabel})`;
      }

      return `${midiToNoteName(event.pitch)} (${event.pitch}, ${event.noteValue}, ${beatLabel})`;
    })
    .join(" | ");
}

function formatBeatCount(beats) {
  const rounded = Math.round(beats * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function buildCenteredSeedString(width) {
  const cells = new Array(width).fill("0");
  cells[Math.floor(width / 2)] = "1";
  return cells.join("");
}

function normalizeSeedRow(seedInput, width) {
  const cleaned = seedInput.trim().replace(/\s+/g, "");

  if (!cleaned) {
    return null;
  }

  if (!/^[01]+$/.test(cleaned)) {
    throw new Error("Initial row must use only 0 and 1.");
  }

  if (cleaned.length === width) {
    return cleaned.split("").map(Number);
  }

  const cells = new Array(width).fill(0);
  for (let index = 0; index < width; index += 1) {
    cells[index] = Number(cleaned[index % cleaned.length]);
  }

  if (!cells.includes(1)) {
    cells[Math.floor(width / 2)] = 1;
  }

  return cells;
}

function createRandomSeedRow(width, density) {
  const row = Array.from({ length: width }, () => (Math.random() < density ? 1 : 0));

  if (!row.includes(1)) {
    row[Math.floor(width / 2)] = 1;
  }

  return row;
}

function parseSeedRow(seedInput, width) {
  const cleaned = seedInput.trim().replace(/\s+/g, "");

  if (!cleaned) {
    return null;
  }

  if (!/^[01]+$/.test(cleaned)) {
    throw new Error("Initial row must use only 0 and 1.");
  }

  if (cleaned.length !== width) {
    throw new Error(`Initial row length (${cleaned.length}) must match cell width (${width}).`);
  }

  return cleaned.split("").map(Number);
}

function ruleBits(rule) {
  return rule.toString(2).padStart(8, "0");
}

function evolveCARows(initialRow, rule, generations) {
  const rows = [initialRow.slice()];
  const width = initialRow.length;

  for (let generation = 1; generation < generations; generation += 1) {
    const previous = rows[generation - 1];
    const next = new Array(width).fill(0);

    for (let cellIndex = 0; cellIndex < width; cellIndex += 1) {
      const left = previous[(cellIndex - 1 + width) % width];
      const center = previous[cellIndex];
      const right = previous[(cellIndex + 1) % width];
      const pattern = (left << 2) | (center << 1) | right;
      next[cellIndex] = (rule >> pattern) & 1;
    }

    rows.push(next);
  }

  return rows;
}

function countLiveCells(row) {
  return row.reduce((sum, cell) => sum + cell, 0);
}

function countRowTransitions(row) {
  let transitions = 0;

  for (let index = 1; index < row.length; index += 1) {
    if (row[index] !== row[index - 1]) {
      transitions += 1;
    }
  }

  return transitions;
}

function deriveHiddenCAConfig() {
  return {
    rule: randomInt(HIDDEN_RULE_RANGE[0], HIDDEN_RULE_RANGE[1]),
    width: randomInt(HIDDEN_WIDTH_RANGE[0], HIDDEN_WIDTH_RANGE[1]),
    generations: randomInt(HIDDEN_GENERATION_RANGE[0], HIDDEN_GENERATION_RANGE[1]),
    density: randomFloat(HIDDEN_DENSITY_RANGE[0], HIDDEN_DENSITY_RANGE[1]),
    restChance: randomFloat(HIDDEN_REST_RANGE[0], HIDDEN_REST_RANGE[1]),
  };
}

function deriveKeyFromRows(rows, rule) {
  let fingerprint = rule * 17;
  let liveCount = 0;
  let transitions = 0;

  rows.forEach((row, rowIndex) => {
    liveCount += countLiveCells(row);
    transitions += countRowTransitions(row);

    row.forEach((cell, cellIndex) => {
      fingerprint += cell * (rowIndex + 1) * (cellIndex + 3);
    });
  });

  const root = KEY_ROOTS[Math.abs(fingerprint + liveCount) % KEY_ROOTS.length];
  const mode = KEY_MODES[Math.abs(fingerprint + transitions) % KEY_MODES.length];

  return {
    root,
    mode: mode.name,
    label: `${root} ${mode.name}`,
    intervals: mode.intervals,
  };
}

function buildPitchPoolForKey(key) {
  const rootSemitone = NOTE_TO_SEMITONE[key.root];
  const pitches = [];

  for (let octave = 3; octave <= 5; octave += 1) {
    const base = (octave + 1) * 12 + rootSemitone;

    for (const interval of key.intervals) {
      const pitch = base + interval;
      if (pitch >= 0 && pitch <= 127) {
        pitches.push(pitch);
      }
    }
  }

  return pitches;
}

function rowToPitch(row, pitchPool, previousPitch) {
  const liveIndices = [];
  for (let index = 0; index < row.length; index += 1) {
    if (row[index] === 1) {
      liveIndices.push(index);
    }
  }

  if (!liveIndices.length) {
    return previousPitch ?? pitchPool[0];
  }

  const centerIndex = Math.floor(liveIndices.length / 2);
  const medianCellIndex =
    liveIndices.length % 2 === 1
      ? liveIndices[centerIndex]
      : Math.round((liveIndices[centerIndex - 1] + liveIndices[centerIndex]) / 2);

  const rowMaxIndex = Math.max(1, row.length - 1);
  const normalized = medianCellIndex / rowMaxIndex;
  const poolIndex = Math.round(normalized * (pitchPool.length - 1));
  return pitchPool[Math.max(0, Math.min(pitchPool.length - 1, poolIndex))];
}

function getNoteValueByName(name) {
  const found = RHYTHM_NOTE_VALUES.find((value) => value.name === name);
  return found || RHYTHM_NOTE_VALUES[1];
}

function selectNoteValueFromRow(row) {
  const liveRatio = countLiveCells(row) / row.length;
  const transitionRatio = row.length > 1 ? countRowTransitions(row) / (row.length - 1) : 0;
  const centerCell = row[Math.floor(row.length / 2)] || 0;
  const edgeRatio = ((row[0] || 0) + (row[row.length - 1] || 0)) / 2;

  // Weighted activity score in [0, 1] that controls rhythmic density.
  const activity = Math.min(1, liveRatio * 0.45 + transitionRatio * 0.4 + centerCell * 0.1 + edgeRatio * 0.05);
  let candidates;

  if (activity < 0.2) {
    candidates = ["whole", "dotted half", "half"];
  } else if (activity < 0.4) {
    candidates = ["dotted half", "half", "dotted quarter"];
  } else if (activity < 0.6) {
    candidates = ["half", "dotted quarter", "quarter"];
  } else if (activity < 0.8) {
    candidates = ["dotted quarter", "quarter", "eighth"];
  } else {
    candidates = ["quarter", "eighth", "dotted quarter"];
  }

  // Deterministic CA fingerprint so row pattern drives value selection.
  const fingerprint = row.reduce((sum, cell, index) => sum + cell * (index + 1), 0);
  return getNoteValueByName(candidates[fingerprint % candidates.length]);
}

function fitNoteValueToRemaining(preferredValue, remainingBeats) {
  if (preferredValue.beats <= remainingBeats + 1e-9) {
    return preferredValue;
  }

  const fallback = RHYTHM_NOTE_VALUES.filter((value) => value.beats <= remainingBeats + 1e-9).at(-1);
  if (fallback) {
    return fallback;
  }

  return {
    name: `${formatBeatCount(remainingBeats)}-beat fill`,
    beats: remainingBeats,
  };
}

function shouldInsertRest(row, restChance) {
  const liveCount = countLiveCells(row);
  const lowActivityThreshold = Math.max(1, Math.floor(row.length * 0.15));
  const veryLowActivityThreshold = Math.max(1, Math.floor(row.length * 0.08));

  if (liveCount <= veryLowActivityThreshold) {
    return Math.random() < Math.min(0.55, restChance + 0.2);
  }

  if (liveCount <= lowActivityThreshold) {
    return Math.random() < restChance;
  }

  return Math.random() < restChance * 0.25;
}

function enforceAudibleLoopEvents(events, pitchPool) {
  const adjusted = events.map((event) => ({ ...event }));

  if (!adjusted.length) {
    return adjusted;
  }

  if (adjusted[0].type === "rest") {
    adjusted[0].type = "note";
  }

  for (let barIndex = 0; barIndex < LOOP_BARS; barIndex += 1) {
    const barStart = barIndex * TIME_SIGNATURE.numerator;
    const barEnd = barStart + TIME_SIGNATURE.numerator;
    const hasNoteInBar = adjusted.some(
      (event) => event.type === "note" && event.startBeat < barEnd - 1e-9 && event.endBeat > barStart + 1e-9
    );

    if (hasNoteInBar) {
      continue;
    }

    const firstEventInBar = adjusted.find(
      (event) => event.startBeat >= barStart - 1e-9 && event.startBeat < barEnd - 1e-9
    );

    if (firstEventInBar) {
      firstEventInBar.type = "note";
    }
  }

  let previousPitch = pitchPool[0];

  for (const event of adjusted) {
    if (event.type !== "note") {
      delete event.pitch;
      continue;
    }

    const pitch = Number.isInteger(event.pitch)
      ? event.pitch
      : rowToPitch(event.sourceRow || [], pitchPool, previousPitch);
    event.pitch = pitch;
    previousPitch = pitch;
  }

  return adjusted;
}

function buildNotesFromEvents(events, secondsPerBeat) {
  const notes = [];

  for (const event of events) {
    if (event.type !== "note") {
      continue;
    }

    notes.push({
      pitch: event.pitch,
      startTime: event.startBeat * secondsPerBeat,
      endTime: event.endBeat * secondsPerBeat,
      velocity: 90,
    });
  }

  return notes;
}

function buildFourBarLoop(rows, pitchPool, bpm, restChance) {
  const secondsPerBeat = 60 / bpm;
  const events = [];

  let previousPitch = pitchPool[0];
  let currentBeat = 0;
  let rowIndex = 0;
  let consecutiveRests = 0;

  while (currentBeat < TOTAL_BEATS - 1e-9) {
    const row = rows[rowIndex % rows.length];
    rowIndex += 1;

    const preferredValue = selectNoteValueFromRow(row);
    const remainingBeats = TOTAL_BEATS - currentBeat;
    const noteValue = fitNoteValueToRemaining(preferredValue, remainingBeats);
    const durationBeats = noteValue.beats;
    const startBeat = currentBeat;
    const endBeat = currentBeat + durationBeats;
    const allowRest = consecutiveRests < 2;
    const isRest = allowRest && shouldInsertRest(row, restChance);

    if (isRest) {
      events.push({
        type: "rest",
        sourceRow: row,
        noteValue: noteValue.name,
        durationBeats,
        startBeat,
        endBeat,
      });
      consecutiveRests += 1;
    } else {
      const pitch = rowToPitch(row, pitchPool, previousPitch);
      previousPitch = pitch;

      events.push({
        type: "note",
        pitch,
        sourceRow: row,
        noteValue: noteValue.name,
        durationBeats,
        startBeat,
        endBeat,
      });
      consecutiveRests = 0;
    }

    currentBeat += durationBeats;
  }

  const finalizedEvents = enforceAudibleLoopEvents(events, pitchPool);
  const notes = buildNotesFromEvents(finalizedEvents, secondsPerBeat);

  return {
    sequence: {
      tempos: [{ time: 0, qpm: bpm }],
      timeSignatures: [
        {
          time: 0,
          numerator: TIME_SIGNATURE.numerator,
          denominator: TIME_SIGNATURE.denominator,
        },
      ],
      notes,
      totalTime: TOTAL_BEATS * secondsPerBeat,
    },
    events: finalizedEvents,
  };
}

function composeCAFromForm() {
  try {
    stopPlayback();

    const bpm = Number(ui.bpmInput.value);

    if (!Number.isFinite(bpm) || bpm < 50 || bpm > 220) {
      throw new Error("Track BPM must be between 50 and 220.");
    }

    const hidden = deriveHiddenCAConfig();
    const manualSeed = normalizeSeedRow(ui.caSeedInput.value, hidden.width);
    const initialRow = manualSeed ?? createRandomSeedRow(hidden.width, hidden.density);

    if (!manualSeed) {
      ui.caSeedInput.value = initialRow.join("");
    }

    const rows = evolveCARows(initialRow, hidden.rule, hidden.generations);
    const key = deriveKeyFromRows(rows, hidden.rule);
    const pitchPool = buildPitchPoolForKey(key);
    const loop = buildFourBarLoop(rows, pitchPool, bpm, hidden.restChance);

    appState.caRows = rows;
    appState.generatedCAEvents = loop.events;
    appState.generatedCAPitches = loop.events
      .filter((event) => event.type === "note")
      .map((event) => event.pitch);
    appState.generatedCASequence = loop.sequence;
    appState.generatedKey = key;
    appState.loopDurationSec = loop.sequence.totalTime;

    resetLoopIndicator(loop.sequence);
    renderPianoRoll(ui.caRoll, loop.events);
    renderCAGrid(ui.caGrid, rows);

    const noteCount = loop.events.filter((event) => event.type === "note").length;
    const restCount = loop.events.filter((event) => event.type === "rest").length;

    setStatus(ui.caStatus, `Generated 4-bar loop in 4/4 at ${bpm} BPM with ${noteCount} notes and ${restCount} rests.`);

    return true;
  } catch (error) {
    setStatus(ui.caStatus, `CA generation failed: ${error.message}`, true);
    return false;
  }
}

function renderPianoRoll(container, events) {
  container.innerHTML = "";

  if (!events.length) {
    return;
  }

  const noteEvents = events.filter((event) => event.type === "note");
  const notePitches = noteEvents.map((event) => event.pitch);
  const minPitch = notePitches.length ? Math.min(...notePitches) : 60;
  const maxPitch = notePitches.length ? Math.max(...notePitches) : 60;
  const pitchRange = Math.max(1, maxPitch - minPitch);

  let animationIndex = 0;

  events.forEach((event) => {
    const beatWidthWeight = Math.max(0.001, event.durationBeats);

    if (event.type === "rest") {
      const restBar = document.createElement("div");
      restBar.className = "rest-bar";
      restBar.style.flex = `${beatWidthWeight} 1 0`;
      restBar.title = `Rest (${event.noteValue}, ${formatBeatCount(event.durationBeats)} beats)`;
      container.append(restBar);
      return;
    }

    const bar = document.createElement("div");
    bar.className = "note-bar";
    bar.style.flex = `${beatWidthWeight} 1 0`;
    bar.style.setProperty("--pitch-position", String((event.pitch - minPitch) / pitchRange));
    bar.style.animationDelay = `${animationIndex * 22}ms`;
    bar.title = `${midiToNoteName(event.pitch)} (${event.pitch}), ${event.noteValue}, ${formatBeatCount(
      event.durationBeats
    )} beats`;
    container.append(bar);
    animationIndex += 1;
  });
}

function renderCAGrid(container, rows) {
  container.innerHTML = "";

  if (!rows.length) {
    return;
  }

  container.style.setProperty("--ca-columns", String(rows[0].length));

  rows.forEach((row, rowIndex) => {
    row.forEach((cell, cellIndex) => {
      const cellElement = document.createElement("span");
      cellElement.className = cell === 1 ? "ca-cell live" : "ca-cell";
      cellElement.title = `Generation ${rowIndex + 1}, cell ${cellIndex + 1}: ${
        cell === 1 ? "live" : "dead"
      }`;
      container.append(cellElement);
    });
  });
}

function playSequence(sequence, emptyMessage, statusElement) {
  if (!sequence) {
    setStatus(statusElement, emptyMessage, true);
    return;
  }

  try {
    startLoopPlayback(sequence);
    setStatus(statusElement, "Playing loop. Press Stop Playback to end.");
    updatePlaybackButtonLabel();
  } catch (error) {
    setStatus(statusElement, `Playback failed: ${error.message}`, true);
  }
}

function startLoopPlayback(sequence) {
  stopPlayback();

  appState.loopDurationSec = Math.max(0.001, sequence.totalTime || 0);

  const playCycle = () => {
    if (appState.loopStartedAtMs === null) {
      return;
    }

    appState.loopStartedAtMs = performance.now();

    if (appState.player.isPlaying()) {
      appState.player.stop();
    }

    appState.player.start(sequence);
    scheduleNextLoopPlayback(playCycle);
  };

  appState.loopStartedAtMs = performance.now();
  startLoopIndicator(sequence);
  playCycle();
}

function scheduleNextLoopPlayback(playCycle) {
  const delayMs = appState.loopDurationSec * 1000;

  appState.loopTimeoutId = window.setTimeout(() => {
    if (appState.loopStartedAtMs === null) {
      return;
    }

    playCycle();
  }, delayMs);
}

function startLoopIndicator(sequence) {
  if (appState.loopAnimationFrameId !== null) {
    window.cancelAnimationFrame(appState.loopAnimationFrameId);
  }

  const qpm = sequence.tempos && sequence.tempos[0] ? sequence.tempos[0].qpm : Number(ui.bpmInput.value);
  const secondsPerBeat = 60 / qpm;
  const secondsPerBar = secondsPerBeat * TIME_SIGNATURE.numerator;

  const update = () => {
    if (appState.loopStartedAtMs === null || appState.loopDurationSec <= 0) {
      return;
    }

    const elapsedSecRaw =
      (performance.now() - appState.loopStartedAtMs) / 1000 - PLAYHEAD_LATENCY_COMPENSATION_SEC;
    const elapsedSecNormalized = Math.max(0, elapsedSecRaw);
    const elapsedSec = elapsedSecNormalized % appState.loopDurationSec;
    const progress = elapsedSec / appState.loopDurationSec;
    const bar = Math.min(LOOP_BARS, Math.floor(elapsedSec / secondsPerBar) + 1);
    const beatInBar = ((elapsedSec % secondsPerBar) / secondsPerBeat) + 1;

    ui.loopPlayhead.style.left = `${(progress * 100).toFixed(2)}%`;
    if (ui.loopPosition) {
      ui.loopPosition.textContent = `Bar ${bar} | Beat ${beatInBar.toFixed(2)}`;
    }

    appState.loopAnimationFrameId = window.requestAnimationFrame(update);
  };

  update();
}

function resetLoopIndicator(sequence = null) {
  const qpm = sequence && sequence.tempos && sequence.tempos[0] ? sequence.tempos[0].qpm : Number(ui.bpmInput.value);
  ui.loopPlayhead.style.left = "0%";
  if (ui.loopPosition) {
    ui.loopPosition.textContent = `Bar 1 | Beat 1.00 @ ${Math.round(qpm)} BPM`;
  }
}

function stopPlayback() {
  if (appState.loopTimeoutId !== null) {
    window.clearTimeout(appState.loopTimeoutId);
    appState.loopTimeoutId = null;
  }

  if (appState.loopAnimationFrameId !== null) {
    window.cancelAnimationFrame(appState.loopAnimationFrameId);
    appState.loopAnimationFrameId = null;
  }

  appState.loopStartedAtMs = null;

  if (appState.player.isPlaying()) {
    appState.player.stop();
  }

  resetLoopIndicator(appState.generatedCASequence);
  updatePlaybackButtonLabel();
}
