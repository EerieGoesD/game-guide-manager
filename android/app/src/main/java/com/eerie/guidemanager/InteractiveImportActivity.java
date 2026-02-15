// C:\Users\eerie\Documents\GitHub\game-guide-manager\android\app\src\main\java\com\eerie\guidemanager\InteractiveImportActivity.java
package com.eerie.guidemanager;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import org.json.JSONArray;

public class InteractiveImportActivity extends AppCompatActivity {

  private WebView webView;

  private int dp(int v) {
    return (int) TypedValue.applyDimension(
      TypedValue.COMPLEX_UNIT_DIP,
      v,
      getResources().getDisplayMetrics()
    );
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // Enable edge-to-edge display
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

    String url = getIntent().getStringExtra("url");
    if (url == null) url = "";

    // Root
    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setLayoutParams(new LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT
    ));
    root.setFitsSystemWindows(true);

    // Top bar
    LinearLayout bar = new LinearLayout(this);
    bar.setOrientation(LinearLayout.HORIZONTAL);

    // Base padding
    final int padH = dp(16);
    final int padV = dp(12);
    bar.setPadding(padH, padV, padH, padV);

    Button cancel = new Button(this);
    cancel.setText("Cancel");

    Button importBtn = new Button(this);
    importBtn.setText("Import");

    LinearLayout.LayoutParams lp =
      new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
    lp.setMargins(0, 0, dp(8), 0);
    bar.addView(cancel, lp);
    
    LinearLayout.LayoutParams lp2 =
      new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
    bar.addView(importBtn, lp2);

    // WebView
    webView = new WebView(this);
    LinearLayout.LayoutParams wlp = new LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      0,
      1f
    );

    root.addView(bar);
    root.addView(webView, wlp);

    setContentView(root);

    // Apply window insets properly
    ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
      int topInset = insets.getInsets(WindowInsetsCompat.Type.systemBars()).top;
      int bottomInset = insets.getInsets(WindowInsetsCompat.Type.systemBars()).bottom;
      
      // Add top inset to bar padding
      bar.setPadding(padH, padV + topInset, padH, padV);
      
      // Add bottom inset to webview
      webView.setPadding(0, 0, 0, bottomInset);
      
      return WindowInsetsCompat.CONSUMED;
    });

    WebSettings s = webView.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);

    webView.setWebViewClient(new WebViewClient());
    webView.loadUrl(url);

    cancel.setOnClickListener(v -> {
      setResult(Activity.RESULT_CANCELED);
      finish();
    });

    importBtn.setOnClickListener(v -> doImport());
  }

  private void doImport() {
    String js =
      "(function(){" +
      "  var pre=document.querySelector('pre');" +
      "  if(pre && pre.innerText && pre.innerText.trim().length){return pre.innerText;}" +
      "  if(document.body && document.body.innerText){return document.body.innerText;}" +
      "  return '';" +
      "})()";

    webView.evaluateJavascript(js, value -> {
      try {
        String decoded = new JSONArray("[" + value + "]").getString(0);
        Intent data = new Intent();
        data.putExtra("text", decoded);
        setResult(Activity.RESULT_OK, data);
      } catch (Exception e) {
        Intent data = new Intent();
        data.putExtra("text", "");
        setResult(Activity.RESULT_OK, data);
      }
      finish();
    });
  }
}
