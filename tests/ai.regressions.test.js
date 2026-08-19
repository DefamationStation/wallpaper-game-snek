'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadAi() {
    const context = vm.createContext({
        console,
        performance: { now: () => 10_000 },
    });
    for (const relativePath of [
        'js/constants.js',
        'js/utils.js',
        'js/state.js',
        'js/grid.js',
        'js/ai.js',
    ]) {
        const filePath = path.join(__dirname, '..', relativePath);
        vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, { filename: filePath });
    }
    vm.runInContext(`state.cols = 5; state.rows = 5;`, context);
    return context;
}

test('aggressive blocking flood-fill can start from an occupied target head', () => {
    const context = loadAi();
    const result = vm.runInContext(`(() => {
        const occupied = new Uint8Array(25);
        occupied[12] = 1;
        const count = floodFillFromOccupiedStart(2, 2, occupied, 0, 13);
        return { count, startValue: occupied[12] };
    })()`, context);

    assert.equal(result.count, 24);
    assert.equal(result.startValue, 1, 'the helper must restore the shared occupied grid');
});

test('cautious evasion uses an exit range so the state does not flicker at the entry boundary', () => {
    const context = loadAi();
    const result = vm.runInContext(`(() => {
        const cautious = { id: 1, cautiousEvadeTargetSnakeId: null };
        const threat = { id: 2, respawning: false, body: [{ x: 5, y: 0 }] };
        state.snakes = [cautious, threat];
        const entered = selectCautiousThreat(cautious, { x: 0, y: 0 });
        threat.body[0] = { x: 6, y: 0 };
        const retained = selectCautiousThreat(cautious, { x: 0, y: 0 });
        threat.body[0] = { x: 8, y: 0 };
        const exited = selectCautiousThreat(cautious, { x: 0, y: 0 });
        return {
            entered: entered && entered.id,
            retained: retained && retained.id,
            exited: exited && exited.id,
            targetId: cautious.cautiousEvadeTargetSnakeId,
            entryRange: CAUTIOUS_EVADE_RANGE,
            exitRange: CAUTIOUS_EVADE_EXIT_RANGE,
        };
    })()`, context);

    assert.equal(result.entered, 2);
    assert.equal(result.retained, 2);
    assert.equal(result.exited, null);
    assert.equal(result.targetId, null);
    assert.ok(result.exitRange > result.entryRange);
});

test('every personality targets the shared glow seed before its own behavior', () => {
    const context = loadAi();
    const directions = vm.runInContext(`(() => {
        state.cols = 8;
        state.rows = 7;
        state.conway.enabled = false;
        state.glowSeed.cell = { x: 6, y: 3 };
        return PERSONALITIES.map(personality => {
            const snake = {
                id: 1,
                personality,
                body: [{ x: 2, y: 3 }, { x: 1, y: 3 }],
                food: { x: 2, y: 0 },
                nextDir: { x: 0, y: -1 },
                wandering: personality === 'lazy',
                wanderTarget: { x: 0, y: 6 },
                respawning: false,
                _behaviorState: null,
                _behaviorTarget: null,
                cautiousEvadeTargetSnakeId: null,
            };
            state.snakes = [snake];
            const direction = computeNextDirection(snake);
            return { personality, direction, behavior: snake._behaviorState };
        });
    })()`, context);

    for (const result of Array.from(directions)) {
        assert.equal(result.direction.x, 1, result.personality);
        assert.equal(result.direction.y, 0, result.personality);
        assert.equal(result.behavior, 'glow-seeking', result.personality);
    }
});
