'use strict';

// ============================================================
// LIVELY WALLPAPER BRIDGE
// ============================================================
// Exposes _livelyBridge so the host app can control the game
// programmatically. livelyPropertyListener must be global (no IIFE)
// so Lively Wallpaper can call it directly.

window._livelyBridge = {
    setSpeed(v) {
        const raw = Number.parseInt(v, 10);
        const tps = Number.isFinite(raw) ? Math.max(MIN_TPS, Math.min(MAX_TPS, raw)) : DEFAULT_TPS;
        state.tickMs = tpsToMs(tps);
        speedInput.value = tps;
    },

    setPaused(val) {
        if (val && state.status === 'running') {
            state.status = 'paused';
            pauseBtn.textContent = 'Resume';
        } else if (!val && state.status === 'paused') {
            state.status = 'running';
            state.lastTickTime = performance.now();
            pauseBtn.textContent = 'Pause';
        }
    },

    setNightMode(val) {
        const goNight = !!val;
        if ((goNight && state.theme === 'night') || (!goNight && state.theme === 'day')) return;
        state.theme = goNight ? 'night' : 'day';
        nightToggle.classList.toggle('active', goNight);
        nightToggle.setAttribute('aria-checked', String(goNight));
        document.body.setAttribute('data-theme', state.theme);
        wallCache.dirty = true;
        const p = PALETTES[state.theme];
        if (state.theme === 'night') {
            state.colors.boardNight = p.board;
            state.colors.gridLineNight = p.gridLine;
            if (!state.userCustomized.wall) state.colors.wallNight = p.wall;
        } else {
            state.colors.board = p.board;
            state.colors.gridLine = p.gridLine;
            if (!state.userCustomized.wall) state.colors.wall = p.wall;
        }
        // Reset non-customized snake colors to the new palette default.
        for (const sn of state.snakes) {
            if (!sn.userCustomized) {
                sn.colorHead = p.snakeHead;
                sn.colorBody = lightenHex(p.snakeHead, 0.28);
            }
        }
        if (window._uiRebuildSnakeRows) window._uiRebuildSnakeRows();
        const currentBoard = state.theme === 'night' ? state.colors.boardNight : state.colors.board;
        boardPicker.value = currentBoard;
        boardSwatch.style.background = currentBoard;
        const currentWall = state.theme === 'night' ? state.colors.wallNight : state.colors.wall;
        wallPicker.value = currentWall;
        wallSwatch.style.background = currentWall;
    },

    // Sets the head color of snake 0 (primary snake) programmatically.
    // Food color is always derived from the snake's head color.
    setSnakeColor(hex) {
        const sn = state.snakes[0];
        if (!sn) return;
        sn.colorHead = hex;
        sn.colorBody = lightenHex(hex, 0.28);
        sn.userCustomized = true;
        // Sync the UI picker/swatch for snake 0.
        const picker = document.getElementById('snakePicker-0');
        const swatch = document.getElementById('snakeSwatch-0');
        if (picker) picker.value = hex;
        if (swatch) swatch.style.background = hex;
    },

    setBoardColor(hex) {
        if (state.theme === 'night') {
            state.colors.boardNight = hex;
            state.colors.gridLineNight = lightenHex(hex, 0.08);
        } else {
            state.colors.board = hex;
            state.colors.gridLine = lightenHex(hex, -0.05);
        }
        state.userCustomized.board = true;
        boardPicker.value = hex;
        boardSwatch.style.background = hex;
    },

    setWallColor(hex) {
        if (state.theme === 'night') {
            state.colors.wallNight = hex;
        } else {
            state.colors.wall = hex;
        }
        state.userCustomized.wall = true;
        wallPicker.value = hex;
        wallSwatch.style.background = hex;
        wallCache.dirty = true;
    },

    setConwayMode(val) {
        const enable = !!val;
        if (enable === state.conway.enabled) return;
        state.conway.enabled = enable;
        conwayToggle.classList.toggle('active-orange', enable);
        conwayToggle.setAttribute('aria-checked', String(enable));
        conwayControls.classList.toggle('visible', enable);
        if (enable) {
            conwayInit(true);
            // Relocate each snake's food if it landed on a newly-generated Conway wall.
            for (const sn of state.snakes) {
                if (sn.food && buildOccupiedGrid(false, true, null)[sn.food.y * state.cols + sn.food.x]) {
                    placeFood(sn);
                }
            }
        } else {
            conwayClear();
        }
    },

    setConwayIntensity(v) {
        const raw = Number.parseInt(v, 10);
        const intensity = Number.isFinite(raw) ? Math.max(1, Math.min(10, raw)) : 5;
        state.conway.intensity = intensity;
        conwayIntSlider.value = intensity;
        if (state.conway.enabled) conwayInit(false);
    },

    setConwayRegenTime(v) {
        const sec = Math.max(30, Math.min(500, parseInt(v) || 120));
        state.conway.regenMs = sec * 1000;
        conwayRegenInput.value = sec;
        regenLabel.textContent = formatRegenLabel(sec);
        if (state.conway.enabled) {
            state.conway.nextRegenMs = performance.now() + state.conway.regenMs;
        }
    },

    restart() {
        initGame();
        pauseBtn.textContent = 'Pause';
    },
};

// Global function required by Lively Wallpaper's property system.
function livelyPropertyListener(name, val) {
    if (!window._livelyBridge) return;
    const b = window._livelyBridge;
    switch (name) {
        case 'speed': b.setSpeed(val); break;
        case 'paused': b.setPaused(val); break;
        case 'nightMode': b.setNightMode(val); break;
        case 'snakeColor': b.setSnakeColor(val); break;
        case 'boardColor': b.setBoardColor(val); break;
        case 'wallColor': b.setWallColor(val); break;
        case 'conwayMode': b.setConwayMode(val); break;
        case 'conwayIntensity': b.setConwayIntensity(val); break;
        case 'conwayRegenSeconds': b.setConwayRegenTime(val); break;
        case 'btnRestart': b.restart(); break;
    }
}
