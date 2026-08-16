'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadCanvas(reserveTaskbarSpace, options = {}) {
    const transforms = [];
    const canvas = {
        style: {},
        getContext: () => ({
            setTransform(...values) {
                transforms.push(values);
            },
        }),
    };
    let resizeHandler = null;
    const context = vm.createContext({
        CELL_SIZE: 20,
        state: { cols: 0, rows: 0, reserveTaskbarSpace },
        document: { getElementById: () => canvas },
        window: {
            innerWidth: options.width || 1200,
            innerHeight: options.height || 800,
            _snekRenderShortEdge: options.renderShortEdge,
            addEventListener(event, handler) {
                if (event === 'resize') resizeHandler = handler;
            },
        },
    });
    const canvasPath = path.join(__dirname, '..', 'js', 'canvas.js');
    vm.runInContext(fs.readFileSync(canvasPath, 'utf8'), context, { filename: canvasPath });
    return { canvas, context, resizeHandler, transforms };
}

test('taskbar space is disabled by default and uses the full viewport', () => {
    const { canvas, context } = loadCanvas(false);

    context.resizeCanvas();

    assert.equal(context.getTaskbarInset(), 0);
    assert.equal(canvas.height, 800);
    assert.equal(canvas.style.height, '800px');
});

test('an early browser resize does not require the game script', () => {
    const { canvas, resizeHandler } = loadCanvas(false);

    assert.doesNotThrow(() => resizeHandler());
    assert.equal(canvas.height, 800);
});

test('enabled taskbar space always reserves a fixed 48 pixels', () => {
    const { canvas, context } = loadCanvas(true);

    context.resizeCanvas();

    assert.equal(context.getTaskbarInset(), 48);
    assert.equal(canvas.height, 752);
    assert.equal(canvas.style.height, '752px');
});

test('Android render quality changes backing pixels but keeps the phone layout', () => {
    const { canvas, context, transforms } = loadCanvas(false, {
        width: 412,
        height: 915,
        renderShortEdge: 1080,
    });

    context.resizeCanvas();

    assert.equal(canvas.width, 1080);
    assert.equal(canvas.style.width, '412px');
    assert.equal(context.state.cols, 20);
    assert.equal(transforms.at(-1)[0], 1080 / 412);
});
