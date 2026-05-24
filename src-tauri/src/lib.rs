#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        // Stronghold is the intended vault-key storage plugin. The frontend keeps
        // the public product rules in src/features/connect; the native plugin is
        // registered here so the secure store can be wired in the next pass.
        .plugin(tauri_plugin_stronghold::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running Northstar");
}
