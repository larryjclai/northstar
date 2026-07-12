#[cfg(desktop)]
use tauri::Emitter;
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
    fn northstar_monthly_summary(input: *const libc::c_char) -> *mut libc::c_char;
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
        let c_ctx = CString::new(context_json).map_err(|e| e.to_string())?;

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
async fn monthly_summary_on_device(input_json: String) -> Result<String, String> {
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    {
        use std::ffi::{CStr, CString};
        let c_input = CString::new(input_json).map_err(|e| e.to_string())?;

        let ptr = unsafe { northstar_monthly_summary(c_input.as_ptr()) };
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
        let _ = input_json;
        Err("Foundation Models is only available on Apple platforms.".into())
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
        Some("openapi.twse.com.tw") => {
            url.path().starts_with("/v1/opendata/t187ap03_L")
                || url.path() == "/v1/exchangeReport/STOCK_DAY_ALL"
        }
        Some("www.tpex.org.tw") => url.path().starts_with("/openapi/v1/mopsfin_t187ap03_O"),
        Some("mopsfin.twse.com.tw") => {
            url.path() == "/opendata/t187ap03_L.csv" || url.path() == "/opendata/t187ap03_O.csv"
        }
        Some("www.sitca.org.tw") => url.path() == "/MemberK0000/F/03/nav.csv",
        // Plan 071: the public, user-agnostic ETF sector feed on GitHub Pages.
        // Exactly one host + one fixed path, NO query params — the whole-file pull
        // carries no per-ticker / holding-revealing data.
        Some("larryjclai.github.io") => {
            url.path() == "/northstar/etf-sector-feed.json" && url.query().is_none()
        }
        _ => false,
    }
}

// ── Dock badge for unread reminders ──────────────────────────────────────
// The web layer calls this command with the count of due credit-card
// reminders. On macOS this sets the Dock badge; on other desktops it
// updates the taskbar badge count. Pass 0 or None to clear.
// On mobile the set_badge_count API is unavailable so this is a no-op.
#[tauri::command]
fn set_dock_badge(app: tauri::AppHandle, count: Option<i64>) {
    #[cfg(desktop)]
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_badge_count(count);
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, count);
    }
}

// ── Desktop-only: native zh-TW menu bar ─────────────────────────────────
// Menu labels are hardcoded zh-TW (the app's primary locale) — these do
// NOT go through the web copy.csv i18n catalog because they are native
// menu items rendered by the OS, not by the React layer.
#[cfg(desktop)]
fn build_native_menu(app: &tauri::App) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};

    let handle = app.handle();

    // Custom menu item: 設定… (Settings) — ⌘,
    let settings_item = MenuItemBuilder::with_id("settings", "設定…")
        .accelerator("CmdOrCtrl+,")
        .build(handle)?;

    // App submenu (Northstar)
    let app_menu = SubmenuBuilder::new(handle, "Northstar")
        .about_with_text("關於 Northstar", None)
        .separator()
        .item(&settings_item)
        .separator()
        .services()
        .separator()
        .hide_with_text("隱藏 Northstar")
        .hide_others_with_text("隱藏其他")
        .show_all_with_text("顯示全部")
        .separator()
        .quit_with_text("結束 Northstar")
        .build()?;

    // Edit 編輯 submenu
    let edit_menu = SubmenuBuilder::new(handle, "編輯")
        .undo_with_text("還原")
        .redo_with_text("重做")
        .separator()
        .cut_with_text("剪下")
        .copy_with_text("複製")
        .paste_with_text("貼上")
        .select_all_with_text("全選")
        .build()?;

    // View 檢視 submenu
    let view_menu = SubmenuBuilder::new(handle, "檢視")
        .fullscreen_with_text("進入全螢幕")
        .build()?;

    // Window 視窗 submenu
    let window_menu = SubmenuBuilder::new(handle, "視窗")
        .minimize_with_text("縮到最小")
        .maximize_with_text("縮放")
        .separator()
        .close_window_with_text("關閉視窗")
        .build()?;

    // Help 說明 submenu (minimal)
    let help_menu = SubmenuBuilder::new(handle, "說明").build()?;

    let menu = MenuBuilder::new(handle)
        .item(&app_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&window_menu)
        .item(&help_menu)
        .build()?;

    Ok(menu)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init());

    // Desktop-only: restore the window's last size/position on launch, and
    // handle the custom "settings" menu item → emit an event that the web
    // layer (AppShell.tsx) listens for to navigate to /settings.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .on_menu_event(|app, event| {
            if event.id() == "settings" {
                let _ = app.emit("menu://settings", ());
            }
        });

    // Mobile-only: haptic feedback (impact/notification/selection) — see
    // src/lib/haptics.ts for the JS wrapper, which silently no-ops on desktop.
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_haptics::init());

    builder
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

            // Desktop-only: native zh-TW application menu.
            #[cfg(desktop)]
            {
                let menu = build_native_menu(app)?;
                app.set_menu(menu)?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_yahoo,
            fetch_market_data,
            foundation_models_available,
            parse_quick_add_on_device,
            foundation_models_prewarm,
            monthly_summary_on_device,
            set_dock_badge,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Northstar");
}
