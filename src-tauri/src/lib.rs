use tauri::Manager;

// ── Apple Foundation Models bridge ────────────────────────────────────────
// The Swift symbols are provided by FoundationModels.swift (gen/apple/...).
//   - iOS: Xcode compiles the Swift file as part of the app target.
//   - macOS desktop: build.rs compiles it to a static lib and links it
//     (FoundationModels is weak-linked, so the app still launches on macOS < 26).
// Other platforms (Windows/Linux) have no Swift symbols → commands no-op.
#[cfg(any(target_os = "ios", target_os = "macos"))]
extern "C" {
    fn northstar_foundation_models_available() -> bool;
    fn northstar_parse_on_device(
        text: *const libc::c_char,
        context: *const libc::c_char,
    ) -> *mut libc::c_char;
    fn northstar_free_string(ptr: *mut libc::c_char);
    fn northstar_foundation_models_prewarm();
}

#[tauri::command]
async fn foundation_models_available() -> bool {
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    {
        unsafe { northstar_foundation_models_available() }
    }
    #[cfg(not(any(target_os = "ios", target_os = "macos")))]
    {
        false
    }
}

#[tauri::command]
async fn parse_quick_add_on_device(text: String, context_json: String) -> Result<String, String> {
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    {
        use std::ffi::{CStr, CString};
        let c_text = CString::new(text).map_err(|e| e.to_string())?;
        let c_ctx  = CString::new(context_json).map_err(|e| e.to_string())?;

        let ptr = unsafe { northstar_parse_on_device(c_text.as_ptr(), c_ctx.as_ptr()) };
        if ptr.is_null() {
            return Err("Foundation Models returned null.".into());
        }
        let result = unsafe {
            let s = CStr::from_ptr(ptr).to_string_lossy().into_owned();
            northstar_free_string(ptr);
            s
        };
        Ok(result)
    }
    #[cfg(not(any(target_os = "ios", target_os = "macos")))]
    {
        let _ = (text, context_json);
        Err("Foundation Models is only available on Apple platforms.".into())
    }
}

#[tauri::command]
async fn foundation_models_prewarm() {
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    {
        unsafe { northstar_foundation_models_prewarm() }
    }
}

#[tauri::command]
async fn fetch_yahoo(path_and_query: String) -> Result<String, String> {
    if path_and_query.starts_with("/v8/finance/chart/") == false
        && path_and_query.starts_with("/v1/finance/search") == false
        && path_and_query.starts_with("/v10/finance/quoteSummary/") == false
    {
        return Err("Unsupported Yahoo Finance path.".into());
    }

    let client = reqwest::Client::new();
    let hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
    let mut last_status = String::new();

    for host in hosts {
        let url = format!("https://{}{}", host, path_and_query);
        let parsed = url::Url::parse(&url).map_err(|error| error.to_string())?;
        let response = client
            .get(parsed)
            .header("Accept", "application/json,text/plain,*/*")
            .header("Accept-Language", "zh-TW,zh;q=0.9,en;q=0.8")
            .header("User-Agent", "Mozilla/5.0 Northstar/0.1")
            .send()
            .await
            .map_err(|error| error.to_string())?;

        if response.status().is_success() {
            return response.text().await.map_err(|error| error.to_string());
        }

        last_status = format!("{} from {}", response.status(), host);
        if response.status().as_u16() != 429 {
            break;
        }
    }

    Err(format!("Yahoo Finance returned HTTP {}.", last_status))
}

#[tauri::command]
async fn fetch_market_data(url: String, response_type: String) -> Result<String, String> {
    let parsed = url::Url::parse(&url).map_err(|error| error.to_string())?;
    if is_allowed_market_data_url(&parsed) == false {
        return Err("Unsupported market data URL.".into());
    }

    let client = reqwest::Client::new();
    let response = client
        .get(parsed)
        .header("Accept", "application/json,text/csv,text/plain,*/*")
        .header("Accept-Language", "zh-TW,zh;q=0.9,en;q=0.8")
        .header("User-Agent", "Mozilla/5.0 Northstar/0.1")
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if response.status().is_success() == false {
        return Err(format!("Market data returned HTTP {}.", response.status()));
    }

    let _ = response_type;
    response.text().await.map_err(|error| error.to_string())
}

fn is_allowed_market_data_url(url: &url::Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }

    match url.host_str() {
        Some("openapi.twse.com.tw") => url.path().starts_with("/v1/opendata/t187ap03_L"),
        Some("www.tpex.org.tw") => url.path().starts_with("/openapi/v1/mopsfin_t187ap03_O"),
        Some("mopsfin.twse.com.tw") => {
            url.path() == "/opendata/t187ap03_L.csv" || url.path() == "/opendata/t187ap03_O.csv"
        }
        _ => false,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let salt_path = app
                .path()
                .app_local_data_dir()
                .expect("could not resolve app local data path")
                .join("stronghold-salt.txt");
            app.handle()
                .plugin(tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build())?;

            // Desktop-only self-update. Endpoints + signing pubkey are supplied
            // in tauri.conf.json (plugins.updater); see HANDOVER for release setup.
            // Gracefully skip if the updater config is not yet present.
            #[cfg(desktop)]
            if let Err(e) = app
                .handle()
                .plugin(tauri_plugin_updater::Builder::new().build())
            {
                eprintln!("tauri-plugin-updater skipped: {e}");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_yahoo,
            fetch_market_data,
            foundation_models_available,
            parse_quick_add_on_device,
            foundation_models_prewarm,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Northstar");
}
