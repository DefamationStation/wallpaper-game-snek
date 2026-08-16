package dev.defamation.snek;

import android.app.Presentation;
import android.content.Context;
import android.content.SharedPreferences;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.os.Bundle;
import android.service.wallpaper.WallpaperService;
import android.view.Display;
import android.view.Surface;
import android.view.SurfaceHolder;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebView;

public final class SnekWallpaperService extends WallpaperService {
    @Override
    public Engine onCreateEngine() {
        return new SnekEngine();
    }

    private final class SnekEngine extends Engine
        implements SharedPreferences.OnSharedPreferenceChangeListener {

        private VirtualDisplay virtualDisplay;
        private SnekPresentation presentation;
        private boolean visible;
        private int surfaceWidth;
        private int surfaceHeight;

        @Override
        public void onCreate(SurfaceHolder surfaceHolder) {
            super.onCreate(surfaceHolder);
            setTouchEventsEnabled(false);
            setOffsetNotificationsEnabled(false);
            SnekPreferences.get(SnekWallpaperService.this)
                .registerOnSharedPreferenceChangeListener(this);
        }

        @Override
        public void onSurfaceChanged(SurfaceHolder holder, int format, int width, int height) {
            super.onSurfaceChanged(holder, format, width, height);
            surfaceWidth = Math.max(1, width);
            surfaceHeight = Math.max(1, height);
            attachRenderer(holder.getSurface());
        }

        @Override
        public void onVisibilityChanged(boolean isVisible) {
            visible = isVisible;
            if (virtualDisplay != null) {
                Surface surface = getSurfaceHolder().getSurface();
                virtualDisplay.setSurface(isVisible && surface.isValid() ? surface : null);
            }
            if (presentation != null) presentation.setRunning(isVisible);
        }

        @Override
        public void onSurfaceDestroyed(SurfaceHolder holder) {
            releaseRenderer();
            super.onSurfaceDestroyed(holder);
        }

        @Override
        public void onDestroy() {
            SnekPreferences.get(SnekWallpaperService.this)
                .unregisterOnSharedPreferenceChangeListener(this);
            releaseRenderer();
            super.onDestroy();
        }

        private void attachRenderer(Surface surface) {
            if (!surface.isValid()) return;

            if (virtualDisplay != null) {
                virtualDisplay.resize(surfaceWidth, surfaceHeight, 160);
                virtualDisplay.setSurface(visible ? surface : null);
                return;
            }

            DisplayManager manager = (DisplayManager) getSystemService(Context.DISPLAY_SERVICE);
            int flags = DisplayManager.VIRTUAL_DISPLAY_FLAG_PRESENTATION
                | DisplayManager.VIRTUAL_DISPLAY_FLAG_OWN_CONTENT_ONLY;
            virtualDisplay = manager.createVirtualDisplay(
                "Snek live wallpaper",
                surfaceWidth,
                surfaceHeight,
                160,
                visible ? surface : null,
                flags
            );
            if (virtualDisplay == null) return;

            Display display = virtualDisplay.getDisplay();
            try {
                presentation = new SnekPresentation(SnekWallpaperService.this, display);
                presentation.show();
                presentation.setRunning(visible);
            } catch (WindowManager.InvalidDisplayException error) {
                releaseRenderer();
            }
        }

        private void releaseRenderer() {
            if (presentation != null) {
                presentation.close();
                presentation = null;
            }
            if (virtualDisplay != null) {
                virtualDisplay.release();
                virtualDisplay = null;
            }
        }

        @Override
        public void onSharedPreferenceChanged(SharedPreferences preferences, String key) {
            if (presentation != null && SnekPreferences.KEY_SETTINGS.equals(key)) {
                presentation.applySettings(preferences.getString(key, ""));
            }
        }
    }

    private static final class SnekPresentation extends Presentation {
        private WebView wallpaperView;

        SnekPresentation(Context context, Display display) {
            super(context, display, R.style.Theme_Snek_Presentation);
        }

        @Override
        protected void onCreate(Bundle savedInstanceState) {
            super.onCreate(savedInstanceState);
            wallpaperView = SnekWebView.create(getContext(), "wallpaper", false);
            setContentView(
                wallpaperView,
                new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            );
        }

        void setRunning(boolean running) {
            if (wallpaperView == null) return;
            if (running) wallpaperView.onResume(); else wallpaperView.onPause();
            SnekWebView.setRunning(wallpaperView, running);
        }

        void applySettings(String json) {
            SnekWebView.applySettings(wallpaperView, json);
        }

        void close() {
            if (wallpaperView != null) {
                wallpaperView.destroy();
                wallpaperView = null;
            }
            dismiss();
        }
    }
}
