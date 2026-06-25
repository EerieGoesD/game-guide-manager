use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

// URL loader: fetch a page server-side (bypasses webview CORS), browser UA + bot-block
// detection - mirrors the Electron main-process fetchUrl.
#[tauri::command]
async fn fetch_url(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5")
        .header("Accept-Language", "en-US,en;q=0.9")
        .header("Cache-Control", "no-cache")
        .header("Pragma", "no-cache")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if resp.status().as_u16() >= 400 {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }
    let text = resp.text().await.map_err(|e| e.to_string())?;
    let lower = text.to_lowercase();
    if lower.contains("_cf_chl_opt")
        || lower.contains("challenge-platform")
        || lower.contains("enable javascript and cookies to continue")
    {
        return Err("Blocked by bot protection (try Paste Text).".to_string());
    }
    Ok(text)
}

fn guides_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("guides.json"))
}

#[tauri::command]
fn read_guides(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let p = guides_path(&app)?;
    if !p.exists() {
        return Ok(serde_json::json!([]));
    }
    let txt = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    Ok(serde_json::from_str(&txt).unwrap_or_else(|_| serde_json::json!([])))
}

#[tauri::command]
fn write_guides(app: tauri::AppHandle, guides: serde_json::Value) -> Result<(), String> {
    let p = guides_path(&app)?;
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let txt = serde_json::to_string_pretty(&guides).map_err(|e| e.to_string())?;
    std::fs::write(&p, txt).map_err(|e| e.to_string())?;
    Ok(())
}

// One-time migration from the old Electron version. The Electron build stored guides in
// app.getPath('userData') -> %APPDATA%\Reader Vault\guides.json. If the Tauri app has no
// guides file yet, pull the old one in so an existing user keeps their library.
// On a Store (MSIX) update under the same package identity, AppData is redirected into the
// package container, so the old "Reader Vault" folder sits as a sibling of our app-data dir.
fn migrate_guides_if_needed(app: &tauri::AppHandle) {
    let new_path = match guides_path(app) {
        Ok(p) => p,
        Err(_) => return,
    };
    if new_path.exists() {
        return; // already have data in the new location - never overwrite
    }

    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    // Sibling of our app-data dir (covers the same-container Store update case).
    if let Some(roaming) = new_path.parent().and_then(|p| p.parent()) {
        candidates.push(roaming.join("Reader Vault").join("guides.json"));
        candidates.push(roaming.join("reader-vault").join("guides.json"));
    }
    // Plain %APPDATA% (covers sideloaded / dev Electron installs).
    if let Ok(appdata) = std::env::var("APPDATA") {
        let base = std::path::Path::new(&appdata);
        candidates.push(base.join("Reader Vault").join("guides.json"));
        candidates.push(base.join("reader-vault").join("guides.json"));
    }

    for old in candidates {
        if !old.exists() {
            continue;
        }
        if let Ok(txt) = std::fs::read_to_string(&old) {
            // Only migrate a non-empty JSON array, so we never import junk or empty files.
            if let Ok(serde_json::Value::Array(arr)) =
                serde_json::from_str::<serde_json::Value>(&txt)
            {
                if !arr.is_empty() {
                    if let Some(dir) = new_path.parent() {
                        let _ = std::fs::create_dir_all(dir);
                    }
                    let _ = std::fs::write(&new_path, &txt);
                    return;
                }
            }
        }
    }
}

// Injected into the import window (a real browser engine, so it passes bot protection
// like GameFAQs). Adds an Import button; on click it scrapes the page text and sends it
// to the backend via the IPC bridge.
const IMPORT_INIT_JS: &str = r#"
(function () {
  function extract() {
    var pre = document.querySelector('pre');
    if (pre && pre.innerText && pre.innerText.trim()) return pre.innerText;
    return (document.body && document.body.innerText) ? document.body.innerText : '';
  }
  function addBtn() {
    if (document.getElementById('ggm-import-overlay')) return;
    var btn = document.createElement('button');
    btn.id = 'ggm-import-overlay';
    btn.textContent = 'Import guide into Reader Vault';
    btn.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;padding:12px 16px;font-size:14px;font-family:sans-serif;border:0;border-radius:8px;background:#66c0f4;color:#000;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35);';
    btn.onclick = function () {
      var text = extract();
      btn.textContent = 'Importing...';
      try {
        if (!window.__TAURI__ || !window.__TAURI__.event || !window.__TAURI__.event.emit) {
          btn.textContent = 'No __TAURI__ bridge on this page';
          return;
        }
        window.__TAURI__.event.emit('imported-text', text)
          .then(function () { btn.textContent = 'Imported!'; })
          .catch(function (err) {
            btn.textContent = 'Rejected: ' + (err && err.message ? err.message : JSON.stringify(err));
          });
      } catch (e) {
        btn.textContent = 'Error: ' + (e && e.message ? e.message : e);
      }
    };
    (document.body || document.documentElement).appendChild(btn);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addBtn);
  } else {
    addBtn();
  }
  setTimeout(addBtn, 1500);
})();
"#;

#[tauri::command]
async fn open_import_window(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("import") {
        let _ = existing.close();
    }
    let target: tauri::Url = url.parse().map_err(|_| "Invalid URL".to_string())?;
    WebviewWindowBuilder::new(&app, "import", WebviewUrl::External(target))
        .title("Load the page, then click Import (top-right)")
        .inner_size(1100.0, 820.0)
        .initialization_script(IMPORT_INIT_JS)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn close_import_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("import") {
        let _ = w.close();
    }
    Ok(())
}

// ----------------------------------------------------------------------------
// Microsoft Store in-app purchase (durable "Unlimited Library" add-on).
// Only works from a Store-signed install once the add-on is published; a plain
// dev/sideload run returns false / errors, which the front end treats as locked.
// ----------------------------------------------------------------------------

#[cfg(windows)]
fn init_com() {
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
    // Ignore the result: S_FALSE means this thread was already initialized and
    // RPC_E_CHANGED_MODE means a different apartment is already set - WinRT calls
    // still work in both cases.
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
}

// Returns true if the user owns an active add-on license whose offer token
// matches the product id (the Product ID set on the add-on in Partner Center).
#[cfg(windows)]
#[tauri::command]
async fn store_is_owned(product_id: String) -> Result<bool, String> {
    use windows::Services::Store::StoreContext;

    init_com();
    let ctx = StoreContext::GetDefault().map_err(|e| e.to_string())?;
    let license = ctx
        .GetAppLicenseAsync()
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| e.to_string())?;
    // AddOnLicenses only contains licenses that are currently valid for this user.
    let addons = license.AddOnLicenses().map_err(|e| e.to_string())?;
    for kv in addons {
        let lic = kv.Value().map_err(|e| e.to_string())?;
        if !lic.IsActive().unwrap_or(false) {
            continue;
        }
        let token = lic
            .InAppOfferToken()
            .map(|h| h.to_string())
            .unwrap_or_default();
        if token == product_id {
            return Ok(true);
        }
    }
    Ok(false)
}

// Shows the Store purchase dialog for the given add-on Store ID. Returns
// "owned" on success/already-owned, "cancelled" if the user backed out, or
// Err on a network/server error.
#[cfg(windows)]
#[tauri::command]
async fn store_purchase(app: tauri::AppHandle, store_id: String) -> Result<String, String> {
    use windows::core::{Interface, HSTRING};
    use windows::Services::Store::{StoreContext, StorePurchaseStatus};
    use windows::Win32::UI::Shell::IInitializeWithWindow;

    init_com();
    // A Win32 desktop app must tell the Store which window owns the modal dialog.
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;

    let ctx = StoreContext::GetDefault().map_err(|e| e.to_string())?;
    let init: IInitializeWithWindow = ctx.cast().map_err(|e| e.to_string())?;
    unsafe {
        init.Initialize(hwnd).map_err(|e| e.to_string())?;
    }

    let result = ctx
        .RequestPurchaseAsync(&HSTRING::from(store_id.as_str()))
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| e.to_string())?;

    let status = result.Status().map_err(|e| e.to_string())?;
    if status == StorePurchaseStatus::Succeeded || status == StorePurchaseStatus::AlreadyPurchased {
        Ok("owned".to_string())
    } else if status == StorePurchaseStatus::NotPurchased {
        Ok("cancelled".to_string())
    } else if status == StorePurchaseStatus::NetworkError {
        Err("Network error during purchase.".to_string())
    } else if status == StorePurchaseStatus::ServerError {
        Err("Store server error during purchase.".to_string())
    } else {
        Ok("unknown".to_string())
    }
}

// Non-Windows stubs so the app still compiles on other targets.
#[cfg(not(windows))]
#[tauri::command]
async fn store_is_owned(_product_id: String) -> Result<bool, String> {
    Ok(false)
}

#[cfg(not(windows))]
#[tauri::command]
async fn store_purchase(_app: tauri::AppHandle, _store_id: String) -> Result<String, String> {
    Err("Store purchases are only available on Windows.".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            migrate_guides_if_needed(app.handle());
            // Fill the work area (stop exactly at the taskbar) reliably, not just via the
            // config flag. CSS 100vh then maps to the work area, so the in-app fullscreen
            // reading mode can't run content behind the taskbar.
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.maximize();
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_url,
            read_guides,
            write_guides,
            open_import_window,
            close_import_window,
            store_is_owned,
            store_purchase
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
