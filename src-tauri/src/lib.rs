#[tauri::command]
async fn fetch_yahoo(path_and_query: String) -> Result<String, String> {
    if path_and_query.starts_with("/v8/finance/chart/") == false
        && path_and_query.starts_with("/v1/finance/search") == false
    {
        return Err("Unsupported Yahoo Finance path.".into());
    }

    let url = format!("https://query1.finance.yahoo.com{}", path_and_query);
    let parsed = url::Url::parse(&url).map_err(|error| error.to_string())?;
    let response = reqwest::Client::new()
        .get(parsed)
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if response.status().is_success() == false {
        return Err(format!("Yahoo Finance returned HTTP {}.", response.status()));
    }

    response.text().await.map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        // Stronghold is the intended vault-key storage plugin. The frontend keeps
        // the public product rules in src/features/connect; the native plugin is
        // registered here so the secure store can be wired in the next pass.
        .plugin(tauri_plugin_stronghold::Builder::default().build())
        .invoke_handler(tauri::generate_handler![fetch_yahoo])
        .run(tauri::generate_context!())
        .expect("error while running Northstar");
}
