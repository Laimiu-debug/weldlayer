use contracts::matching::{
    ConsumableBatch, MatchRequest, MatchResponse, PqrCandidate, WelderCandidate,
};
use contracts::parser::ParseRequest;
use contracts::parser::ParseResponse;
use core_engine::run_match;
use core_store::Store;
use std::io::Write;
use std::process::{Command, Stdio};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ServiceError {
    #[error("engine error: {0}")]
    Engine(#[from] core_engine::EngineError),
    #[error("store error: {0}")]
    Store(#[from] core_store::StoreError),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("sidecar process failed: {0}")]
    SidecarProcess(String),
}

#[derive(Debug, Clone)]
pub struct SidecarConfig {
    pub interpreter: String,
    pub script_path: String,
}

impl Default for SidecarConfig {
    fn default() -> Self {
        Self {
            interpreter: "python".to_string(),
            script_path: "sidecar/parser-python/parser_sidecar.py".to_string(),
        }
    }
}

pub fn run_match_and_persist(
    db_path: &str,
    project_name: &str,
    request: &MatchRequest,
) -> Result<MatchResponse, ServiceError> {
    let store = Store::open(db_path)?;
    run_match_and_persist_with_store(&store, project_name, request)
}

pub fn run_match_and_persist_with_store(
    store: &Store,
    project_name: &str,
    request: &MatchRequest,
) -> Result<MatchResponse, ServiceError> {
    let response = run_match(request)?;
    store.upsert_project(&request.project_id, project_name, &request.standard_code)?;
    store.insert_match_report(request, &response)?;
    store.insert_audit_log(
        &response.trace_id,
        "run_match",
        &format!("{:?}", response.decision).to_lowercase(),
        "{}",
    )?;
    Ok(response)
}

pub fn run_parse_via_sidecar(
    config: &SidecarConfig,
    request: &ParseRequest,
) -> Result<ParseResponse, ServiceError> {
    let input_json = serde_json::to_vec(request)?;

    let mut child = Command::new(&config.interpreter)
        .arg(&config.script_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    if let Some(stdin) = child.stdin.as_mut() {
        stdin.write_all(&input_json)?;
    } else {
        return Err(ServiceError::SidecarProcess(
            "failed to open sidecar stdin".to_string(),
        ));
    }

    let output = child.wait_with_output()?;
    let stdout_text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr_text = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if stdout_text.is_empty() {
        return Err(ServiceError::SidecarProcess(format!(
            "sidecar returned empty stdout, stderr={stderr_text}"
        )));
    }

    let parsed: ParseResponse = serde_json::from_str(&stdout_text)?;

    if !output.status.success() {
        return Err(ServiceError::SidecarProcess(format!(
            "exit_code={:?}, stderr={stderr_text}, response_status={:?}",
            output.status.code(),
            parsed.status
        )));
    }

    Ok(parsed)
}

pub fn upsert_pqr_profile(
    db_path: &str,
    project_id: &str,
    pqr: &PqrCandidate,
) -> Result<(), ServiceError> {
    let store = Store::open(db_path)?;
    store.upsert_pqr_profile(project_id, pqr)?;
    Ok(())
}

pub fn list_pqr_profiles(
    db_path: &str,
    project_id: &str,
    limit: usize,
) -> Result<Vec<PqrCandidate>, ServiceError> {
    let store = Store::open(db_path)?;
    let rows = store.list_pqr_profiles(project_id, limit)?;
    Ok(rows.into_iter().map(|row| row.pqr).collect())
}

pub fn delete_pqr_profile(
    db_path: &str,
    project_id: &str,
    pqr_id: &str,
) -> Result<bool, ServiceError> {
    let store = Store::open(db_path)?;
    store
        .delete_pqr_profile(project_id, pqr_id)
        .map_err(Into::into)
}

pub fn upsert_welder_profile(
    db_path: &str,
    project_id: &str,
    welder: &WelderCandidate,
) -> Result<(), ServiceError> {
    let store = Store::open(db_path)?;
    store.upsert_welder_profile(project_id, welder)?;
    Ok(())
}

pub fn list_welder_profiles(
    db_path: &str,
    project_id: &str,
    limit: usize,
) -> Result<Vec<WelderCandidate>, ServiceError> {
    let store = Store::open(db_path)?;
    let rows = store.list_welder_profiles(project_id, limit)?;
    Ok(rows.into_iter().map(|row| row.welder).collect())
}

pub fn delete_welder_profile(
    db_path: &str,
    project_id: &str,
    welder_id: &str,
) -> Result<bool, ServiceError> {
    let store = Store::open(db_path)?;
    store
        .delete_welder_profile(project_id, welder_id)
        .map_err(Into::into)
}

pub fn upsert_consumable_batch(
    db_path: &str,
    project_id: &str,
    batch: &ConsumableBatch,
) -> Result<(), ServiceError> {
    let store = Store::open(db_path)?;
    store.upsert_consumable_batch(project_id, batch)?;
    Ok(())
}

pub fn list_consumable_batches(
    db_path: &str,
    project_id: &str,
    limit: usize,
) -> Result<Vec<ConsumableBatch>, ServiceError> {
    let store = Store::open(db_path)?;
    let rows = store.list_consumable_batches(project_id, limit)?;
    Ok(rows.into_iter().map(|row| row.batch).collect())
}

pub fn delete_consumable_batch(
    db_path: &str,
    project_id: &str,
    batch_no: &str,
) -> Result<bool, ServiceError> {
    let store = Store::open(db_path)?;
    store
        .delete_consumable_batch(project_id, batch_no)
        .map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;
    use contracts::matching::{
        ConsumableBatch, InventoryPolicy, PqrCandidate, RequiredConsumable, ReviewStatus,
        StandardCode, WeldSeam, WelderCandidate,
    };

    fn sample_request() -> MatchRequest {
        MatchRequest {
            trace_id: "TRC-SVC-001".to_string(),
            project_id: "PRJ-SVC-001".to_string(),
            standard_code: StandardCode::AsmeIx,
            inventory_policy: InventoryPolicy::Warn,
            top_k: 3,
            weld_seams: vec![WeldSeam {
                weld_id: "W-001".to_string(),
                material_group_a: "P-No.1".to_string(),
                material_group_b: "P-No.1".to_string(),
                thickness_a_mm: 12.0,
                thickness_b_mm: 12.0,
                position_code: "2G".to_string(),
                process_hint: "GTAW".to_string(),
                review_status: ReviewStatus::Confirmed,
            }],
            pqr_candidates: vec![PqrCandidate {
                pqr_id: "PQR-001".to_string(),
                standard_code: StandardCode::AsmeIx,
                process_code: "GTAW".to_string(),
                material_group_scope: vec!["P-No.1".to_string()],
                thickness_min_mm: 3.0,
                thickness_max_mm: 45.0,
                position_scope: vec!["2G".to_string()],
                dissimilar_support: true,
                thickness_mismatch_support: true,
                thickness_delta_max_mm: 10.0,
                valid_to: "2027-01-01".to_string(),
                status: "active".to_string(),
            }],
            welder_candidates: vec![WelderCandidate {
                welder_id: "WELDER-001".to_string(),
                cert_no: "CERT-001".to_string(),
                standard_code: StandardCode::AsmeIx,
                process_code: "GTAW".to_string(),
                material_group_scope: vec!["P-No.1".to_string()],
                position_scope: vec!["2G".to_string()],
                dissimilar_qualified: true,
                thickness_mismatch_qualified: true,
                thickness_delta_max_mm: 10.0,
                expiry_date: "2027-01-01".to_string(),
                status: "active".to_string(),
            }],
            required_consumables: vec![RequiredConsumable {
                material_code: "ER70S-6".to_string(),
                required_qty: 5.0,
            }],
            consumable_batches: vec![ConsumableBatch {
                batch_no: "B-001".to_string(),
                material_code: "ER70S-6".to_string(),
                spec_standard: "AWS A5.18".to_string(),
                qty_available: 2.0,
                safety_stock: 3.0,
                expiry_date: "2026-12-31".to_string(),
                status: "active".to_string(),
            }],
        }
    }

    #[test]
    fn run_match_and_persist_writes_data() {
        let request = sample_request();
        let store = Store::open_in_memory().expect("open memory db");
        let response = run_match_and_persist_with_store(&store, "Service Test", &request)
            .expect("run match and persist should succeed");

        assert_eq!(response.trace_id, "TRC-SVC-001");
        let project = store
            .get_project("PRJ-SVC-001")
            .expect("query project")
            .expect("project should exist");
        assert_eq!(project.project_name, "Service Test");
        assert_eq!(store.list_match_reports(10).expect("list reports").len(), 1);
        assert_eq!(store.list_audit_logs(10).expect("list logs").len(), 1);
    }
}
