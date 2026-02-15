import Foundation
import Capacitor
import WebKit
import UIKit

@objc(InteractiveImportPlugin)
public class InteractiveImportPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "InteractiveImportPlugin"
    public let jsName = "InteractiveImport"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?
    private var nav: UINavigationController?
    private var webView: WKWebView?

    @objc func open(_ call: CAPPluginCall) {
        guard let urlStr = call.getString("url"), let url = URL(string: urlStr) else {
            call.reject("Invalid URL")
            return
        }

        self.pendingCall = call

        DispatchQueue.main.async {
            let config = WKWebViewConfiguration()
            config.websiteDataStore = .default()

            let wv = WKWebView(frame: .zero, configuration: config)
            wv.allowsBackForwardNavigationGestures = true
            wv.navigationDelegate = nil
            self.webView = wv

            let vc = UIViewController()
            vc.view.backgroundColor = .systemBackground
            vc.navigationItem.title = "Import Guide"

            vc.navigationItem.leftBarButtonItem = UIBarButtonItem(
                barButtonSystemItem: .cancel,
                target: self,
                action: #selector(self.onCancel)
            )

            vc.navigationItem.rightBarButtonItem = UIBarButtonItem(
                title: "Import",
                style: .done,
                target: self,
                action: #selector(self.onImport)
            )

            vc.view.addSubview(wv)
            wv.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                wv.leadingAnchor.constraint(equalTo: vc.view.leadingAnchor),
                wv.trailingAnchor.constraint(equalTo: vc.view.trailingAnchor),
                wv.topAnchor.constraint(equalTo: vc.view.safeAreaLayoutGuide.topAnchor),
                wv.bottomAnchor.constraint(equalTo: vc.view.bottomAnchor)
            ])

            let nav = UINavigationController(rootViewController: vc)
            nav.modalPresentationStyle = .fullScreen
            self.nav = nav

            self.bridge?.viewController?.present(nav, animated: true)

            var req = URLRequest(url: url)
            req.cachePolicy = .reloadIgnoringLocalCacheData
            wv.load(req)
        }
    }

    @objc private func onCancel() {
        DispatchQueue.main.async {
            self.cleanup()
            self.pendingCall?.reject("User cancelled")
            self.pendingCall = nil
        }
    }

    @objc private func onImport() {
        guard let wv = self.webView else {
            self.pendingCall?.reject("WebView not ready")
            self.pendingCall = nil
            return
        }

        // Prefer <pre> if present (GameFAQs print view), else body text.
        let js = """
        (function(){
          function pick(){
            var pre = document.querySelector('pre');
            if (pre && pre.innerText && pre.innerText.trim().length) return pre.innerText;
            if (document.body && document.body.innerText) return document.body.innerText;
            return '';
          }
          return pick();
        })();
        """

        DispatchQueue.main.async {
            wv.evaluateJavaScript(js) { result, error in
                if let error = error {
                    self.cleanup()
                    self.pendingCall?.reject("Import failed: \(error.localizedDescription)")
                    self.pendingCall = nil
                    return
                }

                let text = (result as? String) ?? ""
                self.cleanup()
                self.pendingCall?.resolve(["text": text])
                self.pendingCall = nil
            }
        }
    }

    private func cleanup() {
        DispatchQueue.main.async {
            if let nav = self.nav {
                nav.dismiss(animated: true)
            }
            self.nav = nil
            self.webView = nil
        }
    }
}