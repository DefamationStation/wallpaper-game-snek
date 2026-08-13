'use strict';

// ============================================================
// CANVAS SETUP
// ============================================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const TASKBAR_RESERVE_PX = 48;

// Offscreen canvas cache for stable (fully-faded) Conway wall renders.
// Invalidated on crossfade start, theme change, or window resize.
const wallCache = { oc: null, dirty: true, theme: null, fade: null };

function getTaskbarInset() {
    return state.reserveTaskbarSpace ? TASKBAR_RESERVE_PX : 0;
}

function resizeCanvas() {
    // Use the full viewport unless the optional taskbar space is enabled.
    const insetBottom = getTaskbarInset();
    canvas.width = window.innerWidth;
    canvas.height = Math.max(1, window.innerHeight - insetBottom);
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';
    state.cols = Math.max(1, Math.floor(canvas.width / CELL_SIZE));
    state.rows = Math.max(1, Math.floor(canvas.height / CELL_SIZE));
    wallCache.dirty = true;
    wallCache.fade = null;
}

// initGame is defined later in game.js; the event fires well after all scripts load.
window.addEventListener('resize', () => {
    resizeCanvas();
    if (typeof initGame === 'function') initGame();
});

