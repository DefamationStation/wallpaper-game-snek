'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('the web build loads the Android host bridge after the game controls', () => {
    const html = read('index.html');
    assert.match(html, /<script src="js\/lively\.js"><\/script>\s*<script src="js\/android-host\.js"><\/script>/);
});

test('the Android manifest provides wallpaper, screen saver, and settings components', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    assert.match(manifest, /\.MainActivity/);
    assert.match(manifest, /\.SnekWallpaperService/);
    assert.match(manifest, /android\.service\.wallpaper\.WallpaperService/);
    assert.match(manifest, /\.SnekDreamService/);
    assert.match(manifest, /android\.service\.dreams\.DreamService/);
});

test('the Android app copies the current web source into each APK build', () => {
    const build = read('android/app/build.gradle');
    assert.match(build, /tasks\.register\('syncSnekAssets', Copy\)/);
    assert.match(build, /include 'js\/\*\*'/);
    assert.match(build, /dependsOn\(tasks\.named\('syncSnekAssets'\)\)/);
});

test('the website build does not publish the Android source tree', () => {
    const builder = read('tools/build-site.mjs');
    assert.match(builder, /EXCLUDED_DIRECTORIES[\s\S]*'android'/);
});

test('wallpaper and dream hosts hide the in-page settings controls', () => {
    const css = read('style.css');
    assert.match(css, /data-android-host="wallpaper"/);
    assert.match(css, /data-android-host="dream"/);
    assert.match(css, /display: none !important/);
});

test('Android limits visible rendering and can pause hidden WebViews', () => {
    const host = read('js/android-host.js');
    const loop = read('js/loop.js');
    assert.match(host, /_snekMinRenderIntervalMs = 1000 \/ 30/);
    assert.match(host, /snekAndroidSetRunning/);
    assert.match(loop, /shouldRender/);
});
