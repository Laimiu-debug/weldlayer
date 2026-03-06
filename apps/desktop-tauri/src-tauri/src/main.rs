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
            commands::delete_batch,
            commands::upsert_seam,
            commands::list_seams,
            commands::delete_seam,
            commands::list_match_reports,
            commands::list_audit_logs,
            commands::get_match_audit_bundle,
            commands::freeze_match_baseline,
            commands::list_match_baselines,
            commands::get_match_baseline_impact
        ])
        .run(tauri::generate_context!())
        .expect("tauri app failed to run");
}
