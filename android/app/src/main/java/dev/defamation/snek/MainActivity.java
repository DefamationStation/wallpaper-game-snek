package dev.defamation.snek;

import android.app.Activity;
import android.app.WallpaperManager;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.provider.Settings;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private WebView settingsView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(232, 234, 214));

        TextView title = new TextView(this);
        title.setText(R.string.app_name);
        title.setTextColor(Color.rgb(18, 18, 31));
        title.setTextSize(22);
        title.setPadding(dp(20), dp(18), dp(20), dp(4));
        root.addView(title, matchWrap());

        TextView intro = new TextView(this);
        intro.setText(R.string.settings_intro);
        intro.setTextColor(Color.rgb(70, 72, 76));
        intro.setTextSize(14);
        intro.setPadding(dp(20), 0, dp(20), dp(12));
        root.addView(intro, matchWrap());

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setPadding(dp(16), 0, dp(16), dp(12));

        Button setWallpaper = new Button(this);
        setWallpaper.setText(R.string.set_wallpaper);
        setWallpaper.setOnClickListener(view -> openWallpaperPreview());
        actions.addView(setWallpaper, weightedButton());

        Button screenSaver = new Button(this);
        screenSaver.setText(R.string.open_screensaver);
        screenSaver.setOnClickListener(view -> openDreamSettings());
        actions.addView(screenSaver, weightedButton());
        root.addView(actions, matchWrap());

        settingsView = SnekWebView.create(this, "settings", true);
        root.addView(settingsView, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            1f
        ));

        setContentView(root);
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
    }

    private LinearLayout.LayoutParams weightedButton() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(52), 1f);
        params.setMargins(dp(4), 0, dp(4), 0);
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void openWallpaperPreview() {
        Intent intent = new Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER);
        intent.putExtra(
            WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT,
            new ComponentName(this, SnekWallpaperService.class)
        );
        try {
            startActivity(intent);
        } catch (RuntimeException error) {
            Toast.makeText(this, "This device cannot open the live wallpaper preview.", Toast.LENGTH_LONG).show();
        }
    }

    private void openDreamSettings() {
        try {
            startActivity(new Intent(Settings.ACTION_DREAM_SETTINGS));
        } catch (RuntimeException error) {
            Toast.makeText(this, "This device does not provide screen saver settings.", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onPause() {
        SnekWebView.setRunning(settingsView, false);
        if (settingsView != null) settingsView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (settingsView != null) settingsView.onResume();
        SnekWebView.setRunning(settingsView, true);
    }

    @Override
    protected void onDestroy() {
        if (settingsView != null) {
            settingsView.destroy();
            settingsView = null;
        }
        super.onDestroy();
    }
}
