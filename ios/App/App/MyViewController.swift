//C:\Users\eerie\Documents\GitHub\game-guide-manager\android\app\src\main\java\com\eerie\guidemanager\InteractiveImportPlugin.java
import Capacitor

public class MyViewController: CAPBridgeViewController {
    override public func capacitorDidLoad() {
        bridge?.registerPluginInstance(InteractiveImportPlugin())
    }
}
