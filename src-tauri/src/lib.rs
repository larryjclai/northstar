use tauri::Manager;

#[tauri::command]
async fn fetch_yahoo(path_and_query: String) -> Result<String, String> {
    if path_and_query.starts_with("/v8/finance/chart/") == false
        && path_and_query.starts_with("/v1/finance/search") == false
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
        .invoke_handler(tauri::generate_handler![fetch_yahoo])
        .run(tauri::generate_context!())
        .expect("error while running Northstar");
}
