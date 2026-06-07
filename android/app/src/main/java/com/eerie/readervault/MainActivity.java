// C:\Users\eerie\Documents\GitHub\game-guide-manager\android\app\src\main\java\com\eerie\readervault\MainActivity.java
package com.eerie.readervault;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(InteractiveImportPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
