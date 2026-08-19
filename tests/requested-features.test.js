'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('all speed controls use the supported 1 to 20 range and default to 4', () => {
    const context = vm.createContext({});
    for (const relativePath of ['js/constants.js', 'js/utils.js', 'js/state.js']) {
        const filePath = path.join(root, relativePath);
        vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, { filename: filePath });
    }
    const speed = vm.runInContext(`({
        defaultTps: DEFAULT_TPS,
        minTps: MIN_TPS,
        maxTps: MAX_TPS,
        tickMs: state.tickMs,
    })`, context);
    const html = read('index.html');
    const lively = JSON.parse(read('LivelyProperties.json'));

    assert.equal(speed.defaultTps, 4);
    assert.equal(speed.minTps, 1);
    assert.equal(speed.maxTps, 20);
    assert.equal(speed.tickMs, 250);
    assert.match(html, /id="speedInput"[^>]*min="1"[^>]*max="20"[^>]*value="4"/);
    assert.equal(lively.speed.min, 1);
    assert.equal(lively.speed.max, 20);
    assert.equal(lively.speed.value, 4);
    assert.match(lively.speed.help, /4 = default/);
    assert.match(read('README.md'), /1[–-]20 ticks per second/);
});

test('an active glow seed gives every personality the same tick interval', () => {
    const context = vm.createContext({});
    for (const relativePath of ['js/constants.js', 'js/utils.js', 'js/state.js']) {
        const filePath = path.join(root, relativePath);
        vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, { filename: filePath });
    }
    const intervals = vm.runInContext(`(() => {
        state.tickMs = 250;
        state.glowSeed.cell = { x: 4, y: 4 };
        return DEFAULT_PERSONALITIES.map(personality => getSnakeTickMs({
            personality,
            wandering: personality === 'lazy',
            _behaviorState: personality === 'cautious' ? 'feared' : null,
        }));
    })()`, context);

    assert.deepEqual(Array.from(intervals), [250, 250, 250, 250]);
});

test('settings controls use native controls and expose dialog state', () => {
    const html = read('index.html');
    for (const id of ['smoothToggle', 'taskbarSpaceToggle', 'nightToggle', 'conwayToggle']) {
        assert.match(html, new RegExp(`<button[^>]*id="${id}"[^>]*role="switch"`));
    }
    assert.match(html, /id="settingsBtn"[^>]*aria-controls="settingsPanel"[^>]*aria-expanded="false"/);
    assert.match(html, /id="settingsPanel"[^>]*aria-hidden="true"[^>]*inert/);
});

test('the settings panel scrolls within a mobile viewport', () => {
    const css = read('style.css');
    assert.match(css, /#settingsPanel\s*\{[\s\S]*?max-height:\s*calc\(100dvh/);
    assert.match(css, /\.panel-body\s*\{[\s\S]*?overflow-y:\s*auto/);
    assert.match(css, /@media\s*\(max-width:\s*480px\)/);
});

test('touch users have an explicit theme save control and status', () => {
    const html = read('index.html');
    assert.match(html, /id="saveThemeBtn"[^>]*aria-pressed="false"/);
    assert.match(html, /id="themeSlotStatus"[^>]*aria-live="polite"/);
});

test('theme loading creates walls before it places snakes and food', () => {
    const ui = read('js/ui.js');
    const start = ui.indexOf('function loadThemeSlot');
    const end = ui.indexOf('// ---- Board colour ----', start);
    const body = ui.slice(start, end);
    const wallSetup = body.indexOf('if (conwayEnabled) conwayInit(true); else conwayClear();');
    const snakeSetup = body.indexOf('state.snakes = [];');

    assert.notEqual(wallSetup, -1);
    assert.notEqual(snakeSetup, -1);
    assert.ok(wallSetup < snakeSetup, 'walls must exist before findRespawnPosition and placeFood run');
});
