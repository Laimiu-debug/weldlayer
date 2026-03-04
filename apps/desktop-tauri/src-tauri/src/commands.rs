use app_service::{run_match_and_persist, run_parse_via_sidecar, SidecarConfig};
use contracts::matching::MatchRequest;
use contracts::parser::ParseRequest;

#[tauri::command]
pub fn run_match(db_path: String, project_name: String, request_json: String) -> Result<String, String> {
    let request =
        serde_json::from_str::<MatchRequest>(&request_json).map_err(|e| format!("invalid match request: {e}"))?;
    let response = run_match_and_persist(&db_path, &project_name, &request)
        .map_err(|e| format!("match service failed: {e}"))?;
    serde_json::to_string(&response).map_err(|e| format!("serialize match response failed: {e}"))
}

#[tauri::command]
pub fn run_parse(request_json: String) -> Result<String, String> {
    let request =
        serde_json::from_str::<ParseRequest>(&request_json).map_err(|e| format!("invalid parse request: {e}"))?;
    let response =
        run_parse_via_sidecar(&SidecarConfig::default(), &request).map_err(|e| format!("parse service failed: {e}"))?;
    serde_json::to_string(&response).map_err(|e| format!("serialize parse response failed: {e}"))
}
