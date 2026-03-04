mod commands;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![commands::run_match, commands::run_parse])
        .run(tauri::generate_context!())
        .expect("tauri app failed to run");
}
