package dev.defamation.snek;

import android.content.SharedPreferences;
import android.service.dreams.DreamService;
import android.webkit.WebView;

public final class SnekDreamService extends DreamService
    implements SharedPreferences.OnSharedPreferenceChangeListener {

    private WebView dreamView;

    @Override
    public void onAttachedToWindow() {
        super.onAttachedToWindow();
        setFullscreen(true);
        setInteractive(false);
        setScreenBright(false);

        dreamView = SnekWebView.create(this, "dream", false);
        setContentView(dreamView);
        SnekPreferences.get(this).registerOnSharedPreferenceChangeListener(this);
    }

    @Override
    public void onDreamingStarted() {
        super.onDreamingStarted();
        if (dreamView != null) dreamView.onResume();
        SnekWebView.setRunning(dreamView, true);
    }

    @Override
    public void onDreamingStopped() {
        SnekWebView.setRunning(dreamView, false);
        if (dreamView != null) dreamView.onPause();
        super.onDreamingStopped();
    }

    @Override
    public void onDetachedFromWindow() {
        SnekPreferences.get(this).unregisterOnSharedPreferenceChangeListener(this);
        if (dreamView != null) {
            dreamView.destroy();
            dreamView = null;
        }
        super.onDetachedFromWindow();
    }

    @Override
    public void onSharedPreferenceChanged(SharedPreferences preferences, String key) {
        if (SnekPreferences.KEY_SETTINGS.equals(key)) {
            SnekWebView.applySettings(dreamView, preferences.getString(key, ""));
        }
    }
}
