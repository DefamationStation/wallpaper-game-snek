'use strict';

// ============================================================
// CONSTANTS
// ============================================================
const CELL_SIZE = 20;
const DEFAULT_TPS = 8;       // ticks per second at startup
const MIN_TPS = 1;           // slowest: 1 tick/sec
const MAX_TPS = 60;          // fastest: 60 ticks/sec (matches monitor refresh)
const RESTART_DELAY = 10;    // seconds before auto-restart after game over
const CONWAY_FADE_MS = 3_000; // wall crossfade duration in ms
const CONWAY_CLEAR_R = 8;    // cell radius kept clear around snake start

// ---- Satiety / wander mode ----
const SATIETY_MAX = 10;              // foods eaten before entering wander mode
const WANDER_DURATION_MS = 60_000;  // how long wander mode lasts
const WANDER_TRIM_INTERVAL_MS = 6_000; // lose 1 tail segment every 6 s while wandering
const WANDER_MAX_TRIMS = 9;         // total tail segments lost per wander cycle
const WANDER_SPEED_DIVISOR = 2;     // wander tick rate = base tickMs × this

// ---- Multi-snake ----
const MAX_SNAKES = 6;
const SNAKE_RESPAWN_DELAY_MS = 3000;   // ms before a dead non-last snake reappears

// Default head colors for snake slots 0-5, day and night variants.
// Index 0 matches PALETTES.day.snakeHead / PALETTES.night.snakeHead exactly.
const SNAKE_COLORS = {
    day:   ['#7ec8a4', '#c87e7e', '#7e9ac8', '#c8b97e', '#b07ec8', '#c8a07e'],
    night: ['#5fa882', '#a85f5f', '#5f7ea8', '#a89d5f', '#8e5fa8', '#a8835f'],
};
