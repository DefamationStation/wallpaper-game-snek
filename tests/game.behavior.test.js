'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadGame() {
    let now = 10_000;
    const context = vm.createContext({
        console,
        performance: { now: () => now },
        state: { snakes: [] },
    });
    const gamePath = path.join(__dirname, '..', 'js', 'game.js');
    vm.runInContext(fs.readFileSync(gamePath, 'utf8'), context, { filename: gamePath });
    return {
        context,
        setNow(value) { now = value; },
    };
}

function loadInitialGame() {
    let conwayInitCalls = 0;
    const context = vm.createContext({
        console,
        performance: { now: () => 10_000 },
        clearInterval() {},
        window: {},
        conwayInit() {
            conwayInitCalls++;
        },
        conwayCurrentSolidGrid() {
            return null;
        },
    });
    for (const relativePath of [
        'js/constants.js',
        'js/utils.js',
        'js/state.js',
        'js/grid.js',
        'js/game.js',
    ]) {
        const filePath = path.join(__dirname, '..', relativePath);
        vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, { filename: filePath });
    }
    vm.runInContext(`
        state.cols = 40;
        state.rows = 30;
        globalThis.getTestState = () => state;
    `, context);
    return {
        context,
        state: context.getTestState(),
        getConwayInitCalls: () => conwayInitCalls,
    };
}

function makeSnake(id, behaviorState = null) {
    return {
        id,
        body: [{ x: id, y: 0 }],
        respawning: false,
        _behaviorState: behaviorState,
        thoughts: [],
    };
}

function enableMoveResolution(context, cols, rows, snakes) {
    context.state.cols = cols;
    context.state.rows = rows;
    context.state.snakes = snakes;
    context.inBounds = (x, y) => x >= 0 && x < cols && y >= 0 && y < rows;
    context.buildOccupiedGrid = () => {
        const occupied = new Uint8Array(cols * rows);
        for (const sn of snakes) {
            for (const cell of sn.body) occupied[cell.y * cols + cell.x] = 1;
        }
        return occupied;
    };
}

test('the default game enables walls and starts without an aggressive snake', () => {
    const { context, state, getConwayInitCalls } = loadInitialGame();

    context.initGame();

    assert.deepEqual(
        Array.from(state.snakes, sn => sn.personality),
        ['cautious', 'explorer', 'lazy', 'greedy']
    );
    assert.equal(state.conway.enabled, true);
    assert.equal(getConwayInitCalls(), 1);
    assert.equal(vm.runInContext(`PERSONALITIES.includes('aggressive')`, context), true);
});

test('near snakes share one tagged social thought', () => {
    const { context } = loadGame();
    const first = makeSnake(0);
    const second = makeSnake(1);
    context.state.snakes = [first, second];

    context.checkGreetings(first);

    assert.equal(first.thoughts.length, 1);
    assert.equal(second.thoughts.length, 1);
    assert.equal(first.thoughts[0].tag, 'social');
    assert.equal(second.thoughts[0].tag, 'social');
});

test('chat replaces the greeting instead of stacking another thought', () => {
    const { context, setNow } = loadGame();
    const first = makeSnake(0);
    const second = makeSnake(1);
    context.state.snakes = [first, second];

    context.checkGreetings(first);
    setNow(15_000);
    context.checkGreetings(first);

    assert.equal(first.thoughts.length, 1);
    assert.equal(second.thoughts.length, 1);
    assert.equal(first.thoughts[0].tag, 'social');
    assert.equal(second.thoughts[0].tag, 'social');
});

test('active hunt removes social thoughts from both snakes', () => {
    const { context, setNow } = loadGame();
    const hunter = makeSnake(0);
    const target = makeSnake(1);
    context.state.snakes = [hunter, target];

    context.checkGreetings(hunter);
    assert.equal(hunter.thoughts.length, 1);
    assert.equal(target.thoughts.length, 1);

    hunter._behaviorState = 'killing';
    target._behaviorState = 'feared';
    setNow(11_000);
    context.checkGreetings(hunter);

    assert.deepEqual(hunter.thoughts, []);
    assert.deepEqual(target.thoughts, []);
});

test('active behavior blocks a new greeting', () => {
    const { context } = loadGame();
    const hunter = makeSnake(0, 'killing');
    const target = makeSnake(1, 'feared');
    context.state.snakes = [hunter, target];

    context.checkGreetings(hunter);

    assert.deepEqual(hunter.thoughts, []);
    assert.deepEqual(target.thoughts, []);
});

test('snakes that choose the same cell both collide', () => {
    const { context } = loadGame();
    const first = makeSnake(0);
    const second = makeSnake(1);
    first.body = [{ x: 0, y: 1 }];
    second.body = [{ x: 2, y: 1 }];
    enableMoveResolution(context, 4, 3, [first, second]);
    const plans = [
        { sn: first, newHead: { x: 1, y: 1 }, ateFood: false },
        { sn: second, newHead: { x: 1, y: 1 }, ateFood: false },
    ];

    const dead = context.findCollidingMovePlans(plans);

    assert.equal(dead.size, 2);
    assert.equal(dead.has(plans[0]), true);
    assert.equal(dead.has(plans[1]), true);
});

test('a snake can enter a tail cell that moves away in the same group', () => {
    const { context } = loadGame();
    const first = makeSnake(0);
    const second = makeSnake(1);
    first.body = [{ x: 1, y: 1 }, { x: 0, y: 1 }];
    second.body = [{ x: 3, y: 1 }, { x: 2, y: 1 }];
    enableMoveResolution(context, 5, 3, [first, second]);
    const plans = [
        { sn: first, newHead: { x: 2, y: 1 }, ateFood: false },
        { sn: second, newHead: { x: 3, y: 0 }, ateFood: false },
    ];

    const dead = context.findCollidingMovePlans(plans);

    assert.equal(dead.size, 0);
});

test('a head swap causes both snakes to collide', () => {
    const { context } = loadGame();
    const first = makeSnake(0);
    const second = makeSnake(1);
    first.body = [{ x: 1, y: 1 }];
    second.body = [{ x: 2, y: 1 }];
    enableMoveResolution(context, 4, 3, [first, second]);
    const plans = [
        { sn: first, newHead: { x: 2, y: 1 }, ateFood: false },
        { sn: second, newHead: { x: 1, y: 1 }, ateFood: false },
    ];

    const dead = context.findCollidingMovePlans(plans);

    assert.equal(dead.size, 2);
});

test('a glow seed adds exactly five segments to its eater', () => {
    const { context, state } = loadInitialGame();
    const snake = context.makeSnake(0, [
        { x: 3, y: 2 },
        { x: 2, y: 2 },
        { x: 1, y: 2 },
    ], '#7ec8a4', 'Test Snek', 'cautious');
    state.snakes = [snake];
    state.glowSeed.cell = { x: 4, y: 2 };
    const before = snake.body.length;

    context.collectGlowSeed(snake, 10_000);

    assert.equal(snake.body.length, before + 5);
    assert.equal(state.glowSeed.cell, null);
    assert.ok(state.glowSeed.nextSpawnMs >= 10_000 + vm.runInContext('GLOW_SEED_MIN_DELAY_MS', context));
});

test('food placement never uses the active glow seed cell', () => {
    const { context, state } = loadInitialGame();
    state.cols = 2;
    state.rows = 1;
    const snake = context.makeSnake(0, [{ x: 0, y: 0 }], '#7ec8a4', 'Test Snek', 'cautious');
    state.snakes = [snake];
    state.glowSeed.cell = { x: 1, y: 0 };

    context.placeFood(snake);

    assert.equal(snake.food, null);
});

test('simultaneous glow seed arrivals select one random winner', () => {
    const { context } = loadGame();
    const first = { ateGlowSeed: true };
    const second = { ateGlowSeed: true };
    const normal = { ateGlowSeed: false };
    vm.runInContext('Math.random = () => 0.75;', context);

    const winner = context.selectGlowSeedWinner([first, second, normal]);

    assert.equal(winner, second);
});
