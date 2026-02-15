package com.eerie.guidemanager;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(InteractiveImportPlugin.class);
    super.onCreate(savedInstanceState);
  }
}