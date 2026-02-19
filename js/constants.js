'use strict';

// ============================================================
// CONSTANTS
// ============================================================
const CELL_SIZE = 20;
const DEFAULT_TPS = 4;       // ticks per second at startup
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
const MAX_SNAKES = 10;
const SNAKE_CORPSE_HOLD_MS = 5_000;    // dead snake remains solid/visible before fade starts
const SNAKE_CORPSE_FADE_MS = 5_000;    // fade duration before respawn
const SNAKE_RESPAWN_DELAY_MS = SNAKE_CORPSE_HOLD_MS + SNAKE_CORPSE_FADE_MS;

// Default head colors for snake slots 0-9, day and night variants.
// Index 0 matches PALETTES.day.snakeHead / PALETTES.night.snakeHead exactly.
const SNAKE_COLORS = {
    day: ['#7ec8a4', '#c87e7e', '#7e9ac8', '#c8b97e', '#b07ec8', '#c8a07e', '#7ec8c1', '#c87eb6', '#8fc87e', '#7e8ec8'],
    night: ['#5fa882', '#a85f5f', '#5f7ea8', '#a89d5f', '#8e5fa8', '#a8835f', '#5fa8a1', '#a85f92', '#72a85f', '#5f6ea8'],
};

// ---- Snake personalities ----
const PERSONALITIES = ['aggressive', 'cautious', 'explorer', 'lazy', 'greedy'];
const PERSONALITY_META = {
    aggressive: { label: 'Aggressive', emoji: '😤', safetyMargin: 1, wanderSatiety: SATIETY_MAX, wanderTrims: WANDER_MAX_TRIMS, speedMult: 1.0 },
    cautious: { label: 'Cautious', emoji: '🫣', safetyMargin: 8, wanderSatiety: SATIETY_MAX, wanderTrims: 5, speedMult: 1.0 },
    explorer: { label: 'Explorer', emoji: '🧭', safetyMargin: 4, wanderSatiety: SATIETY_MAX, wanderTrims: WANDER_MAX_TRIMS, speedMult: 0.8 },
    lazy: { label: 'Lazy', emoji: '😴', safetyMargin: 4, wanderSatiety: 5, wanderTrims: 4, speedMult: 1.2 },
    greedy: { label: 'Greedy', emoji: '🤑', safetyMargin: 2, wanderSatiety: Infinity, wanderTrims: 0, speedMult: 1.0 },
};
const GREEDY_DECAY_INTERVAL_MS = 10_000; // greedy loses 1 segment every 10s
const GREEDY_MIN_LENGTH = 3;             // never decays below this length
const GREEDY_STEAL_TRIGGER_CHANCE = 0.3; // chance to enter steal mode after a greedy snake eats
const AGGRESSIVE_KILL_RANGE = 4;         // Manhattan distance from food to trigger kill mode
const AGGRESSIVE_KILL_CHANCE = 0.3;      // probability per tick to enter kill mode
const AGGRESSIVE_RETALIATE_DURATION_MS = 20_000; // aggressive snake hunts food thief for 20s
const CAUTIOUS_EVADE_RANGE = 5;          // Manhattan distance before cautious evades

// ---- Behavior state visual indicators ----
const BEHAVIOR_TINTS = {
    killing: 'rgba(255, 80, 80, 0.85)',   // red bubble for aggressive kill mode
    feared: 'rgba(255, 100, 100, 0.80)',  // red-ish bubble for victim being hunted
    evading: 'rgba(130, 180, 255, 0.85)',  // blue bubble for cautious evasion
    stealing: 'rgba(255, 210, 80, 0.85)',   // gold bubble for greedy food theft
};
const BEHAVIOR_EMOJIS = {
    killing: ['😤', '🔥'],
    feared: ['😨', '😱'],
    evading: ['😰', '🫣'],
    stealing: ['🤑', '💰'],
};
const CHASE_SPEED_MULT = 0.7;  // speed multiplier during kill chase (lower = faster)
