'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadDungeon() {
    const previous = new Uint8Array(25);
    const target = new Uint8Array(25);
    target.fill(1);
    const context = vm.createContext({
        console,
        CONWAY_CLEAR_R: 1,
        CONWAY_FADE_MS: 3_000,
        performance: { now: () => 10_000 },
        setTimeout: () => 1,
        clearTimeout() {},
        wallCache: { dirty: false, fade: null },
        state: {
            cols: 5,
            rows: 5,
            conway: {
                enabled: true,
                intensity: 5,
                regenMs: 120_000,
                wallPrev: previous,
                wallTarget: target,
                fadeProgress: 0.5,
                fadeEase: 0.5,
                waveX: 0,
                waveY: 0,
                waveMaxDistance: Math.hypot(4, 4),
                pendingGen: null,
                pendingBuildTimer: 0,
            },
        },
    });
    const filePath = path.join(__dirname, '..', 'js', 'dungeon.js');
    vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, { filename: filePath });
    return context;
}

test('wall renewal reaches near cells before far cells', () => {
    const context = loadDungeon();
    const result = vm.runInContext(`(() => {
        const nearProgress = conwayCellWaveProgress(0);
        const farProgress = conwayCellWaveProgress(24);
        const solid = conwayCurrentSolidGrid();
        return {
            nearProgress,
            farProgress,
            nearSolid: solid[0],
            farSolid: solid[24],
        };
    })()`, context);

    assert.ok(result.nearProgress > result.farProgress);
    assert.equal(result.nearSolid, 1);
    assert.equal(result.farSolid, 0);
});

test('wall renewal finishes on the complete target generation', () => {
    const context = loadDungeon();
    const solid = vm.runInContext(`(() => {
        state.conway.fadeProgress = 1;
        state.conway.fadeEase = 1;
        return Array.from(conwayCurrentSolidGrid());
    })()`, context);

    assert.deepEqual(Array.from(solid), new Array(25).fill(1));
});
