package dev.defamation.snek;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONException;
import org.json.JSONObject;

final class SnekPreferences {
    static final String FILE_NAME = "snek_wallpaper";
    static final String KEY_SETTINGS = "settings_json";
    static final int DEFAULT_RENDER_SHORT_EDGE = 1080;

    private SnekPreferences() {
    }

    static SharedPreferences get(Context context) {
        return context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE);
    }

    static String read(Context context) {
        return get(context).getString(KEY_SETTINGS, "");
    }

    static void write(Context context, String json) {
        if (json == null || json.length() > 64 * 1024) return;
        get(context).edit().putString(KEY_SETTINGS, json).apply();
    }

    static int readRenderShortEdge(Context context) {
        return renderShortEdgeFrom(read(context));
    }

    static int renderShortEdgeFrom(String json) {
        if (json == null || json.isEmpty()) return DEFAULT_RENDER_SHORT_EDGE;
        try {
            JSONObject root = new JSONObject(json);
            JSONObject android = root.optJSONObject("android");
            if (android == null) return DEFAULT_RENDER_SHORT_EDGE;
            int value = android.optInt("renderShortEdge", DEFAULT_RENDER_SHORT_EDGE);
            if (value == 720 || value == 1080 || value == 1440) return value;
        } catch (JSONException ignored) {
            // Use the safe default for incomplete or damaged settings.
        }
        return DEFAULT_RENDER_SHORT_EDGE;
    }
}
