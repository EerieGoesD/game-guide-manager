package com.eerie.guidemanager;

import android.app.Activity;
import android.content.Intent;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "InteractiveImport")
public class InteractiveImportPlugin extends Plugin {

  @PluginMethod
  public void open(PluginCall call) {
    String url = call.getString("url");
    if (url == null || url.trim().isEmpty()) {
      call.reject("Invalid URL");
      return;
    }

    Intent i = new Intent(getContext(), InteractiveImportActivity.class);
    i.putExtra("url", url);

    // Callback name must match the @ActivityCallback method below
    startActivityForResult(call, i, "handleResult");
  }

  @ActivityCallback
  private void handleResult(PluginCall call, ActivityResult result) {
    if (call == null) return;

    if (result == null || result.getResultCode() != Activity.RESULT_OK) {
      call.reject("User cancelled");
      return;
    }

    Intent data = result.getData();
    if (data == null) {
      call.reject("Import returned no data");
      return;
    }

    String text = data.getStringExtra("text");
    if (text == null) text = "";

    JSObject ret = new JSObject();
    ret.put("text", text);
    call.resolve(ret);
  }
}