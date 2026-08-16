'use strict';

// Android host bridge. In a normal browser or Lively Wallpaper this file has
// no effect. The Android app provides SnekAndroid through WebView.
(function setupAndroidHost() {
    const params = new URLSearchParams(window.location.search);
    const host = params.get('host');
    if (!host || !host.startsWith('android-')) return;

    const mode = host.slice('android-'.length);
    document.body.setAttribute('data-android-host', mode);
    window._snekMinRenderIntervalMs = 1000 / 30;

    function applySavedSettings(raw) {
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.snakes) || !parsed.snakes.length) return;
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

    settingsPanel.classList.add('open');
    let saveTimer = null;
    function saveSettingsSoon() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            if (!window.SnekAndroid || !window.SnekAndroid.saveSettings) return;
            try {
                const setup = collectThemeSetup();
                setup.reserveTaskbarSpace = false;
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
