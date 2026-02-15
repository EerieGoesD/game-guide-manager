import Capacitor

public class MyViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(InteractiveImportPlugin())
    }
}