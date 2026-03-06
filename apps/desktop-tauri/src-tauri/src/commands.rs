use app_service::{
    archive_project as archive_project_service,
    delete_consumable_batch, delete_pqr_profile, delete_weld_seam, delete_welder_profile,
    freeze_match_baseline as freeze_match_baseline_service,
    get_project as get_project_service,
    get_match_audit_bundle as get_match_audit_bundle_service,
    get_match_baseline_impact as get_match_baseline_impact_service,
    list_projects as list_projects_service,
    list_audit_logs as list_audit_logs_service, list_consumable_batches,
    list_match_baselines as list_match_baselines_service,
    list_match_reports as list_match_reports_service, list_pqr_profiles, list_weld_seams,
    list_welder_profiles, run_match_and_persist_with_master_data, run_parse_via_sidecar,
    upsert_project as upsert_project_service,
    upsert_consumable_batch, upsert_pqr_profile, upsert_weld_seam, upsert_welder_profile,
    SidecarConfig,
};
use contracts::matching::{
    ConsumableBatch, MatchRequest, PqrCandidate, StandardCode, WeldSeam, WelderCandidate,
};
use contracts::parser::ParseRequest;
use serde::Serialize;
use std::env;
use std::path::{Path, PathBuf};
use base64::Engine as _;

const SIDECAR_RELATIVE_PATH: &str = "sidecar/parser-python/parser_sidecar.py";

fn sidecar_path_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(custom_path) = env::var("WELDLAYER_SIDECAR_PATH") {
        let trimmed = custom_path.trim();
        if !trimmed.is_empty() {
            candidates.push(PathBuf::from(trimmed));
        }
    }

    if let Ok(cwd) = env::current_dir() {
        let mut base = cwd;
        for _ in 0..=4 {
            candidates.push(base.join(SIDECAR_RELATIVE_PATH));
            if !base.pop() {
                break;
            }
        }
    }

    candidates.push(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("..")
            .join(SIDECAR_RELATIVE_PATH),
    );

    candidates
}

fn resolve_sidecar_script_path() -> Result<String, String> {
    let candidates = sidecar_path_candidates();

    for candidate in &candidates {
        if candidate.is_file() {
            return Ok(candidate.to_string_lossy().into_owned());
        }
    }

    let checked = candidates
        .iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("; ");

    Err(format!(
        "sidecar script not found; set WELDLAYER_SIDECAR_PATH or place parser_sidecar.py in one of: {checked}"
    ))
}

fn build_sidecar_config() -> Result<SidecarConfig, String> {
    let interpreter = env::var("WELDLAYER_PYTHON")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "python".to_string());
    let script_path = resolve_sidecar_script_path()?;

    Ok(SidecarConfig {
        interpreter,
        script_path,
    })
}

fn parse_standard_code(value: &str) -> Result<StandardCode, String> {
    match value.trim().to_ascii_uppercase().as_str() {
        "ASME_IX" | "ASMEIX" | "ASME-IX" | "ASME IX" => Ok(StandardCode::AsmeIx),
        "CN_GB" | "CNGB" | "CN-GB" | "CN GB" => Ok(StandardCode::CnGb),
        other => Err(format!("unsupported standard code: {other}")),
    }
}

#[derive(Debug, Serialize)]
struct PickedDrawingFile {
    path: String,
    file_name: String,
    file_type: String,
    size_bytes: u64,
}

#[derive(Debug, Serialize)]
struct DrawingPreviewPayload {
    mime_type: String,
    base64: String,
}

fn infer_drawing_file_type(path: &Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.trim().to_ascii_lowercase())
        .as_deref()
    {
        Some("pdf") => Some("pdf"),
        Some("dwg") => Some("dwg"),
        _ => None,
    }
}

fn infer_preview_mime_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.trim().to_ascii_lowercase())
        .as_deref()
    {
        Some("pdf") => "application/pdf",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        _ => "application/octet-stream",
    }
}

#[tauri::command]
pub fn upsert_project(
    db_path: String,
    project_id: String,
    project_name: String,
    company_name: String,
    drawing_type: String,
    standard_code: String,
) -> Result<String, String> {
    let standard_code = parse_standard_code(&standard_code)?;
    upsert_project_service(
        &db_path,
        &project_id,
        &project_name,
        &company_name,
        &drawing_type,
        &standard_code,
    )
    .map_err(|e| format!("upsert project failed: {e}"))?;
    Ok("{\"ok\":true}".to_string())
}

#[tauri::command]
pub fn get_project(db_path: String, project_id: String) -> Result<String, String> {
    let row = get_project_service(&db_path, &project_id)
        .map_err(|e| format!("get project failed: {e}"))?;
    serde_json::to_string(&row.map(|item| {
        serde_json::json!({
            "project_id": item.project_id,
            "project_name": item.project_name,
            "company_name": item.company_name,
            "drawing_type": item.drawing_type,
            "standard_code": format!("{:?}", item.standard_code),
            "archived_at": item.archived_at,
            "updated_at": item.updated_at
        })
    }))
    .map_err(|e| format!("serialize project failed: {e}"))
}

#[tauri::command]
pub fn list_projects(
    db_path: String,
    limit: Option<usize>,
    include_archived: Option<bool>,
) -> Result<String, String> {
    let rows = list_projects_service(&db_path, limit.unwrap_or(20), include_archived.unwrap_or(true))
        .map_err(|e| format!("list projects failed: {e}"))?;
    let payload = rows
        .into_iter()
        .map(|item| {
            serde_json::json!({
                "project_id": item.project_id,
                "project_name": item.project_name,
                "company_name": item.company_name,
                "drawing_type": item.drawing_type,
                "standard_code": format!("{:?}", item.standard_code),
                "archived_at": item.archived_at,
                "updated_at": item.updated_at
            })
        })
        .collect::<Vec<_>>();
    serde_json::to_string(&payload).map_err(|e| format!("serialize project list failed: {e}"))
}

#[tauri::command]
pub fn archive_project(
    db_path: String,
    project_id: String,
    archived: Option<bool>,
) -> Result<String, String> {
    let archived = archived.unwrap_or(true);
    let changed = archive_project_service(&db_path, &project_id, archived)
        .map_err(|e| format!("archive project failed: {e}"))?;
    serde_json::to_string(&serde_json::json!({ "changed": changed, "archived": archived }))
        .map_err(|e| format!("serialize archive project result failed: {e}"))
}

#[tauri::command]
pub fn pick_drawing_files() -> Result<String, String> {
    let files = rfd::FileDialog::new()
        .add_filter("Drawing Files", &["pdf", "dwg"])
        .pick_files()
        .unwrap_or_default();

    let payload = files
        .into_iter()
        .filter_map(|path| {
            let file_type = infer_drawing_file_type(&path)?;
            let metadata = std::fs::metadata(&path).ok();
            Some(PickedDrawingFile {
                path: path.to_string_lossy().into_owned(),
                file_name: path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or_default()
                    .to_string(),
                file_type: file_type.to_string(),
                size_bytes: metadata.map(|value| value.len()).unwrap_or(0),
            })
        })
        .collect::<Vec<_>>();

    serde_json::to_string(&payload).map_err(|e| format!("serialize picked drawing files failed: {e}"))
}

#[tauri::command]
pub fn read_drawing_preview(path: String) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("drawing preview path is empty".to_string());
    }

    let file_path = PathBuf::from(trimmed);
    let bytes = std::fs::read(&file_path)
        .map_err(|e| format!("read drawing preview failed for {}: {e}", file_path.display()))?;
    let payload = DrawingPreviewPayload {
        mime_type: infer_preview_mime_type(&file_path).to_string(),
        base64: base64::engine::general_purpose::STANDARD.encode(bytes),
    };
    serde_json::to_string(&payload).map_err(|e| format!("serialize drawing preview failed: {e}"))
}

#[tauri::command]
pub fn run_match(
    db_path: String,
    project_name: String,
    request_json: String,
) -> Result<String, String> {
    let request = serde_json::from_str::<MatchRequest>(&request_json)
        .map_err(|e| format!("invalid match request: {e}"))?;
    let response = run_match_and_persist_with_master_data(&db_path, &project_name, &request)
        .map_err(|e| format!("match service failed: {e}"))?;
    serde_json::to_string(&response).map_err(|e| format!("serialize match response failed: {e}"))
}

#[tauri::command]
pub fn run_parse(request_json: String) -> Result<String, String> {
    let request = serde_json::from_str::<ParseRequest>(&request_json)
        .map_err(|e| format!("invalid parse request: {e}"))?;
    let sidecar = build_sidecar_config()?;
    let response = run_parse_via_sidecar(&sidecar, &request)
        .map_err(|e| format!("parse service failed: {e}"))?;
    serde_json::to_string(&response).map_err(|e| format!("serialize parse response failed: {e}"))
}

#[tauri::command]
pub fn upsert_pqr(db_path: String, project_id: String, pqr_json: String) -> Result<String, String> {
    let pqr = serde_json::from_str::<PqrCandidate>(&pqr_json)
        .map_err(|e| format!("invalid pqr json: {e}"))?;
    upsert_pqr_profile(&db_path, &project_id, &pqr)
        .map_err(|e| format!("upsert pqr failed: {e}"))?;
    Ok("{\"ok\":true}".to_string())
}

#[tauri::command]
pub fn list_pqrs(
    db_path: String,
    project_id: String,
    limit: Option<usize>,
) -> Result<String, String> {
    let rows = list_pqr_profiles(&db_path, &project_id, limit.unwrap_or(200))
        .map_err(|e| format!("list pqr failed: {e}"))?;
    serde_json::to_string(&rows).map_err(|e| format!("serialize pqr list failed: {e}"))
}

#[tauri::command]
pub fn delete_pqr(db_path: String, project_id: String, pqr_id: String) -> Result<String, String> {
    let deleted = delete_pqr_profile(&db_path, &project_id, &pqr_id)
        .map_err(|e| format!("delete pqr failed: {e}"))?;
    serde_json::to_string(&serde_json::json!({ "deleted": deleted }))
        .map_err(|e| format!("serialize delete pqr result failed: {e}"))
}

#[tauri::command]
pub fn upsert_welder(
    db_path: String,
    project_id: String,
    welder_json: String,
) -> Result<String, String> {
    let welder = serde_json::from_str::<WelderCandidate>(&welder_json)
        .map_err(|e| format!("invalid welder json: {e}"))?;
    upsert_welder_profile(&db_path, &project_id, &welder)
        .map_err(|e| format!("upsert welder failed: {e}"))?;
    Ok("{\"ok\":true}".to_string())
}

#[tauri::command]
pub fn list_welders(
    db_path: String,
    project_id: String,
    limit: Option<usize>,
) -> Result<String, String> {
    let rows = list_welder_profiles(&db_path, &project_id, limit.unwrap_or(200))
        .map_err(|e| format!("list welder failed: {e}"))?;
    serde_json::to_string(&rows).map_err(|e| format!("serialize welder list failed: {e}"))
}

#[tauri::command]
pub fn delete_welder(
    db_path: String,
    project_id: String,
    welder_id: String,
) -> Result<String, String> {
    let deleted = delete_welder_profile(&db_path, &project_id, &welder_id)
        .map_err(|e| format!("delete welder failed: {e}"))?;
    serde_json::to_string(&serde_json::json!({ "deleted": deleted }))
        .map_err(|e| format!("serialize delete welder result failed: {e}"))
}

#[tauri::command]
pub fn upsert_batch(
    db_path: String,
    project_id: String,
    batch_json: String,
) -> Result<String, String> {
    let batch = serde_json::from_str::<ConsumableBatch>(&batch_json)
        .map_err(|e| format!("invalid batch json: {e}"))?;
    upsert_consumable_batch(&db_path, &project_id, &batch)
        .map_err(|e| format!("upsert batch failed: {e}"))?;
    Ok("{\"ok\":true}".to_string())
}

#[tauri::command]
pub fn list_batches(
    db_path: String,
    project_id: String,
    limit: Option<usize>,
) -> Result<String, String> {
    let rows = list_consumable_batches(&db_path, &project_id, limit.unwrap_or(200))
        .map_err(|e| format!("list batch failed: {e}"))?;
    serde_json::to_string(&rows).map_err(|e| format!("serialize batch list failed: {e}"))
}

#[tauri::command]
pub fn delete_batch(
    db_path: String,
    project_id: String,
    batch_no: String,
) -> Result<String, String> {
    let deleted = delete_consumable_batch(&db_path, &project_id, &batch_no)
        .map_err(|e| format!("delete batch failed: {e}"))?;
    serde_json::to_string(&serde_json::json!({ "deleted": deleted }))
        .map_err(|e| format!("serialize delete batch result failed: {e}"))
}

#[tauri::command]
pub fn upsert_seam(
    db_path: String,
    project_id: String,
    seam_json: String,
) -> Result<String, String> {
    let seam = serde_json::from_str::<WeldSeam>(&seam_json)
        .map_err(|e| format!("invalid seam json: {e}"))?;
    upsert_weld_seam(&db_path, &project_id, &seam)
        .map_err(|e| format!("upsert seam failed: {e}"))?;
    Ok("{\"ok\":true}".to_string())
}

#[tauri::command]
pub fn list_seams(
    db_path: String,
    project_id: String,
    limit: Option<usize>,
) -> Result<String, String> {
    let rows = list_weld_seams(&db_path, &project_id, limit.unwrap_or(200))
        .map_err(|e| format!("list seam failed: {e}"))?;
    serde_json::to_string(&rows).map_err(|e| format!("serialize seam list failed: {e}"))
}

#[tauri::command]
pub fn delete_seam(db_path: String, project_id: String, weld_id: String) -> Result<String, String> {
    let deleted = delete_weld_seam(&db_path, &project_id, &weld_id)
        .map_err(|e| format!("delete seam failed: {e}"))?;
    serde_json::to_string(&serde_json::json!({ "deleted": deleted }))
        .map_err(|e| format!("serialize delete seam result failed: {e}"))
}

#[tauri::command]
pub fn list_match_reports(
    db_path: String,
    project_id: Option<String>,
    limit: Option<usize>,
) -> Result<String, String> {
    let rows = list_match_reports_service(&db_path, project_id.as_deref(), limit.unwrap_or(20))
        .map_err(|e| format!("list match reports failed: {e}"))?;
    let payload = rows
        .into_iter()
        .map(|row| {
            serde_json::json!({
                "trace_id": row.trace_id,
                "project_id": row.project_id,
                "decision": row.decision,
                "rule_package_version": row.rule_package_version,
                "request_json": row.request_json,
                "response_json": row.response_json,
                "created_at": row.created_at
            })
        })
        .collect::<Vec<_>>();
    serde_json::to_string(&payload).map_err(|e| format!("serialize match reports failed: {e}"))
}

#[tauri::command]
pub fn list_audit_logs(
    db_path: String,
    project_id: Option<String>,
    limit: Option<usize>,
) -> Result<String, String> {
    let rows = list_audit_logs_service(&db_path, project_id.as_deref(), limit.unwrap_or(20))
        .map_err(|e| format!("list audit logs failed: {e}"))?;
    let payload = rows
        .into_iter()
        .map(|row| {
            serde_json::json!({
                "trace_id": row.trace_id,
                "action": row.action,
                "result": row.result,
                "payload_json": row.payload_json,
                "created_at": row.created_at
            })
        })
        .collect::<Vec<_>>();
    serde_json::to_string(&payload).map_err(|e| format!("serialize audit logs failed: {e}"))
}

#[tauri::command]
pub fn get_match_audit_bundle(db_path: String, trace_id: String) -> Result<String, String> {
    let payload = get_match_audit_bundle_service(&db_path, &trace_id)
        .map_err(|e| format!("get audit bundle failed: {e}"))?;
    serde_json::to_string(&payload).map_err(|e| format!("serialize audit bundle failed: {e}"))
}

#[tauri::command]
pub fn freeze_match_baseline(
    db_path: String,
    trace_id: String,
    baseline_label: Option<String>,
) -> Result<String, String> {
    let row = freeze_match_baseline_service(&db_path, &trace_id, baseline_label.as_deref())
        .map_err(|e| format!("freeze match baseline failed: {e}"))?;
    let payload = serde_json::json!({
        "trace_id": row.trace_id,
        "project_id": row.project_id,
        "baseline_label": row.baseline_label,
        "decision": row.decision,
        "rule_package_version": row.rule_package_version,
        "summary_json": row.summary_json,
        "created_at": row.created_at
    });
    serde_json::to_string(&payload).map_err(|e| format!("serialize baseline failed: {e}"))
}

#[tauri::command]
pub fn list_match_baselines(
    db_path: String,
    project_id: String,
    limit: Option<usize>,
) -> Result<String, String> {
    let rows = list_match_baselines_service(&db_path, &project_id, limit.unwrap_or(20))
        .map_err(|e| format!("list match baselines failed: {e}"))?;
    serde_json::to_string(&rows).map_err(|e| format!("serialize match baselines failed: {e}"))
}

#[tauri::command]
pub fn get_match_baseline_impact(
    db_path: String,
    trace_id: String,
    limit_per_scope: Option<usize>,
    compare_trace_id: Option<String>,
) -> Result<String, String> {
    let payload = get_match_baseline_impact_service(
        &db_path,
        &trace_id,
        limit_per_scope.unwrap_or(5),
        compare_trace_id.as_deref(),
    )
    .map_err(|e| format!("get match baseline impact failed: {e}"))?;
    serde_json::to_string(&payload)
        .map_err(|e| format!("serialize match baseline impact failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_match_rejects_invalid_json() {
        let result = run_match(
            "weldlayer.db".to_string(),
            "Demo".to_string(),
            "{".to_string(),
        );
        assert!(result.is_err());
        assert!(result
            .expect_err("invalid JSON should return Err")
            .contains("invalid match request"));
    }

    #[test]
    fn run_parse_rejects_invalid_json() {
        let result = run_parse("{".to_string());
        assert!(result.is_err());
        assert!(result
            .expect_err("invalid JSON should return Err")
            .contains("invalid parse request"));
    }

    #[test]
    fn resolve_sidecar_script_path_finds_existing_script() {
        let script_path =
            resolve_sidecar_script_path().expect("sidecar script should exist in repository");
        assert!(Path::new(&script_path).is_file());
        assert!(script_path.ends_with("parser_sidecar.py"));
    }

    #[test]
    fn infer_drawing_file_type_recognizes_supported_extensions() {
        assert_eq!(
            infer_drawing_file_type(Path::new("C:/demo/a.PDF")),
            Some("pdf")
        );
        assert_eq!(
            infer_drawing_file_type(Path::new("C:/demo/a.dwg")),
            Some("dwg")
        );
        assert_eq!(infer_drawing_file_type(Path::new("C:/demo/a.txt")), None);
    }
}
