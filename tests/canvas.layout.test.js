'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadCanvas(reserveTaskbarSpace) {
    const canvas = { style: {}, getContext: () => ({}) };
    const context = vm.createContext({
        CELL_SIZE: 20,
        state: { cols: 0, rows: 0, reserveTaskbarSpace },
        document: { getElementById: () => canvas },
        window: {
            innerWidth: 1200,
            innerHeight: 800,
            addEventListener() {},
        },
    });
    const canvasPath = path.join(__dirname, '..', 'js', 'canvas.js');
    vm.runInContext(fs.readFileSync(canvasPath, 'utf8'), context, { filename: canvasPath });
    return { canvas, context };
}

test('taskbar space is disabled by default and uses the full viewport', () => {
    const { canvas, context } = loadCanvas(false);

    context.resizeCanvas();

    assert.equal(context.getTaskbarInset(), 0);
    assert.equal(canvas.height, 800);
    assert.equal(canvas.style.height, '800px');
});

test('enabled taskbar space always reserves a fixed 48 pixels', () => {
    const { canvas, context } = loadCanvas(true);

    context.resizeCanvas();

    assert.equal(context.getTaskbarInset(), 48);
    assert.equal(canvas.height, 752);
    assert.equal(canvas.style.height, '752px');
});
