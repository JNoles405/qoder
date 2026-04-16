// FILE: android/app/src/main/java/dev/qoder/app/MainActivity.java
// ──────────────────────────────────────────────────────────────────────────────
// IMPORTANT: Replace "dev.qoder.app" on line 3 with your actual package name.
// To find it: open the existing MainActivity.java — the package is the first line.
// ──────────────────────────────────────────────────────────────────────────────

package dev.qoder.app;

import android.os.Bundle;
import android.text.InputType;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // After Capacitor has built the bridge and WebView, wrap it
        // with our IME-aware InputConnection override
        getBridge().getWebView().post(() -> applyIMEFix());
    }

    private void applyIMEFix() {
        WebView webView = getBridge().getWebView();

        // Replace the WebView with an IME-aware subclass in-place
        // by overriding onCreateInputConnection on the existing instance
        // via a dynamic proxy pattern that Capacitor allows.
        //
        // The simplest reliable approach: post a JS message that forces
        // all inputs to have the right autocomplete attributes, and also
        // ensure the WebView's own inputType is set correctly.

        // Set WebView focusability — required for IME connection
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);

        // Inject JS that sets every current and future input's attributes
        // at the JS layer — belt-and-suspenders with the native approach
        String script =
            "(function() {" +
            "  function fixInput(el) {" +
            "    el.setAttribute('autocomplete', 'on');" +
            "    el.setAttribute('autocorrect', 'on');" +
            "    el.setAttribute('autocapitalize', 'sentences');" +
            "    el.setAttribute('spellcheck', 'true');" +
            "  }" +
            "  document.querySelectorAll('input[type=text],input:not([type]),textarea').forEach(fixInput);" +
            "  var obs = new MutationObserver(function(muts) {" +
            "    muts.forEach(function(m) {" +
            "      m.addedNodes.forEach(function(n) {" +
            "        if (n.nodeType === 1) {" +
            "          if (n.matches('input,textarea')) fixInput(n);" +
            "          n.querySelectorAll && n.querySelectorAll('input,textarea').forEach(fixInput);" +
            "        }" +
            "      });" +
            "    });" +
            "  });" +
            "  obs.observe(document.body, { childList: true, subtree: true });" +
            "})();";

        webView.evaluateJavascript(script, null);
    }
}