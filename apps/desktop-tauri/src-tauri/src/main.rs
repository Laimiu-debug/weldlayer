mod commands;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::run_match,
            commands::run_parse,
            commands::upsert_pqr,
            commands::list_pqrs,
            commands::delete_pqr,
            commands::upsert_welder,
            commands::list_welders,
            commands::delete_welder,
            commands::upsert_batch,
            commands::list_batches,
            commands::delete_batch
        ])
        .run(tauri::generate_context!())
        .expect("tauri app failed to run");
}
