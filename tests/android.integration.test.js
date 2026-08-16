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

test('Android offers S26 Ultra render sizes and frame rates', () => {
    const html = read('index.html');
    const host = read('js/android-host.js');
    const loop = read('js/loop.js');
    assert.match(html, /id="androidRenderSize"/);
    assert.match(html, /value="720"/);
    assert.match(html, /value="1080" selected/);
    assert.match(html, /value="1440"/);
    assert.match(html, /value="120">120 FPS/);
    assert.match(host, /DEFAULT_RENDER_SHORT_EDGE = 1080/);
    assert.match(host, /DEFAULT_MAX_FPS = 60/);
    assert.match(host, /snekAndroidSetRunning/);
    assert.match(loop, /shouldRender/);
});

test('the Android wallpaper scales its virtual display from saved settings', () => {
    const preferences = read('android/app/src/main/java/dev/defamation/snek/SnekPreferences.java');
    const wallpaper = read('android/app/src/main/java/dev/defamation/snek/SnekWallpaperService.java');
    assert.match(preferences, /DEFAULT_RENDER_SHORT_EDGE = 1080/);
    assert.match(preferences, /value == 720 \|\| value == 1080 \|\| value == 1440/);
    assert.match(wallpaper, /virtualDisplay\.resize\(renderWidth, renderHeight, 160\)/);
    assert.match(wallpaper, /nextRenderShortEdge != renderShortEdge/);
});

test('verified main updates build and publish a signed APK', () => {
    const verify = read('.github/workflows/verify.yml');
    const deploy = read('.github/workflows/deploy.yml');
    assert.match(verify, /assembleDebug lintDebug/);
    assert.match(deploy, /assembleRelease lintRelease/);
    assert.match(deploy, /SNEK_ANDROID_KEYSTORE_BASE64/);
    assert.match(deploy, /_site\/downloads\/snek-latest\.apk/);
    assert.match(deploy, /actions\/upload-artifact@043fb46/);
});
