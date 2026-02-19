'use strict';

// ============================================================
// CANVAS SETUP
// ============================================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Offscreen canvas cache for stable (fully-faded) Conway wall renders.
// Invalidated on crossfade start, theme change, or window resize.
const wallCache = { oc: null, dirty: true, theme: null };

function resizeCanvas() {
    // Match current viewport and keep content above taskbar inset.
    const insetBottom = Math.max(
        0,
        window.uiInsetBottom || 0,
        window.innerHeight - window.screen.availHeight,
        window.screen.height - window.screen.availHeight
    );
    canvas.width = window.innerWidth;
    canvas.height = Math.max(1, window.innerHeight - insetBottom);
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';
    state.cols = Math.max(1, Math.floor(canvas.width / CELL_SIZE));
    state.rows = Math.max(1, Math.floor(canvas.height / CELL_SIZE));
    wallCache.dirty = true; // size changed — offscreen canvas must be recreated
}

// initGame is defined later in game.js; the event fires well after all scripts load.
window.addEventListener('resize', () => {
    resizeCanvas();
    initGame();
});
