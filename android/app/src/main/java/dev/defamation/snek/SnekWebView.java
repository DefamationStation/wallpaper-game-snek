package dev.defamation.snek;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Color;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

final class SnekWebView {
    private SnekWebView() {
    }

    @SuppressLint("SetJavaScriptEnabled")
    static WebView create(Context context, String mode, boolean canSave) {
        WebView view = new WebView(context);
        view.setBackgroundColor(Color.rgb(232, 234, 214));
        view.setWebViewClient(new WebViewClient());

        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setBlockNetworkLoads(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        view.addJavascriptInterface(new Bridge(context.getApplicationContext(), canSave), "SnekAndroid");
        view.loadUrl("file:///android_asset/index.html?host=android-" + mode);
        return view;
    }

    static void applySettings(WebView view, String json) {
        if (view == null) return;
        String quoted = org.json.JSONObject.quote(json == null ? "" : json);
        view.post(() -> view.evaluateJavascript(
            "window.snekAndroidApplySettings && window.snekAndroidApplySettings(" + quoted + ");",
            null
        ));
    }

    static void setRunning(WebView view, boolean running) {
        if (view == null) return;
        String value = running ? "true" : "false";
        view.post(() -> view.evaluateJavascript(
            "window.snekAndroidSetRunning && window.snekAndroidSetRunning(" + value + ");",
            null
        ));
    }

    static final class Bridge {
        private final Context context;
        private final boolean canSave;

        Bridge(Context context, boolean canSave) {
            this.context = context;
            this.canSave = canSave;
        }

        @JavascriptInterface
        public String getSettings() {
            return SnekPreferences.read(context);
        }

        @JavascriptInterface
        public void saveSettings(String json) {
            if (canSave) SnekPreferences.write(context, json);
        }
    }
}
