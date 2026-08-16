package dev.defamation.snek;

import android.content.Context;
import android.content.SharedPreferences;

final class SnekPreferences {
    static final String FILE_NAME = "snek_wallpaper";
    static final String KEY_SETTINGS = "settings_json";

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
}
