'use strict';

// ============================================================
// CANVAS SETUP
// ============================================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const TASKBAR_RESERVE_PX = 48;
let canvasLogicalWidth = 1;
let canvasLogicalHeight = 1;
let canvasRenderScale = 1;

// Offscreen canvas cache for stable (fully-faded) Conway wall renders.
// Invalidated on crossfade start, theme change, or window resize.
const wallCache = { oc: null, dirty: true, theme: null, fade: null };

function getTaskbarInset() {
    return state.reserveTaskbarSpace ? TASKBAR_RESERVE_PX : 0;
}

function resizeCanvas() {
    // Use the full viewport unless the optional taskbar space is enabled.
    const insetBottom = getTaskbarInset();
    canvasLogicalWidth = Math.max(1, window.innerWidth);
    canvasLogicalHeight = Math.max(1, window.innerHeight - insetBottom);
    const targetShortEdge = Number(window._snekRenderShortEdge);
    const logicalShortEdge = Math.min(canvasLogicalWidth, canvasLogicalHeight);
    canvasRenderScale = [720, 1080, 1440].includes(targetShortEdge)
        ? targetShortEdge / logicalShortEdge
        : 1;
    canvas.width = Math.max(1, Math.round(canvasLogicalWidth * canvasRenderScale));
    canvas.height = Math.max(1, Math.round(canvasLogicalHeight * canvasRenderScale));
    canvas.style.width = canvasLogicalWidth + 'px';
    canvas.style.height = canvasLogicalHeight + 'px';
    if (typeof ctx.setTransform === 'function') {
        ctx.setTransform(canvasRenderScale, 0, 0, canvasRenderScale, 0, 0);
    }
    state.cols = Math.max(1, Math.floor(canvasLogicalWidth / CELL_SIZE));
    state.rows = Math.max(1, Math.floor(canvasLogicalHeight / CELL_SIZE));
    wallCache.dirty = true;
    wallCache.fade = null;
}

// initGame is defined later in game.js; the event fires well after all scripts load.
window.addEventListener('resize', () => {
    resizeCanvas();
    if (typeof initGame === 'function') initGame();
});

