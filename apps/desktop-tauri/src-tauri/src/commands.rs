use app_service::{SidecarConfig, run_match_and_persist, run_parse_via_sidecar};
use contracts::matching::MatchRequest;
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
    let response = run_match_and_persist(&db_path, &project_name, &request)
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
