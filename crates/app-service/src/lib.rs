use contracts::matching::{
    ConsumableBatch, MatchRequest, MatchResponse, PqrCandidate, ReviewStatus, WeldSeam,
    WelderCandidate,
};
use contracts::parser::ParseRequest;
use contracts::parser::ParseResponse;
use core_engine::run_match;
use core_store::Store;
use serde_json::Value;
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
    #[error("not found: {0}")]
    NotFound(String),
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

pub fn run_match_and_persist_with_master_data(
    db_path: &str,
    project_name: &str,
    request: &MatchRequest,
) -> Result<MatchResponse, ServiceError> {
    let store = Store::open(db_path)?;
    run_match_and_persist_with_master_data_store(&store, project_name, request)
}

pub fn run_match_and_persist_with_store(
    store: &Store,
    project_name: &str,
    request: &MatchRequest,
) -> Result<MatchResponse, ServiceError> {
    let response = run_match(request)?;
    let audit_payload = build_match_audit_payload(project_name, request, &response)?;
    store.upsert_project(&request.project_id, project_name, &request.standard_code)?;
    store.insert_match_report(request, &response)?;
    store.insert_audit_log(
        &response.trace_id,
        "run_match",
        &format!("{:?}", response.decision).to_lowercase(),
        &audit_payload,
    )?;
    Ok(response)
}

fn build_match_audit_payload(
    project_name: &str,
    request: &MatchRequest,
    response: &MatchResponse,
) -> Result<String, ServiceError> {
    let review_status_counts = serde_json::json!({
        "confirmed": request
            .weld_seams
            .iter()
            .filter(|seam| matches!(seam.review_status, ReviewStatus::Confirmed))
            .count(),
        "changed": request
            .weld_seams
            .iter()
            .filter(|seam| matches!(seam.review_status, ReviewStatus::Changed))
            .count(),
        "pending": request
            .weld_seams
            .iter()
            .filter(|seam| matches!(seam.review_status, ReviewStatus::Pending))
            .count(),
        "uncertain": request
            .weld_seams
            .iter()
            .filter(|seam| matches!(seam.review_status, ReviewStatus::Uncertain))
            .count()
    });

    let payload = serde_json::json!({
        "project_id": request.project_id,
        "project_name": project_name,
        "standard_code": request.standard_code,
        "inventory_policy": request.inventory_policy,
        "top_k": request.top_k,
        "input_counts": {
            "weld_seams": request.weld_seams.len(),
            "pqr_candidates": request.pqr_candidates.len(),
            "welder_candidates": request.welder_candidates.len(),
            "required_consumables": request.required_consumables.len(),
            "consumable_batches": request.consumable_batches.len()
        },
        "review_status_counts": review_status_counts,
        "decision": response.decision,
        "rule_package_version": response.rule_package.version,
        "recommended": response.recommended.as_ref().map(|item| serde_json::json!({
            "pqr_id": item.pqr_id,
            "welder_id": item.welder_id,
            "consumable_batch_ids": item.consumable_batch_ids
        })),
        "alternative_count": response.alternatives.len(),
        "hard_conflict_count": response.hard_conflicts.len(),
        "inventory_alert_count": response.inventory_alerts.len()
    });

    serde_json::to_string(&payload).map_err(Into::into)
}

pub fn run_match_and_persist_with_master_data_store(
    store: &Store,
    project_name: &str,
    request: &MatchRequest,
) -> Result<MatchResponse, ServiceError> {
    let hydrated_request = hydrate_request_with_master_data(store, request)?;
    run_match_and_persist_with_store(store, project_name, &hydrated_request)
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

fn hydrate_request_with_master_data(
    store: &Store,
    request: &MatchRequest,
) -> Result<MatchRequest, ServiceError> {
    let mut hydrated = request.clone();

    if hydrated.pqr_candidates.is_empty() {
        hydrated.pqr_candidates = store
            .list_pqr_profiles(&hydrated.project_id, 1000)?
            .into_iter()
            .map(|row| row.pqr)
            .collect();
    }

    if hydrated.welder_candidates.is_empty() {
        hydrated.welder_candidates = store
            .list_welder_profiles(&hydrated.project_id, 1000)?
            .into_iter()
            .map(|row| row.welder)
            .collect();
    }

    if hydrated.consumable_batches.is_empty() {
        hydrated.consumable_batches = store
            .list_consumable_batches(&hydrated.project_id, 1000)?
            .into_iter()
            .map(|row| row.batch)
            .collect();
    }

    Ok(hydrated)
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

pub fn upsert_weld_seam(
    db_path: &str,
    project_id: &str,
    seam: &WeldSeam,
) -> Result<(), ServiceError> {
    let store = Store::open(db_path)?;
    store.upsert_weld_seam(project_id, seam)?;
    Ok(())
}

pub fn list_weld_seams(
    db_path: &str,
    project_id: &str,
    limit: usize,
) -> Result<Vec<WeldSeam>, ServiceError> {
    let store = Store::open(db_path)?;
    let rows = store.list_weld_seams(project_id, limit)?;
    Ok(rows.into_iter().map(|row| row.seam).collect())
}

pub fn delete_weld_seam(
    db_path: &str,
    project_id: &str,
    weld_id: &str,
) -> Result<bool, ServiceError> {
    let store = Store::open(db_path)?;
    store
        .delete_weld_seam(project_id, weld_id)
        .map_err(Into::into)
}

pub fn list_match_reports(
    db_path: &str,
    limit: usize,
) -> Result<Vec<core_store::MatchReportRecord>, ServiceError> {
    let store = Store::open(db_path)?;
    store.list_match_reports(limit).map_err(Into::into)
}

pub fn list_audit_logs(
    db_path: &str,
    limit: usize,
) -> Result<Vec<core_store::AuditLogRecord>, ServiceError> {
    let store = Store::open(db_path)?;
    store.list_audit_logs(limit).map_err(Into::into)
}

pub fn freeze_match_baseline(
    db_path: &str,
    trace_id: &str,
    baseline_label: Option<&str>,
) -> Result<core_store::MatchBaselineRecord, ServiceError> {
    let store = Store::open(db_path)?;
    let report = store.get_match_report(trace_id)?.ok_or_else(|| {
        ServiceError::NotFound(format!("match report not found for trace_id={trace_id}"))
    })?;
    let label = baseline_label
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| format!("BASELINE-{}", report.trace_id));
    let baseline = store.freeze_match_baseline(trace_id, &label)?;
    let payload = serde_json::json!({
        "project_id": baseline.project_id,
        "baseline_label": baseline.baseline_label,
        "rule_package_version": baseline.rule_package_version,
        "created_at": baseline.created_at
    });
    store.insert_audit_log(
        &baseline.trace_id,
        "freeze_baseline",
        "ok",
        &serde_json::to_string(&payload)?,
    )?;
    Ok(baseline)
}

pub fn list_match_baselines(
    db_path: &str,
    project_id: &str,
    limit: usize,
) -> Result<Vec<Value>, ServiceError> {
    let store = Store::open(db_path)?;
    let baselines = store.list_match_baselines(project_id, limit)?;
    baselines
        .into_iter()
        .map(|baseline| {
            let summary: Value = serde_json::from_str(&baseline.summary_json)?;
            let changes =
                store.summarize_master_data_changes_since(project_id, baseline.created_at)?;
            let reasons = build_review_reasons(&changes);
            Ok(serde_json::json!({
                "trace_id": baseline.trace_id,
                "project_id": baseline.project_id,
                "baseline_label": baseline.baseline_label,
                "decision": baseline.decision,
                "rule_package_version": baseline.rule_package_version,
                "summary_json": baseline.summary_json,
                "summary": summary,
                "created_at": baseline.created_at,
                "review_status": if reasons.is_empty() { "ok" } else { "needs_review" },
                "review_reasons": reasons,
                "latest_change_at": changes.latest_change_at,
                "change_counts": {
                    "seam": changes.seam_changes,
                    "pqr": changes.pqr_changes,
                    "welder": changes.welder_changes,
                    "batch": changes.batch_changes
                }
            }))
        })
        .collect::<Result<Vec<_>, ServiceError>>()
}

pub fn get_match_baseline_impact(
    db_path: &str,
    trace_id: &str,
    limit_per_scope: usize,
    compare_trace_id: Option<&str>,
) -> Result<Option<Value>, ServiceError> {
    let store = Store::open(db_path)?;
    let baseline = match store.get_match_baseline(trace_id)? {
        Some(item) => item,
        None => return Ok(None),
    };
    let report = store.get_match_report(trace_id)?.ok_or_else(|| {
        ServiceError::NotFound(format!("match report not found for trace_id={trace_id}"))
    })?;

    let summary: Value = serde_json::from_str(&baseline.summary_json)?;
    let request: MatchRequest = serde_json::from_str(&report.request_json)?;
    let response: MatchResponse = serde_json::from_str(&report.response_json)?;
    let compare_response = if let Some(value) = compare_trace_id
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != trace_id)
    {
        let compare_report = store.get_match_report(value)?.ok_or_else(|| {
            ServiceError::NotFound(format!("match report not found for trace_id={value}"))
        })?;
        let compare_response: MatchResponse = serde_json::from_str(&compare_report.response_json)?;
        Some((value.to_string(), compare_response))
    } else {
        None
    };
    let changes =
        store.summarize_master_data_changes_since(&baseline.project_id, baseline.created_at)?;
    let reasons = build_review_reasons(&changes);
    let items = store.list_master_data_change_items_since(
        &baseline.project_id,
        baseline.created_at,
        limit_per_scope,
    )?;
    let payload_items = items
        .iter()
        .map(|item| {
            let impact = explain_change_impact(item, &request, &response)?;
            let affects_compare_recommended_candidate = compare_response
                .as_ref()
                .and_then(|(_, compare)| compare.recommended.as_ref())
                .map(|recommended| item_matches_recommendation(item, recommended))
                .unwrap_or(false);
            Ok(serde_json::json!({
                "scope": item.scope,
                "item_id": item.item_id,
                "updated_at": item.updated_at,
                "summary": item.summary,
                "impact_hint": item.impact_hint,
                "impact_detail": impact.impact_detail,
                "affects_recommended_candidate": impact.affects_recommended_candidate,
                "affects_compare_recommended_candidate": affects_compare_recommended_candidate,
                "recommendation_relation": build_recommendation_relation(
                    &item.scope,
                    impact.affects_recommended_candidate,
                    affects_compare_recommended_candidate,
                    compare_response.is_some()
                ),
                "affected_seam_count": impact.affected_seam_ids.len(),
                "affected_seam_ids": impact.affected_seam_ids,
                "affected_material_codes": impact.affected_material_codes
            }))
        })
        .collect::<Result<Vec<_>, ServiceError>>()?;
    let changes_by_scope = serde_json::json!({
        "seam": payload_items.iter().filter(|item| item["scope"] == "seam").cloned().collect::<Vec<_>>(),
        "pqr": payload_items.iter().filter(|item| item["scope"] == "pqr").cloned().collect::<Vec<_>>(),
        "welder": payload_items.iter().filter(|item| item["scope"] == "welder").cloned().collect::<Vec<_>>(),
        "batch": payload_items.iter().filter(|item| item["scope"] == "batch").cloned().collect::<Vec<_>>()
    });
    let compare_decision = compare_response
        .as_ref()
        .map(|(_, compare)| format!("{:?}", compare.decision).to_lowercase());
    let recommendation_shift = compare_response.as_ref().map(|(_, compare)| {
        build_recommendation_shift_text(response.recommended.as_ref(), compare.recommended.as_ref())
    });
    let review_actions = build_review_actions(
        &baseline.decision,
        compare_decision.as_deref(),
        response.recommended.as_ref(),
        compare_response
            .as_ref()
            .and_then(|(_, compare)| compare.recommended.as_ref()),
        &payload_items,
        &changes,
        recommendation_shift.as_deref(),
    );

    Ok(Some(serde_json::json!({
        "trace_id": baseline.trace_id,
        "project_id": baseline.project_id,
        "baseline_label": baseline.baseline_label,
        "decision": baseline.decision,
        "rule_package_version": baseline.rule_package_version,
        "summary": summary,
        "baseline_recommended": response.recommended.as_ref().map(recommendation_to_value),
        "created_at": baseline.created_at,
        "review_status": if reasons.is_empty() { "ok" } else { "needs_review" },
        "review_reasons": reasons,
        "latest_change_at": changes.latest_change_at,
        "change_counts": {
            "seam": changes.seam_changes,
            "pqr": changes.pqr_changes,
            "welder": changes.welder_changes,
            "batch": changes.batch_changes
        },
        "display_limit_per_scope": limit_per_scope,
        "changes": payload_items,
        "changes_by_scope": changes_by_scope,
        "compare_trace_id": compare_response.as_ref().map(|(trace_id, _)| trace_id.clone()),
        "compare_decision": compare_decision,
        "compare_recommended": compare_response
            .as_ref()
            .and_then(|(_, compare)| compare.recommended.as_ref().map(recommendation_to_value)),
        "recommendation_shift": recommendation_shift,
        "review_actions": review_actions
    })))
}

pub fn get_match_audit_bundle(
    db_path: &str,
    trace_id: &str,
) -> Result<Option<Value>, ServiceError> {
    let store = Store::open(db_path)?;
    let report = match store.get_match_report(trace_id)? {
        Some(item) => item,
        None => return Ok(None),
    };
    let logs = store.list_audit_logs_by_trace(trace_id, 200)?;

    let request: Value = serde_json::from_str(&report.request_json)?;
    let response: Value = serde_json::from_str(&report.response_json)?;
    let audit_logs = logs
        .into_iter()
        .map(|item| {
            let payload: Value = serde_json::from_str(&item.payload_json)?;
            Ok(serde_json::json!({
                "trace_id": item.trace_id,
                "action": item.action,
                "result": item.result,
                "payload": payload,
                "created_at": item.created_at
            }))
        })
        .collect::<Result<Vec<_>, ServiceError>>()?;

    let recommended = response.get("recommended").cloned().unwrap_or(Value::Null);
    let alternatives = response
        .get("alternatives")
        .and_then(Value::as_array)
        .map(|items| items.len())
        .unwrap_or(0);
    let hard_conflicts = response
        .get("hard_conflicts")
        .and_then(Value::as_array)
        .map(|items| items.len())
        .unwrap_or(0);
    let inventory_alerts = response
        .get("inventory_alerts")
        .and_then(Value::as_array)
        .map(|items| items.len())
        .unwrap_or(0);

    Ok(Some(serde_json::json!({
        "trace_id": report.trace_id,
        "project_id": report.project_id,
        "decision": report.decision,
        "rule_package_version": report.rule_package_version,
        "created_at": report.created_at,
        "summary": {
            "recommended": recommended,
            "alternative_count": alternatives,
            "hard_conflict_count": hard_conflicts,
            "inventory_alert_count": inventory_alerts
        },
        "request": request,
        "response": response,
        "audit_logs": audit_logs
    })))
}

fn build_review_reasons(changes: &core_store::MasterDataChangeSummary) -> Vec<String> {
    let mut reasons = Vec::new();
    if changes.seam_changes > 0 {
        reasons.push(format!("焊缝主数据更新 {} 条", changes.seam_changes));
    }
    if changes.pqr_changes > 0 {
        reasons.push(format!("PQR 更新 {} 条", changes.pqr_changes));
    }
    if changes.welder_changes > 0 {
        reasons.push(format!("焊工资格更新 {} 条", changes.welder_changes));
    }
    if changes.batch_changes > 0 {
        reasons.push(format!("库存批次更新 {} 条", changes.batch_changes));
    }
    reasons
}

fn build_review_actions(
    baseline_decision: &str,
    compare_decision: Option<&str>,
    baseline_recommended: Option<&contracts::matching::Recommendation>,
    compare_recommended: Option<&contracts::matching::Recommendation>,
    payload_items: &[Value],
    changes: &core_store::MasterDataChangeSummary,
    recommendation_shift: Option<&str>,
) -> Vec<Value> {
    let mut actions = Vec::new();
    let has_compare = compare_decision.is_some();
    let compare_decision = compare_decision.unwrap_or("");

    if changes.seam_changes > 0 {
        actions.push(serde_json::json!({
            "code": "recheck_input",
            "title": "复核焊缝输入并重新匹配",
            "detail": format!("焊缝主数据更新 {} 条，建议先确认焊缝输入，再重新执行匹配。", changes.seam_changes),
            "priority": "high",
            "scopes": ["seam"]
        }));
    }

    if changes.pqr_changes > 0 || changes.welder_changes > 0 {
        let title = if compare_decision == "fail" {
            "补充或更新 PQR/焊工资格"
        } else {
            "复核 PQR/焊工资格覆盖范围"
        };
        let detail = if compare_decision == "fail" {
            format!(
                "当前结果已降为 fail，建议优先补充资格主数据。PQR 变更 {} 条，焊工资格变更 {} 条。",
                changes.pqr_changes, changes.welder_changes
            )
        } else {
            format!(
                "PQR 变更 {} 条，焊工资格变更 {} 条，建议复核候选覆盖范围后再确认推荐。",
                changes.pqr_changes, changes.welder_changes
            )
        };
        actions.push(serde_json::json!({
            "code": "review_qualification",
            "title": title,
            "detail": detail,
            "priority": if compare_decision == "fail" { "high" } else { "medium" },
            "scopes": ["pqr", "welder"]
        }));
    }

    if changes.batch_changes > 0 {
        let detail = if compare_decision == "fail" || compare_decision == "partial" {
            format!(
                "库存批次变更 {} 条，当前结果受库存影响，建议补料或调整库存策略。",
                changes.batch_changes
            )
        } else {
            format!(
                "库存批次变更 {} 条，建议复核批次可用量和安全库存设置。",
                changes.batch_changes
            )
        };
        actions.push(serde_json::json!({
            "code": "review_inventory",
            "title": if compare_decision == "fail" || compare_decision == "partial" { "补料或调整库存策略" } else { "复核库存批次可用性" },
            "detail": detail,
            "priority": if compare_decision == "fail" || compare_decision == "partial" { "high" } else { "medium" },
            "scopes": ["batch"]
        }));
    }

    let recommendation_switched = has_compare
        && recommendation_label(baseline_recommended) != recommendation_label(compare_recommended);
    let recommended_hit_count = payload_items
        .iter()
        .filter(|item| {
            item["affects_recommended_candidate"]
                .as_bool()
                .unwrap_or(false)
        })
        .count();
    if recommendation_switched || recommended_hit_count > 0 {
        let detail = recommendation_shift
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| {
                format!(
                    "有 {} 条变更命中原推荐组合，建议确认当前推荐后冻结新基线。",
                    recommended_hit_count
                )
            });
        actions.push(serde_json::json!({
            "code": "freeze_new_baseline",
            "title": "确认当前推荐并冻结新基线",
            "detail": detail,
            "priority": if compare_decision == "match" || compare_decision == "partial" { "medium" } else { "high" },
            "scopes": ["pqr", "welder", "batch"]
        }));
    }

    if actions.is_empty() {
        actions.push(serde_json::json!({
            "code": "no_action",
            "title": "当前无需额外处理",
            "detail": format!("基线决策为 {}，当前未检测到会影响结果的主数据变更。", baseline_decision),
            "priority": "low",
            "scopes": []
        }));
    }

    actions
}

const THICKNESS_DIFF_THRESHOLD_MM: f64 = 3.0;

struct ChangeImpactExplanation {
    impact_detail: String,
    affects_recommended_candidate: bool,
    affected_seam_ids: Vec<String>,
    affected_material_codes: Vec<String>,
}

fn explain_change_impact(
    item: &core_store::MasterDataChangeItem,
    request: &MatchRequest,
    response: &MatchResponse,
) -> Result<ChangeImpactExplanation, ServiceError> {
    match item.scope.as_str() {
        "seam" => {
            let seam: WeldSeam = serde_json::from_str(&item.payload_json)?;
            let exists_in_baseline = request
                .weld_seams
                .iter()
                .any(|candidate| candidate.weld_id == seam.weld_id);
            Ok(ChangeImpactExplanation {
                impact_detail: if exists_in_baseline {
                    "该焊缝是原基线输入的一部分，变更后会直接改变原匹配结果".to_string()
                } else {
                    "该焊缝未参与原基线计算，新增后需要重新匹配纳入决策范围".to_string()
                },
                affects_recommended_candidate: false,
                affected_seam_ids: vec![seam.weld_id],
                affected_material_codes: Vec::new(),
            })
        }
        "pqr" => {
            let pqr: PqrCandidate = serde_json::from_str(&item.payload_json)?;
            let affected_seam_ids = request
                .weld_seams
                .iter()
                .filter(|seam| pqr_can_cover_seam(&pqr, seam))
                .map(|seam| seam.weld_id.clone())
                .collect::<Vec<_>>();
            let affects_recommended_candidate = response
                .recommended
                .as_ref()
                .map(|recommended| recommended.pqr_id == pqr.pqr_id)
                .unwrap_or(false);
            Ok(ChangeImpactExplanation {
                impact_detail: build_candidate_impact_detail(
                    "PQR",
                    affects_recommended_candidate,
                    &affected_seam_ids,
                    "可能改变这些焊缝的 PQR 候选覆盖范围",
                    "当前未直接覆盖原基线焊缝，但会改变候选池",
                ),
                affects_recommended_candidate,
                affected_seam_ids,
                affected_material_codes: Vec::new(),
            })
        }
        "welder" => {
            let welder: WelderCandidate = serde_json::from_str(&item.payload_json)?;
            let affected_seam_ids = request
                .weld_seams
                .iter()
                .filter(|seam| welder_can_cover_seam(&welder, seam))
                .map(|seam| seam.weld_id.clone())
                .collect::<Vec<_>>();
            let affects_recommended_candidate = response
                .recommended
                .as_ref()
                .map(|recommended| recommended.welder_id == welder.welder_id)
                .unwrap_or(false);
            Ok(ChangeImpactExplanation {
                impact_detail: build_candidate_impact_detail(
                    "焊工",
                    affects_recommended_candidate,
                    &affected_seam_ids,
                    "可能改变这些焊缝的焊工资格可用范围",
                    "当前未直接覆盖原基线焊缝，但会改变候选池",
                ),
                affects_recommended_candidate,
                affected_seam_ids,
                affected_material_codes: Vec::new(),
            })
        }
        "batch" => {
            let batch: ConsumableBatch = serde_json::from_str(&item.payload_json)?;
            let affected_material_codes = request
                .required_consumables
                .iter()
                .filter(|required| {
                    required
                        .material_code
                        .eq_ignore_ascii_case(&batch.material_code)
                })
                .map(|required| required.material_code.clone())
                .collect::<Vec<_>>();
            let affects_recommended_candidate = response
                .recommended
                .as_ref()
                .map(|recommended| {
                    recommended
                        .consumable_batch_ids
                        .iter()
                        .any(|batch_id| batch_id == &batch.batch_no)
                })
                .unwrap_or(false);
            let impact_detail = if affects_recommended_candidate {
                format!(
                    "该批次命中原推荐组合，库存或状态变化会直接影响推荐批次 {}",
                    batch.batch_no
                )
            } else if affected_material_codes.is_empty() {
                "该批次未命中原需求焊材，但会改变库存候选池".to_string()
            } else {
                format!(
                    "该批次对应焊材 {}，会影响库存告警与可用批次选择",
                    affected_material_codes.join("/")
                )
            };
            Ok(ChangeImpactExplanation {
                impact_detail,
                affects_recommended_candidate,
                affected_seam_ids: Vec::new(),
                affected_material_codes,
            })
        }
        _ => Ok(ChangeImpactExplanation {
            impact_detail: "主数据发生变化，建议重新匹配确认影响".to_string(),
            affects_recommended_candidate: false,
            affected_seam_ids: Vec::new(),
            affected_material_codes: Vec::new(),
        }),
    }
}

fn build_candidate_impact_detail(
    label: &str,
    affects_recommended_candidate: bool,
    affected_seam_ids: &[String],
    seam_detail: &str,
    fallback_detail: &str,
) -> String {
    if affects_recommended_candidate {
        return format!("该{label}命中原推荐组合，变更后需优先复核当前推荐是否仍成立");
    }
    if affected_seam_ids.is_empty() {
        return fallback_detail.to_string();
    }
    format!("{seam_detail}（{} 条）", affected_seam_ids.len())
}

fn build_recommendation_relation(
    scope: &str,
    affects_baseline: bool,
    affects_compare: bool,
    has_compare: bool,
) -> String {
    if scope == "seam" {
        return "该焊缝输入变化会直接改变匹配输入条件".to_string();
    }
    if !has_compare {
        return if affects_baseline {
            "命中原推荐组合".to_string()
        } else {
            "未直接命中原推荐组合，但会影响候选池".to_string()
        };
    }
    match (affects_baseline, affects_compare) {
        (true, true) => "基线与当前推荐均命中该对象".to_string(),
        (true, false) => "原推荐命中该对象，当前推荐已切换".to_string(),
        (false, true) => "当前推荐已切换到该对象".to_string(),
        (false, false) => "未直接命中基线/当前推荐，但会影响候选池".to_string(),
    }
}

fn build_recommendation_shift_text(
    baseline: Option<&contracts::matching::Recommendation>,
    compare: Option<&contracts::matching::Recommendation>,
) -> String {
    let baseline_label = recommendation_label(baseline);
    let compare_label = recommendation_label(compare);
    if baseline_label == compare_label {
        format!("当前推荐与基线一致：{baseline_label}")
    } else {
        format!("推荐已从 {baseline_label} 切换为 {compare_label}")
    }
}

fn recommendation_label(recommendation: Option<&contracts::matching::Recommendation>) -> String {
    recommendation
        .map(|item| format!("{} + {}", item.pqr_id, item.welder_id))
        .unwrap_or_else(|| "无推荐组合".to_string())
}

fn recommendation_to_value(recommendation: &contracts::matching::Recommendation) -> Value {
    serde_json::json!({
        "pqr_id": recommendation.pqr_id,
        "welder_id": recommendation.welder_id,
        "consumable_batch_ids": recommendation.consumable_batch_ids
    })
}

fn item_matches_recommendation(
    item: &core_store::MasterDataChangeItem,
    recommendation: &contracts::matching::Recommendation,
) -> bool {
    match item.scope.as_str() {
        "pqr" => item.item_id == recommendation.pqr_id,
        "welder" => item.item_id == recommendation.welder_id,
        "batch" => recommendation
            .consumable_batch_ids
            .iter()
            .any(|batch_id| batch_id == &item.item_id),
        _ => false,
    }
}

fn pqr_can_cover_seam(pqr: &PqrCandidate, seam: &WeldSeam) -> bool {
    if !equal_process(&pqr.process_code, &seam.process_hint) {
        return false;
    }
    if !material_groups_cover(&pqr.material_group_scope, seam) {
        return false;
    }
    let min_thk = seam.thickness_a_mm.min(seam.thickness_b_mm);
    let max_thk = seam.thickness_a_mm.max(seam.thickness_b_mm);
    if min_thk < pqr.thickness_min_mm || max_thk > pqr.thickness_max_mm {
        return false;
    }
    if !scope_contains(&pqr.position_scope, &seam.position_code) {
        return false;
    }
    let dissimilar = seam.material_group_a != seam.material_group_b;
    if dissimilar && !pqr.dissimilar_support {
        return false;
    }
    let thk_delta = (seam.thickness_a_mm - seam.thickness_b_mm).abs();
    let has_thk_mismatch = thk_delta > THICKNESS_DIFF_THRESHOLD_MM;
    if has_thk_mismatch
        && (!pqr.thickness_mismatch_support || pqr.thickness_delta_max_mm < thk_delta)
    {
        return false;
    }
    true
}

fn welder_can_cover_seam(welder: &WelderCandidate, seam: &WeldSeam) -> bool {
    if !equal_process(&welder.process_code, &seam.process_hint) {
        return false;
    }
    if !material_groups_cover(&welder.material_group_scope, seam) {
        return false;
    }
    if !scope_contains(&welder.position_scope, &seam.position_code) {
        return false;
    }
    let dissimilar = seam.material_group_a != seam.material_group_b;
    if dissimilar && !welder.dissimilar_qualified {
        return false;
    }
    let thk_delta = (seam.thickness_a_mm - seam.thickness_b_mm).abs();
    let has_thk_mismatch = thk_delta > THICKNESS_DIFF_THRESHOLD_MM;
    if has_thk_mismatch
        && (!welder.thickness_mismatch_qualified || welder.thickness_delta_max_mm < thk_delta)
    {
        return false;
    }
    true
}

fn material_groups_cover(scope: &[String], seam: &WeldSeam) -> bool {
    [&seam.material_group_a, &seam.material_group_b]
        .iter()
        .all(|group| {
            scope
                .iter()
                .any(|candidate| candidate.eq_ignore_ascii_case(group))
        })
}

fn scope_contains(scope: &[String], value: &str) -> bool {
    scope
        .iter()
        .any(|candidate| candidate.eq_ignore_ascii_case(value))
}

fn equal_process(left: &str, right: &str) -> bool {
    let left_normalized = normalize_token(left);
    let right_normalized = normalize_token(right);
    left_normalized == right_normalized
        || left_normalized.contains(&right_normalized)
        || right_normalized.contains(&left_normalized)
}

fn normalize_token(value: &str) -> String {
    value
        .chars()
        .filter(|ch| !ch.is_whitespace() && *ch != '-' && *ch != '_')
        .flat_map(|ch| ch.to_lowercase())
        .collect()
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
        let logs = store.list_audit_logs(10).expect("list logs");
        assert_eq!(logs.len(), 1);

        let payload: serde_json::Value = serde_json::from_str(&logs[0].payload_json)
            .expect("audit payload should be valid json");
        assert_eq!(payload["project_name"], "Service Test");
        assert_eq!(payload["input_counts"]["weld_seams"], 1);
        assert_eq!(
            payload["rule_package_version"],
            response.rule_package.version
        );
    }

    #[test]
    fn run_match_hydrates_master_data_when_request_candidates_are_empty() {
        let store = Store::open_in_memory().expect("open memory db");

        let pqr = PqrCandidate {
            pqr_id: "PQR-HYDRATE-1".to_string(),
            standard_code: StandardCode::AsmeIx,
            process_code: "GTAW".to_string(),
            material_group_scope: vec!["P-No.1".to_string()],
            thickness_min_mm: 3.0,
            thickness_max_mm: 50.0,
            position_scope: vec!["2G".to_string()],
            dissimilar_support: true,
            thickness_mismatch_support: true,
            thickness_delta_max_mm: 20.0,
            valid_to: "2029-01-01".to_string(),
            status: "active".to_string(),
        };
        store
            .upsert_pqr_profile("PRJ-SVC-001", &pqr)
            .expect("upsert pqr profile");

        let welder = WelderCandidate {
            welder_id: "WELDER-HYDRATE-1".to_string(),
            cert_no: "CERT-HYDRATE-1".to_string(),
            standard_code: StandardCode::AsmeIx,
            process_code: "GTAW".to_string(),
            material_group_scope: vec!["P-No.1".to_string()],
            position_scope: vec!["2G".to_string(), "5G".to_string()],
            dissimilar_qualified: true,
            thickness_mismatch_qualified: true,
            thickness_delta_max_mm: 20.0,
            expiry_date: "2029-01-01".to_string(),
            status: "active".to_string(),
        };
        store
            .upsert_welder_profile("PRJ-SVC-001", &welder)
            .expect("upsert welder profile");

        let batch = ConsumableBatch {
            batch_no: "B-HYDRATE-1".to_string(),
            material_code: "ER70S-6".to_string(),
            spec_standard: "AWS A5.18".to_string(),
            qty_available: 20.0,
            safety_stock: 5.0,
            expiry_date: "2029-01-01".to_string(),
            status: "active".to_string(),
        };
        store
            .upsert_consumable_batch("PRJ-SVC-001", &batch)
            .expect("upsert batch");

        let mut request = sample_request();
        request.pqr_candidates.clear();
        request.welder_candidates.clear();
        request.consumable_batches.clear();

        let response =
            run_match_and_persist_with_master_data_store(&store, "Hydrate Test", &request)
                .expect("match should hydrate master data");

        assert!(response.recommended.is_some());
        assert_eq!(store.list_match_reports(10).expect("list reports").len(), 1);
    }

    #[test]
    fn seam_crud_works_via_service_layer() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock should be monotonic")
            .as_nanos();
        let db_path = std::env::temp_dir().join(format!("weldlayer-app-service-{unique}.db"));
        let db_path_str = db_path.to_string_lossy().into_owned();

        let seam = WeldSeam {
            weld_id: "W-SEAM-001".to_string(),
            material_group_a: "P-No.1".to_string(),
            material_group_b: "P-No.8".to_string(),
            thickness_a_mm: 16.0,
            thickness_b_mm: 10.0,
            position_code: "5G".to_string(),
            process_hint: "GTAW".to_string(),
            review_status: ReviewStatus::Confirmed,
        };

        upsert_weld_seam(&db_path_str, "PRJ-SVC-SEAM-001", &seam).expect("upsert seam");
        let rows = list_weld_seams(&db_path_str, "PRJ-SVC-SEAM-001", 10).expect("list seam");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].weld_id, "W-SEAM-001");

        assert!(
            delete_weld_seam(&db_path_str, "PRJ-SVC-SEAM-001", "W-SEAM-001").expect("delete seam")
        );
        assert_eq!(
            list_weld_seams(&db_path_str, "PRJ-SVC-SEAM-001", 10)
                .expect("list seam after delete")
                .len(),
            0
        );

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn history_queries_return_persisted_match_data() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock should be monotonic")
            .as_nanos();
        let db_path = std::env::temp_dir().join(format!("weldlayer-history-{unique}.db"));
        let db_path_str = db_path.to_string_lossy().into_owned();

        let request = sample_request();
        let response = run_match_and_persist(&db_path_str, "History Test", &request)
            .expect("match should persist report");

        let reports = list_match_reports(&db_path_str, 10).expect("list match reports");
        let logs = list_audit_logs(&db_path_str, 10).expect("list audit logs");

        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0].trace_id, response.trace_id);
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].trace_id, response.trace_id);
        assert_eq!(logs[0].action, "run_match");

        let payload: serde_json::Value =
            serde_json::from_str(&logs[0].payload_json).expect("audit payload should parse");
        assert_eq!(payload["project_name"], "History Test");
        assert_eq!(payload["decision"], "partial");
        assert_eq!(
            payload["inventory_alert_count"],
            serde_json::Value::from(response.inventory_alerts.len())
        );

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn audit_bundle_returns_request_response_and_logs() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock should be monotonic")
            .as_nanos();
        let db_path = std::env::temp_dir().join(format!("weldlayer-audit-bundle-{unique}.db"));
        let db_path_str = db_path.to_string_lossy().into_owned();

        let request = sample_request();
        let response = run_match_and_persist(&db_path_str, "Bundle Test", &request)
            .expect("match should persist report");

        let bundle = get_match_audit_bundle(&db_path_str, &response.trace_id)
            .expect("get audit bundle should succeed")
            .expect("audit bundle should exist");

        assert_eq!(bundle["trace_id"], response.trace_id);
        assert_eq!(bundle["request"]["project_id"], request.project_id);
        assert_eq!(bundle["response"]["trace_id"], response.trace_id);
        assert_eq!(
            bundle["audit_logs"].as_array().map(|items| items.len()),
            Some(1)
        );

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn baseline_service_freezes_and_lists_records() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock should be monotonic")
            .as_nanos();
        let db_path = std::env::temp_dir().join(format!("weldlayer-baseline-service-{unique}.db"));
        let db_path_str = db_path.to_string_lossy().into_owned();

        let request = sample_request();
        let response = run_match_and_persist(&db_path_str, "Baseline Test", &request)
            .expect("match should persist report");

        let baseline = freeze_match_baseline(&db_path_str, &response.trace_id, None)
            .expect("freeze baseline should succeed");
        let baselines = list_match_baselines(&db_path_str, &request.project_id, 10)
            .expect("list baselines should succeed");

        assert_eq!(baseline.trace_id, response.trace_id);
        assert_eq!(baselines.len(), 1);
        assert_eq!(baselines[0]["trace_id"], response.trace_id);
        assert_eq!(baselines[0]["review_status"], "ok");

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn baseline_review_status_marks_baseline_for_review_after_master_data_change() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock should be monotonic")
            .as_nanos();
        let db_path = std::env::temp_dir().join(format!("weldlayer-baseline-review-{unique}.db"));
        let db_path_str = db_path.to_string_lossy().into_owned();

        let request = sample_request();
        let response = run_match_and_persist(&db_path_str, "Baseline Review Test", &request)
            .expect("match should persist report");
        freeze_match_baseline(&db_path_str, &response.trace_id, Some("BASELINE-REVIEW"))
            .expect("freeze baseline should succeed");

        let store = Store::open(&db_path_str).expect("open store");
        std::thread::sleep(std::time::Duration::from_millis(1100));
        let pqr = PqrCandidate {
            pqr_id: "PQR-REVIEW-1".to_string(),
            standard_code: StandardCode::AsmeIx,
            process_code: "GTAW".to_string(),
            material_group_scope: vec!["P-No.1".to_string()],
            thickness_min_mm: 3.0,
            thickness_max_mm: 60.0,
            position_scope: vec!["2G".to_string(), "5G".to_string()],
            dissimilar_support: true,
            thickness_mismatch_support: true,
            thickness_delta_max_mm: 25.0,
            valid_to: "2029-01-01".to_string(),
            status: "active".to_string(),
        };
        store
            .upsert_pqr_profile(&request.project_id, &pqr)
            .expect("upsert review pqr");

        let reviewed = list_match_baselines(&db_path_str, &request.project_id, 10)
            .expect("list baselines with review");
        assert_eq!(reviewed[0]["review_status"], "needs_review");
        assert_eq!(reviewed[0]["change_counts"]["pqr"], 1);

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn baseline_impact_returns_changed_master_data_items() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock should be monotonic")
            .as_nanos();
        let db_path = std::env::temp_dir().join(format!("weldlayer-baseline-impact-{unique}.db"));
        let db_path_str = db_path.to_string_lossy().into_owned();

        let request = sample_request();
        let response = run_match_and_persist(&db_path_str, "Baseline Impact Test", &request)
            .expect("match should persist report");
        freeze_match_baseline(&db_path_str, &response.trace_id, Some("BASELINE-IMPACT"))
            .expect("freeze baseline should succeed");

        let store = Store::open(&db_path_str).expect("open store");
        std::thread::sleep(std::time::Duration::from_millis(1100));
        let seam = WeldSeam {
            weld_id: "W-IMPACT-001".to_string(),
            material_group_a: "P-No.1".to_string(),
            material_group_b: "P-No.8".to_string(),
            thickness_a_mm: 18.0,
            thickness_b_mm: 12.0,
            position_code: "5G".to_string(),
            process_hint: "GTAW".to_string(),
            review_status: ReviewStatus::Changed,
        };
        let batch = ConsumableBatch {
            batch_no: "B-IMPACT-001".to_string(),
            material_code: "ER70S-6".to_string(),
            spec_standard: "AWS A5.18".to_string(),
            qty_available: 9.0,
            safety_stock: 4.0,
            expiry_date: "2029-01-01".to_string(),
            status: "active".to_string(),
        };
        store
            .upsert_weld_seam(&request.project_id, &seam)
            .expect("upsert impact seam");
        store
            .upsert_consumable_batch(&request.project_id, &batch)
            .expect("upsert impact batch");

        let impact = get_match_baseline_impact(&db_path_str, &response.trace_id, 5, None)
            .expect("get baseline impact should succeed")
            .expect("baseline impact should exist");

        assert_eq!(impact["review_status"], "needs_review");
        assert_eq!(impact["change_counts"]["seam"], 1);
        assert_eq!(impact["change_counts"]["batch"], 1);
        assert_eq!(
            impact["changes_by_scope"]["seam"][0]["item_id"],
            serde_json::Value::from("W-IMPACT-001")
        );
        assert_eq!(
            impact["changes_by_scope"]["batch"][0]["item_id"],
            serde_json::Value::from("B-IMPACT-001")
        );
        assert_eq!(
            impact["changes_by_scope"]["seam"][0]["affected_seam_count"],
            1
        );
        assert_eq!(
            impact["changes_by_scope"]["batch"][0]["affected_material_codes"][0],
            serde_json::Value::from("ER70S-6")
        );
        assert!(impact["review_actions"]
            .as_array()
            .expect("review actions should be array")
            .iter()
            .any(|item| item["code"] == "recheck_input"));
        assert!(impact["review_actions"]
            .as_array()
            .expect("review actions should be array")
            .iter()
            .any(|item| item["code"] == "review_inventory"));

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn baseline_impact_marks_recommended_candidate_changes() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock should be monotonic")
            .as_nanos();
        let db_path =
            std::env::temp_dir().join(format!("weldlayer-baseline-impact-rec-{unique}.db"));
        let db_path_str = db_path.to_string_lossy().into_owned();

        let request = sample_request();
        let response = run_match_and_persist(&db_path_str, "Baseline Impact Recommended", &request)
            .expect("match should persist report");
        freeze_match_baseline(&db_path_str, &response.trace_id, Some("BASELINE-REC"))
            .expect("freeze baseline should succeed");

        let store = Store::open(&db_path_str).expect("open store");
        std::thread::sleep(std::time::Duration::from_millis(1100));
        let updated_pqr = PqrCandidate {
            pqr_id: "PQR-001".to_string(),
            standard_code: StandardCode::AsmeIx,
            process_code: "GTAW".to_string(),
            material_group_scope: vec!["P-No.1".to_string()],
            thickness_min_mm: 3.0,
            thickness_max_mm: 60.0,
            position_scope: vec!["2G".to_string(), "5G".to_string()],
            dissimilar_support: true,
            thickness_mismatch_support: true,
            thickness_delta_max_mm: 20.0,
            valid_to: "2029-01-01".to_string(),
            status: "active".to_string(),
        };
        store
            .upsert_pqr_profile(&request.project_id, &updated_pqr)
            .expect("upsert updated recommended pqr");

        let mut compare_request = sample_request();
        compare_request.trace_id = "TRC-SVC-002".to_string();
        compare_request.pqr_candidates = vec![PqrCandidate {
            pqr_id: "PQR-ALT-001".to_string(),
            standard_code: StandardCode::AsmeIx,
            process_code: "GTAW".to_string(),
            material_group_scope: vec!["P-No.1".to_string()],
            thickness_min_mm: 3.0,
            thickness_max_mm: 45.0,
            position_scope: vec!["2G".to_string()],
            dissimilar_support: true,
            thickness_mismatch_support: true,
            thickness_delta_max_mm: 10.0,
            valid_to: "2029-01-01".to_string(),
            status: "active".to_string(),
        }];
        let compare_response =
            run_match_and_persist(&db_path_str, "Baseline Impact Compare", &compare_request)
                .expect("compare match should persist report");

        let impact = get_match_baseline_impact(
            &db_path_str,
            &response.trace_id,
            5,
            Some(&compare_response.trace_id),
        )
        .expect("get baseline impact should succeed")
        .expect("baseline impact should exist");

        assert_eq!(
            impact["changes_by_scope"]["pqr"][0]["item_id"],
            serde_json::Value::from("PQR-001")
        );
        assert_eq!(
            impact["changes_by_scope"]["pqr"][0]["affects_recommended_candidate"],
            serde_json::Value::from(true)
        );
        assert_eq!(
            impact["changes_by_scope"]["pqr"][0]["affected_seam_ids"][0],
            serde_json::Value::from("W-001")
        );
        assert_eq!(
            impact["changes_by_scope"]["pqr"][0]["affects_compare_recommended_candidate"],
            serde_json::Value::from(false)
        );
        assert_eq!(
            impact["changes_by_scope"]["pqr"][0]["recommendation_relation"],
            serde_json::Value::from("原推荐命中该对象，当前推荐已切换")
        );
        assert_eq!(
            impact["compare_recommended"]["pqr_id"],
            serde_json::Value::from("PQR-ALT-001")
        );
        assert!(impact["review_actions"]
            .as_array()
            .expect("review actions should be array")
            .iter()
            .any(|item| item["code"] == "freeze_new_baseline"));

        let _ = std::fs::remove_file(db_path);
    }
}
