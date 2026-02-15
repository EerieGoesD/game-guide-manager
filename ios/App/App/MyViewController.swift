import Capacitor

public class MyViewController: CAPBridgeViewController {
    override public func capacitorDidLoad() {
        bridge?.registerPluginInstance(InteractiveImportPlugin())
    }
}
