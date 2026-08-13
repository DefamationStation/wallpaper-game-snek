'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('the site builder versions current and future local files automatically', async (t) => {
    const { buildSite } = await import('../tools/build-site.mjs');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'snek-build-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const output = path.join(root, '_site');
    await fs.mkdir(path.join(root, 'future', 'media'), { recursive: true });
    await fs.writeFile(path.join(root, 'index.html'), [
        '<link href="future/new.css">',
        '<script src="future/new.js?old=1&v=manual"></script>',
        '<img srcset="future/media/new.png 1x, future/media/new@2x.png 2x">',
        '<a href="https://example.com/file.js">external</a>',
    ].join('\n'));
    await fs.writeFile(path.join(root, 'future', 'new.css'),
        'body { background: url("media/new.png"); }');
    await fs.writeFile(path.join(root, 'future', 'new.js'),
        'fetch("media/data.json");');
    await fs.writeFile(path.join(root, 'future', 'media', 'data.json'), '{}');
    await fs.writeFile(path.join(root, 'future', 'media', 'new.png'), 'one');
    await fs.writeFile(path.join(root, 'future', 'media', 'new@2x.png'), 'two');

    await buildSite(root, output, 'commit123');

    const html = await fs.readFile(path.join(output, 'index.html'), 'utf8');
    const css = await fs.readFile(path.join(output, 'future', 'new.css'), 'utf8');
    const js = await fs.readFile(path.join(output, 'future', 'new.js'), 'utf8');
    assert.match(html, /future\/new\.css\?v=commit123/);
    assert.match(html, /future\/new\.js\?old=1&amp;v=commit123|future\/new\.js\?old=1&v=commit123/);
    assert.match(html, /future\/media\/new\.png\?v=commit123 1x/);
    assert.match(html, /future\/media\/new%402x\.png\?v=commit123 2x|future\/media\/new@2x\.png\?v=commit123 2x/);
    assert.match(html, /https:\/\/example\.com\/file\.js/);
    assert.match(css, /media\/new\.png\?v=commit123/);
    assert.match(js, /media\/data\.json\?v=commit123/);
    assert.equal(await fs.readFile(path.join(output, 'future', 'media', 'new.png'), 'utf8'), 'one');
});
