'use strict';

// ============================================================
// GAME STATE
// ============================================================
// Single source of truth for all mutable game data.
const state = {
    cols: 0,
    rows: 0,

    // ---- Multi-snake support ----
    // Each entry is a snake object (see makeSnake() in game.js).
    // snakes[0] is always the primary/only snake in single-snake mode.
    snakes: [],

    status: 'running',          // 'running' | 'paused' | 'gameover' | 'complete'
    tickMs: tpsToMs(DEFAULT_TPS),
    lastTickTime: 0,
    restartTimer: null,
    restartCountdown: 0,
    theme: 'day',               // 'day' | 'night'
    smoothMovement: true,       // interpolate snake rendering between ticks
    userCustomized: { board: false, wall: false },
    colors: {
        // Snake head/body colors live on each snake object (sn.colorHead, sn.colorBody).
        // Food color is always derived from the owning snake's colorHead.
        board: '#e8ead6',
        boardNight: '#12121f',
        wall: '#b49b91',
        wallNight: '#504678',
        gridLine: '#d0d2c0',
        gridLineNight: '#1a1a2e',
    },

    // ---- Conway dungeon wall state ----
    conway: {
        enabled: false,
        intensity: 5,         // 1–10: controls wall density and room size
        regenMs: 120_000,     // user-configurable refresh interval (ms)
        wallAlpha: null,      // Float32Array [cols*rows]: 0.0 open → 1.0 solid
        wallTarget: null,     // Uint8Array [cols*rows]: incoming generation
        wallPrev: null,       // Uint8Array [cols*rows]: outgoing generation
        fadeProgress: 1.0,    // 0→1 during crossfade, 1 when stable
        fadeStartMs: 0,
        nextRegenMs: 0,       // absolute timestamp for next regen
    },
};

// ---- Backward-compat shorthands ----
// All existing code that reads state.snake / state.food / state.nextDir
// continues to work unchanged via these transparent getters/setters.
Object.defineProperty(state, 'snake', {
    get() { return state.snakes[0] && state.snakes[0].body; },
    enumerable: false,
});
Object.defineProperty(state, 'food', {
    get() { return state.snakes[0] && state.snakes[0].food; },
    set(v) { if (state.snakes[0]) state.snakes[0].food = v; },
    enumerable: false,
});
Object.defineProperty(state, 'nextDir', {
    get() { return state.snakes[0] && state.snakes[0].nextDir; },
    set(v) { if (state.snakes[0]) state.snakes[0].nextDir = v; },
    enumerable: false,
});

// ============================================================
// COLOUR PALETTES (day / night)
// ============================================================
// Snake colors are per-snake; these palettes cover board/wall/grid only.
// snakeHead entries are used as the default color for each snake slot.
const PALETTES = {
    day: {
        snakeHead: '#7ec8a4',   // default head color for snake 0 in day mode
        board: '#e8ead6',
        wall: '#b49b91',
        gridLine: '#d0d2c0',
    },
    night: {
        snakeHead: '#5fa882',   // default head color for snake 0 in night mode
        board: '#12121f',
        wall: '#504678',
        gridLine: '#1a1a2e',
    },
};
