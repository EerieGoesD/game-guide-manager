// C:\Users\eerie\Documents\GitHub\game-guide-manager\ios\App\App\MyViewController.swift
import Capacitor

public class MyViewController: CAPBridgeViewController {
    override public func capacitorDidLoad() {
        bridge?.registerPluginInstance(InteractiveImportPlugin())
    }
}
