use app_service::{
    SidecarConfig, delete_consumable_batch, delete_pqr_profile, delete_welder_profile,
    list_consumable_batches, list_pqr_profiles, list_welder_profiles,
    run_match_and_persist_with_master_data, run_parse_via_sidecar, upsert_consumable_batch,
    upsert_pqr_profile, upsert_welder_profile,
};
use contracts::matching::{ConsumableBatch, MatchRequest, PqrCandidate, WelderCandidate};
use contracts::parser::ParseRequest;
use std::env;
use std::path::{Path, PathBuf};

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
    let pqr =
        serde_json::from_str::<PqrCandidate>(&pqr_json).map_err(|e| format!("invalid pqr json: {e}"))?;
    upsert_pqr_profile(&db_path, &project_id, &pqr).map_err(|e| format!("upsert pqr failed: {e}"))?;
    Ok("{\"ok\":true}".to_string())
}

#[tauri::command]
pub fn list_pqrs(db_path: String, project_id: String, limit: Option<usize>) -> Result<String, String> {
    let rows = list_pqr_profiles(&db_path, &project_id, limit.unwrap_or(200))
        .map_err(|e| format!("list pqr failed: {e}"))?;
    serde_json::to_string(&rows).map_err(|e| format!("serialize pqr list failed: {e}"))
}

#[tauri::command]
pub fn delete_pqr(db_path: String, project_id: String, pqr_id: String) -> Result<String, String> {
    let deleted =
        delete_pqr_profile(&db_path, &project_id, &pqr_id).map_err(|e| format!("delete pqr failed: {e}"))?;
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
    let batch =
        serde_json::from_str::<ConsumableBatch>(&batch_json).map_err(|e| format!("invalid batch json: {e}"))?;
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
        assert!(
            result
                .expect_err("invalid JSON should return Err")
                .contains("invalid match request")
        );
    }

    #[test]
    fn run_parse_rejects_invalid_json() {
        let result = run_parse("{".to_string());
        assert!(result.is_err());
        assert!(
            result
                .expect_err("invalid JSON should return Err")
                .contains("invalid parse request")
        );
    }

    #[test]
    fn resolve_sidecar_script_path_finds_existing_script() {
        let script_path =
            resolve_sidecar_script_path().expect("sidecar script should exist in repository");
        assert!(Path::new(&script_path).is_file());
        assert!(script_path.ends_with("parser_sidecar.py"));
    }
}
