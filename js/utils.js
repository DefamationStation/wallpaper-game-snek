'use strict';

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

// Convert ticks-per-second to milliseconds between ticks.
function tpsToMs(tps) {
    return Math.round(1000 / Math.max(MIN_TPS, Math.min(MAX_TPS, tps)));
}

// Return the movement interval for one snake. A shared glow seed race uses
// the base interval for every personality so all living snakes run equally.
function getSnakeTickMs(sn) {
    if (state.glowSeed && state.glowSeed.cell) return state.tickMs;
    const personalitySpeed = PERSONALITY_META[sn.personality]?.speedMult ?? 1.0;
    const chaseBoost = (sn._behaviorState === 'killing' || sn._behaviorState === 'feared')
        ? CHASE_SPEED_MULT : 1.0;
    return sn.wandering
        ? state.tickMs * WANDER_SPEED_DIVISOR
        : state.tickMs * personalitySpeed * chaseBoost;
}

// Lighten (positive factor) or darken (negative factor) a hex colour.
function lightenHex(hex, factor) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const lr = Math.max(0, Math.min(255, Math.round(r + (255 - r) * factor)));
    const lg = Math.max(0, Math.min(255, Math.round(g + (255 - g) * factor)));
    const lb = Math.max(0, Math.min(255, Math.round(b + (255 - b) * factor)));
    return '#' + lr.toString(16).padStart(2, '0') +
        lg.toString(16).padStart(2, '0') +
        lb.toString(16).padStart(2, '0');
}

// Format seconds into a human-readable label (e.g. "2 min", "1 m 30 s").
function formatRegenLabel(sec) {
    if (sec < 60) return sec + ' s';
    const m = Math.floor(sec / 60), s = sec % 60;
    return s > 0 ? m + ' m ' + s + ' s' : m + ' min';
}
