'use strict';

// ============================================================
// SETTINGS UI — DOM REFERENCES, EVENT LISTENERS, INIT
// ============================================================

const settingsBtn   = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const closeBtn      = document.getElementById('closeBtn');
const pauseBtn      = document.getElementById('pauseBtn');
const restartBtn    = document.getElementById('restartBtn');
const speedInput    = document.getElementById('speedInput');
const nightToggle   = document.getElementById('nightToggle');
const boardPicker   = document.getElementById('boardColorPicker');
const wallPicker    = document.getElementById('wallColorPicker');
const boardSwatch   = document.getElementById('boardSwatch');
const wallSwatch    = document.getElementById('wallSwatch');
const conwayToggle  = document.getElementById('conwayToggle');
const conwayControls = document.getElementById('conwayControls');
const conwayIntSlider = document.getElementById('conwayIntensitySlider');
const conwayRegenInput = document.getElementById('conwayRegenInput');
const regenLabel    = document.getElementById('regenLabel');
const snakeColorRows = document.getElementById('snakeColorRows');

// ---- Panel open/close ----
settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsPanel.classList.toggle('open');
});
closeBtn.addEventListener('click', () => settingsPanel.classList.remove('open'));

// Track whether a click started inside the panel (mousedown fires before DOM mutations).
// This prevents the panel from closing when clicks remove elements (like the × snake button),
// which causes the target to be detached from the DOM by the time the 'click' event fires.
let _clickStartedInPanel = false;
settingsPanel.addEventListener('mousedown', () => { _clickStartedInPanel = true; });
document.addEventListener('mousedown', (e) => {
    if (!settingsPanel.contains(e.target) && e.target !== settingsBtn) {
        _clickStartedInPanel = false;
    }
});
document.addEventListener('click', (e) => {
    if (_clickStartedInPanel) { _clickStartedInPanel = false; return; }
    if (!settingsPanel.contains(e.target) && e.target !== settingsBtn) {
        settingsPanel.classList.remove('open');
    }
});

// ---- Taskbar offset ----
// Keep the settings button and panel above the Windows taskbar.
function applyTaskbarOffset() {
    const taskbarH = Math.max(
        0,
        window.innerHeight - window.screen.availHeight,
        window.screen.height - window.screen.availHeight
    );
    window.uiInsetBottom = taskbarH;
    settingsBtn.style.bottom = (20 + taskbarH) + 'px';
    settingsPanel.style.bottom = (64 + taskbarH) + 'px';
}
applyTaskbarOffset();
window.addEventListener('resize', applyTaskbarOffset);

// ---- Speed ----
speedInput.addEventListener('input', function () {
    const tps = Math.max(MIN_TPS, Math.min(MAX_TPS, parseInt(this.value) || MIN_TPS));
    state.tickMs = tpsToMs(tps);
});
speedInput.addEventListener('change', function () {
    const tps = Math.max(MIN_TPS, Math.min(MAX_TPS, parseInt(this.value) || MIN_TPS));
    this.value = tps;
    state.tickMs = tpsToMs(tps);
});

// ---- Pause / Resume ----
pauseBtn.addEventListener('click', () => {
    if (state.status === 'running') {
        state.status = 'paused';
        pauseBtn.textContent = 'Resume';
    } else if (state.status === 'paused') {
        state.status = 'running';
        // Reset per-snake tick timers to prevent burst-ticking after a long pause.
        const resumeTs = performance.now();
        for (const sn of state.snakes) { sn.lastTickMs = resumeTs; }
        state.lastTickTime = resumeTs;  // keep for compat
        pauseBtn.textContent = 'Pause';
    }
});

// ---- Restart ----
restartBtn.addEventListener('click', () => {
    initGame();
    pauseBtn.textContent = 'Pause';
});

// ---- Per-snake color rows ----
// Builds one color-picker row per snake in state.snakes.
// Called on initGame and whenever the snake roster changes.
// Each snake gets a label "Snake 1", "Snake 2", etc. and (when 2+ snakes) a × remove button.
function rebuildSnakeColorRows() {
    snakeColorRows.innerHTML = '';
    const showRemove = state.snakes.length > 1;

    state.snakes.forEach((sn, i) => {
        const label = state.snakes.length > 1 ? 'Snake ' + (i + 1) : 'Snake';

        const row = document.createElement('div');
        row.className = 'control-row';
        row.id = 'snakeRow-' + i;

        const lbl = document.createElement('span');
        lbl.className = 'control-label';
        lbl.textContent = label;

        // rightGroup holds the color picker + (optional) remove button side by side.
        const rightGroup = document.createElement('div');
        rightGroup.style.cssText = 'display:flex;align-items:center;gap:6px;';

        const wrap = document.createElement('div');
        wrap.className = 'color-btn-wrap';

        const picker = document.createElement('input');
        picker.type = 'color';
        picker.id = 'snakePicker-' + i;
        picker.value = sn.colorHead;
        picker.setAttribute('aria-label', label + ' color');

        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.id = 'snakeSwatch-' + i;
        swatch.style.background = sn.colorHead;

        picker.addEventListener('input', function () {
            sn.colorHead = this.value;
            sn.colorBody = lightenHex(this.value, 0.28);
            sn.userCustomized = true;
            swatch.style.background = this.value;
        });

        wrap.appendChild(picker);
        wrap.appendChild(swatch);
        rightGroup.appendChild(wrap);

        // × remove button — only shown when 2+ snakes exist.
        if (showRemove) {
            const removeBtn = document.createElement('button');
            removeBtn.className = 'snake-remove-btn';
            removeBtn.textContent = '×';
            removeBtn.setAttribute('aria-label', 'Remove ' + label);
            removeBtn.addEventListener('click', () => removeSnake(sn.id));
            rightGroup.appendChild(removeBtn);
        }

        row.appendChild(lbl);
        row.appendChild(rightGroup);
        snakeColorRows.appendChild(row);
    });

    // Update the Add Snake button's disabled state.
    const addBtn = document.getElementById('addSnakeBtn');
    if (addBtn) {
        addBtn.disabled = state.snakes.length >= MAX_SNAKES;
        addBtn.title = state.snakes.length >= MAX_SNAKES
            ? 'Maximum ' + MAX_SNAKES + ' snakes reached'
            : '';
    }
}

// Sync the snake color picker UI values to reflect current snake state.
// Called after night-mode changes to update any non-customized pickers.
function syncSnakeColorRows() {
    state.snakes.forEach((sn, i) => {
        const picker = document.getElementById('snakePicker-' + i);
        const swatch = document.getElementById('snakeSwatch-' + i);
        if (picker) picker.value = sn.colorHead;
        if (swatch) swatch.style.background = sn.colorHead;
    });
}

// ---- Board colour ----
boardPicker.addEventListener('input', function () {
    if (state.theme === 'night') {
        state.colors.boardNight = this.value;
        state.colors.gridLineNight = lightenHex(this.value, 0.08);
    } else {
        state.colors.board = this.value;
        state.colors.gridLine = lightenHex(this.value, -0.05);
    }
    state.userCustomized.board = true;
    boardSwatch.style.background = this.value;
});

// ---- Wall colour ----
wallPicker.addEventListener('input', function () {
    if (state.theme === 'night') {
        state.colors.wallNight = this.value;
    } else {
        state.colors.wall = this.value;
    }
    state.userCustomized.wall = true;
    wallSwatch.style.background = this.value;
    wallCache.dirty = true;
});

// ---- Night mode ----
nightToggle.addEventListener('click', () => {
    const isNight = state.theme === 'day';
    state.theme = isNight ? 'night' : 'day';
    nightToggle.classList.toggle('active', isNight);
    nightToggle.setAttribute('aria-checked', String(isNight));
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

    // Update snake colors for non-customized snakes to their per-slot palette color.
    for (const sn of state.snakes) {
        if (!sn.userCustomized) {
            const slotColor = (SNAKE_COLORS[state.theme] && SNAKE_COLORS[state.theme][sn.id])
                || p.snakeHead;
            sn.colorHead = slotColor;
            sn.colorBody = lightenHex(slotColor, 0.28);
        }
    }
    syncSnakeColorRows();

    const currentBoard = state.theme === 'night' ? state.colors.boardNight : state.colors.board;
    boardPicker.value = currentBoard;
    boardSwatch.style.background = currentBoard;
    const currentWall = state.theme === 'night' ? state.colors.wallNight : state.colors.wall;
    wallPicker.value = currentWall;
    wallSwatch.style.background = currentWall;
});

// ---- Conway mode toggle ----
conwayToggle.addEventListener('click', () => {
    state.conway.enabled = !state.conway.enabled;
    conwayToggle.classList.toggle('active-orange', state.conway.enabled);
    conwayToggle.setAttribute('aria-checked', String(state.conway.enabled));
    conwayControls.classList.toggle('visible', state.conway.enabled);

    if (state.conway.enabled) {
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
});

// ---- Conway intensity ----
conwayIntSlider.addEventListener('input', function () {
    state.conway.intensity = parseInt(this.value);
    if (state.conway.enabled) conwayInit(false);
});

// ---- Conway refresh time ----
conwayRegenInput.addEventListener('input', function () {
    const sec = Math.max(30, Math.min(500, parseInt(this.value) || 120));
    state.conway.regenMs = sec * 1000;
    regenLabel.textContent = formatRegenLabel(sec);
    if (state.conway.enabled) {
        state.conway.nextRegenMs = performance.now() + state.conway.regenMs;
    }
});
conwayRegenInput.addEventListener('change', function () {
    const sec = Math.max(30, Math.min(500, parseInt(this.value) || 120));
    this.value = sec;
    state.conway.regenMs = sec * 1000;
    regenLabel.textContent = formatRegenLabel(sec);
    if (state.conway.enabled) {
        state.conway.nextRegenMs = performance.now() + state.conway.regenMs;
    }
});

// ============================================================
// INIT — runs after all scripts have loaded
// ============================================================
resizeCanvas();

// Auto night/day based on current hour (night 18:00–08:00).
(function applyTimeTheme() {
    const h = new Date().getHours();
    if (h >= 18 || h < 8) {
        state.theme = 'night';
        document.body.setAttribute('data-theme', 'night');
        const p = PALETTES.night;
        state.colors.boardNight = p.board;
        state.colors.gridLineNight = p.gridLine;
        nightToggle.classList.add('active');
        nightToggle.setAttribute('aria-checked', 'true');
        boardPicker.value = p.board;
        boardSwatch.style.background = p.board;
        wallPicker.value = p.wall;
        wallSwatch.style.background = p.wall;
    }
})();

initGame();

// Build per-snake color rows after initGame() has populated state.snakes.
rebuildSnakeColorRows();

// ---- Add Snake button ----
document.getElementById('addSnakeBtn').addEventListener('click', () => addSnake());

// Expose rebuildSnakeColorRows so game.js can call it when the snake roster changes.
window._uiRebuildSnakeRows = rebuildSnakeColorRows;

startLoop();
