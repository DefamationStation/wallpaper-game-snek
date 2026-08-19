'use strict';

// Android host bridge. In a normal browser or Lively Wallpaper this file has
// no effect. The Android app provides SnekAndroid through WebView.
(function setupAndroidHost() {
    const params = new URLSearchParams(window.location.search);
    const host = params.get('host');
    if (!host || !host.startsWith('android-')) return;

    const mode = host.slice('android-'.length);
    document.body.setAttribute('data-android-host', mode);
    const renderSizeSelect = document.getElementById('androidRenderSize');
    const maxFpsSelect = document.getElementById('androidMaxFps');
    const DEFAULT_RENDER_SHORT_EDGE = 1080;
    const DEFAULT_MAX_FPS = 60;

    function allowedNumber(value, allowed, fallback) {
        const number = Number(value);
        return allowed.includes(number) ? number : fallback;
    }

    function applyAndroidPerformance(androidSettings) {
        const source = androidSettings || {};
        const renderShortEdge = allowedNumber(source.renderShortEdge, [720, 1080, 1440], DEFAULT_RENDER_SHORT_EDGE);
        const maxFps = allowedNumber(source.maxFps, [30, 60, 90, 120], DEFAULT_MAX_FPS);
        const renderSizeChanged = window._snekRenderShortEdge !== renderShortEdge;
        window._snekRenderShortEdge = renderShortEdge;
        renderSizeSelect.value = String(renderShortEdge);
        maxFpsSelect.value = String(maxFps);
        window._snekMinRenderIntervalMs = 1000 / maxFps;
        if (renderSizeChanged && typeof resizeCanvas === 'function') {
            resizeCanvas();
            if (typeof initGame === 'function') initGame();
        }
    }

    applyAndroidPerformance(null);
    function applySelectedPerformance() {
        applyAndroidPerformance({
            renderShortEdge: renderSizeSelect.value,
            maxFps: maxFpsSelect.value,
        });
    }
    renderSizeSelect.addEventListener('change', applySelectedPerformance);
    maxFpsSelect.addEventListener('change', applySelectedPerformance);

    function applySavedSettings(raw) {
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.snakes) || !parsed.snakes.length) return;
            applyAndroidPerformance(parsed.android);
            localStorage.setItem('snek.themeSlot.android', JSON.stringify(parsed));
            loadThemeSlot('android');
            // Windows taskbar space is not valid on Android.
            applyReserveTaskbarSpace(false, false);
        } catch (_) {
            // Keep the built-in defaults if stored data is invalid.
        }
    }

    function readNativeSettings() {
        try {
            return window.SnekAndroid && window.SnekAndroid.getSettings
                ? window.SnekAndroid.getSettings()
                : '';
        } catch (_) {
            return '';
        }
    }

    applySavedSettings(readNativeSettings());

    window.snekAndroidApplySettings = function (raw) {
        applySavedSettings(raw);
    };

    window.snekAndroidSetRunning = function (running) {
        if (window._livelyBridge) window._livelyBridge.setPaused(!running);
    };

    if (mode !== 'settings') return;

    applyTaskbarOffset();
    openSettingsPanel(false);
    let saveTimer = null;
    function saveSettingsSoon() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            if (!window.SnekAndroid || !window.SnekAndroid.saveSettings) return;
            try {
                const setup = collectThemeSetup();
                setup.reserveTaskbarSpace = false;
                setup.android = {
                    renderShortEdge: allowedNumber(renderSizeSelect.value, [720, 1080, 1440], DEFAULT_RENDER_SHORT_EDGE),
                    maxFps: allowedNumber(maxFpsSelect.value, [30, 60, 90, 120], DEFAULT_MAX_FPS),
                };
                window.SnekAndroid.saveSettings(JSON.stringify(setup));
            } catch (_) {
                // A failed save must not stop the preview.
            }
        }, 80);
    }

    document.addEventListener('input', saveSettingsSoon, true);
    document.addEventListener('change', saveSettingsSoon, true);
    document.addEventListener('click', saveSettingsSoon, true);
    saveSettingsSoon();
})();
