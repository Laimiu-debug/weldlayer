use contracts::matching::{
    ConflictItem, ConsumableBatch, Decision, InventoryAlert, InventoryPolicy, MatchRequest, MatchResponse,
    PqrCandidate, Recommendation, ReviewStatus, RulePackageRef, ScoreBreakdown, Severity, WelderCandidate, WeldSeam,
};
use thiserror::Error;

const THICKNESS_DIFF_THRESHOLD_MM: f64 = 3.0;
const DEFAULT_RULE_PACKAGE_VERSION: &str = "0.1.0";

#[derive(Debug, Error)]
pub enum EngineError {
    #[error("invalid input: {0}")]
    InvalidInput(&'static str),
}

#[derive(Debug)]
struct PairEvaluation {
    recommendation: Recommendation,
    hard_conflicts: Vec<ConflictItem>,
}

pub fn run_match(request: &MatchRequest) -> Result<MatchResponse, EngineError> {
    if request.top_k == 0 {
        return Err(EngineError::InvalidInput("top_k must be greater than zero"));
    }

    if request.weld_seams.is_empty() {
        return Err(EngineError::InvalidInput("weld_seams must not be empty"));
    }

    if request.weld_seams.iter().any(|s| !is_reviewed(&s.review_status)) {
        return Ok(MatchResponse {
            trace_id: request.trace_id.clone(),
            decision: Decision::Fail,
            recommended: None,
            alternatives: vec![],
            hard_conflicts: vec![ConflictItem {
                entity_type: "weld_seam".to_string(),
                entity_id: "all".to_string(),
                field_key: "review_status".to_string(),
                actual_value: "contains_pending_or_uncertain".to_string(),
                expected_value: "all_confirmed_or_changed".to_string(),
                rule_id: "GATE_REVIEW_001".to_string(),
                clause_ref: "FLOW:UNCONFIRMED_BLOCK_MATCH".to_string(),
                message: "存在未确认焊缝，正式匹配已阻断".to_string(),
                suggestion: "先在焊缝确认页完成人工复核".to_string(),
                severity: Severity::Error,
                evidence: "review_status gate".to_string(),
            }],
            inventory_alerts: vec![],
            rule_package: RulePackageRef {
                standard_code: request.standard_code.clone(),
                version: DEFAULT_RULE_PACKAGE_VERSION.to_string(),
            },
        });
    }

    let pqr_pool: Vec<&PqrCandidate> = request
        .pqr_candidates
        .iter()
        .filter(|p| p.standard_code == request.standard_code && is_active(&p.status))
        .collect();
    let welder_pool: Vec<&WelderCandidate> = request
        .welder_candidates
        .iter()
        .filter(|w| w.standard_code == request.standard_code && is_active(&w.status))
        .collect();

    if pqr_pool.is_empty() || welder_pool.is_empty() {
        return Ok(MatchResponse {
            trace_id: request.trace_id.clone(),
            decision: Decision::Fail,
            recommended: None,
            alternatives: vec![],
            hard_conflicts: vec![ConflictItem {
                entity_type: "candidate_pool".to_string(),
                entity_id: "all".to_string(),
                field_key: "availability".to_string(),
                actual_value: format!("pqr={},welder={}", pqr_pool.len(), welder_pool.len()),
                expected_value: "pqr>0 and welder>0".to_string(),
                rule_id: "POOL_EMPTY_001".to_string(),
                clause_ref: "ENGINE:ELIGIBLE_CANDIDATE_REQUIRED".to_string(),
                message: "候选池为空，无法匹配".to_string(),
                suggestion: "补充主数据并确保状态 active".to_string(),
                severity: Severity::Error,
                evidence: "candidate pool filter".to_string(),
            }],
            inventory_alerts: vec![],
            rule_package: RulePackageRef {
                standard_code: request.standard_code.clone(),
                version: DEFAULT_RULE_PACKAGE_VERSION.to_string(),
            },
        });
    }

    let (inventory_alerts, batch_ids, consumable_score, inventory_hard_fail) = evaluate_inventory(
        &request.inventory_policy,
        &request.required_consumables,
        &request.consumable_batches,
    );

    let mut pair_evaluations: Vec<PairEvaluation> = vec![];
    for pqr in &pqr_pool {
        for welder in &welder_pool {
            pair_evaluations.push(evaluate_pair(
                &request.weld_seams,
                pqr,
                welder,
                consumable_score,
                batch_ids.clone(),
            ));
        }
    }

    let mut eligible: Vec<Recommendation> = pair_evaluations
        .iter()
        .filter(|e| e.hard_conflicts.is_empty())
        .map(|e| e.recommendation.clone())
        .collect();

    eligible.sort_by(|l, r| {
        r.score
            .final_score
            .partial_cmp(&l.score.final_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let best_conflicts = pair_evaluations
        .iter()
        .min_by_key(|e| e.hard_conflicts.len())
        .map(|e| e.hard_conflicts.clone())
        .unwrap_or_default();

    if eligible.is_empty() {
        return Ok(MatchResponse {
            trace_id: request.trace_id.clone(),
            decision: Decision::Fail,
            recommended: None,
            alternatives: vec![],
            hard_conflicts: best_conflicts,
            inventory_alerts,
            rule_package: RulePackageRef {
                standard_code: request.standard_code.clone(),
                version: DEFAULT_RULE_PACKAGE_VERSION.to_string(),
            },
        });
    }

    if inventory_hard_fail {
        return Ok(MatchResponse {
            trace_id: request.trace_id.clone(),
            decision: Decision::Fail,
            recommended: None,
            alternatives: eligible.into_iter().take(request.top_k).collect(),
            hard_conflicts: vec![],
            inventory_alerts,
            rule_package: RulePackageRef {
                standard_code: request.standard_code.clone(),
                version: DEFAULT_RULE_PACKAGE_VERSION.to_string(),
            },
        });
    }

    let recommended = eligible.first().cloned();
    let alternatives = eligible.into_iter().skip(1).take(request.top_k.saturating_sub(1)).collect();
    let decision = if has_warning(&inventory_alerts) {
        Decision::Partial
    } else {
        Decision::Match
    };

    Ok(MatchResponse {
        trace_id: request.trace_id.clone(),
        decision,
        recommended,
        alternatives,
        hard_conflicts: vec![],
        inventory_alerts,
        rule_package: RulePackageRef {
            standard_code: request.standard_code.clone(),
            version: DEFAULT_RULE_PACKAGE_VERSION.to_string(),
        },
    })
}

fn evaluate_pair(
    seams: &[WeldSeam],
    pqr: &PqrCandidate,
    welder: &WelderCandidate,
    consumable_score: f64,
    batch_ids: Vec<String>,
) -> PairEvaluation {
    let mut hard_conflicts = vec![];
    let mut pqr_checks = 0_u64;
    let mut pqr_passed = 0_u64;
    let mut welder_checks = 0_u64;
    let mut welder_passed = 0_u64;

    for seam in seams {
        let groups = [&seam.material_group_a, &seam.material_group_b];
        let has_dissimilar = seam.material_group_a != seam.material_group_b;
        let thk_delta = (seam.thickness_a_mm - seam.thickness_b_mm).abs();
        let has_thk_mismatch = thk_delta > THICKNESS_DIFF_THRESHOLD_MM;
        let max_thk = seam.thickness_a_mm.max(seam.thickness_b_mm);
        let min_thk = seam.thickness_a_mm.min(seam.thickness_b_mm);

        pqr_checks += 1;
        if equal_process(&seam.process_hint, &pqr.process_code) {
            pqr_passed += 1;
        } else {
            hard_conflicts.push(conflict(
                "pqr",
                &pqr.pqr_id,
                "process_code",
                &pqr.process_code,
                &seam.process_hint,
                "RULE_PROCESS_001",
                "ENGINE:PROCESS_MATCH_REQUIRED",
            ));
        }

        pqr_checks += 1;
        if groups
            .iter()
            .all(|g| pqr.material_group_scope.iter().any(|s| s.eq_ignore_ascii_case(g)))
        {
            pqr_passed += 1;
        } else {
            hard_conflicts.push(conflict(
                "pqr",
                &pqr.pqr_id,
                "material_group_scope",
                &pqr.material_group_scope.join("|"),
                &format!("{}/{}", seam.material_group_a, seam.material_group_b),
                "RULE_MATERIAL_001",
                "ENGINE:MATERIAL_SCOPE_REQUIRED",
            ));
        }

        pqr_checks += 1;
        if min_thk >= pqr.thickness_min_mm && max_thk <= pqr.thickness_max_mm {
            pqr_passed += 1;
        } else {
            hard_conflicts.push(conflict(
                "pqr",
                &pqr.pqr_id,
                "thickness_range",
                &format!("{}-{}", pqr.thickness_min_mm, pqr.thickness_max_mm),
                &format!("{}/{}", seam.thickness_a_mm, seam.thickness_b_mm),
                "RULE_THICKNESS_001",
                "ASME_IX:QW-452.1(b)",
            ));
        }

        pqr_checks += 1;
        if pqr.position_scope.iter().any(|p| p.eq_ignore_ascii_case(&seam.position_code)) {
            pqr_passed += 1;
        } else {
            hard_conflicts.push(conflict(
                "pqr",
                &pqr.pqr_id,
                "position_scope",
                &pqr.position_scope.join("|"),
                &seam.position_code,
                "RULE_POSITION_001",
                "ENGINE:POSITION_SCOPE_REQUIRED",
            ));
        }

        if has_dissimilar {
            pqr_checks += 1;
            if pqr.dissimilar_support {
                pqr_passed += 1;
            } else {
                hard_conflicts.push(conflict(
                    "pqr",
                    &pqr.pqr_id,
                    "dissimilar_support",
                    "false",
                    "true",
                    "RULE_DISSIMILAR_001",
                    "ENGINE:DISSIMILAR_SUPPORT_REQUIRED",
                ));
            }
        }

        if has_thk_mismatch {
            pqr_checks += 1;
            if pqr.thickness_mismatch_support && pqr.thickness_delta_max_mm >= thk_delta {
                pqr_passed += 1;
            } else {
                hard_conflicts.push(conflict(
                    "pqr",
                    &pqr.pqr_id,
                    "thickness_delta_max_mm",
                    &pqr.thickness_delta_max_mm.to_string(),
                    &thk_delta.to_string(),
                    "RULE_DELTA_001",
                    "ENGINE:THICKNESS_DELTA_SUPPORT_REQUIRED",
                ));
            }
        }

        welder_checks += 1;
        if equal_process(&seam.process_hint, &welder.process_code) {
            welder_passed += 1;
        } else {
            hard_conflicts.push(conflict(
                "welder",
                &welder.welder_id,
                "process_code",
                &welder.process_code,
                &seam.process_hint,
                "RULE_W_PROCESS_001",
                "ENGINE:PROCESS_MATCH_REQUIRED",
            ));
        }

        welder_checks += 1;
        if groups
            .iter()
            .all(|g| welder.material_group_scope.iter().any(|s| s.eq_ignore_ascii_case(g)))
        {
            welder_passed += 1;
        } else {
            hard_conflicts.push(conflict(
                "welder",
                &welder.welder_id,
                "material_group_scope",
                &welder.material_group_scope.join("|"),
                &format!("{}/{}", seam.material_group_a, seam.material_group_b),
                "RULE_W_MATERIAL_001",
                "ENGINE:MATERIAL_SCOPE_REQUIRED",
            ));
        }

        welder_checks += 1;
        if welder.position_scope.iter().any(|p| p.eq_ignore_ascii_case(&seam.position_code)) {
            welder_passed += 1;
        } else {
            hard_conflicts.push(conflict(
                "welder",
                &welder.welder_id,
                "position_scope",
                &welder.position_scope.join("|"),
                &seam.position_code,
                "RULE_W_POSITION_001",
                "ENGINE:POSITION_SCOPE_REQUIRED",
            ));
        }

        if has_dissimilar {
            welder_checks += 1;
            if welder.dissimilar_qualified {
                welder_passed += 1;
            } else {
                hard_conflicts.push(conflict(
                    "welder",
                    &welder.welder_id,
                    "dissimilar_qualified",
                    "false",
                    "true",
                    "RULE_W_DISSIMILAR_001",
                    "ENGINE:DISSIMILAR_QUAL_REQUIRED",
                ));
            }
        }

        if has_thk_mismatch {
            welder_checks += 1;
            if welder.thickness_mismatch_qualified && welder.thickness_delta_max_mm >= thk_delta {
                welder_passed += 1;
            } else {
                hard_conflicts.push(conflict(
                    "welder",
                    &welder.welder_id,
                    "thickness_delta_max_mm",
                    &welder.thickness_delta_max_mm.to_string(),
                    &thk_delta.to_string(),
                    "RULE_W_DELTA_001",
                    "ENGINE:THICKNESS_DELTA_QUAL_REQUIRED",
                ));
            }
        }
    }

    let pqr_score = ratio(pqr_passed, pqr_checks);
    let welder_score = ratio(welder_passed, welder_checks);
    let final_score = (0.5 * pqr_score) + (0.3 * welder_score) + (0.2 * consumable_score);

    PairEvaluation {
        recommendation: Recommendation {
            pqr_id: pqr.pqr_id.clone(),
            welder_id: welder.welder_id.clone(),
            consumable_batch_ids: batch_ids,
            score: ScoreBreakdown {
                pqr_score,
                welder_score,
                consumable_score,
                final_score,
            },
        },
        hard_conflicts,
    }
}

fn evaluate_inventory(
    policy: &InventoryPolicy,
    required: &[contracts::matching::RequiredConsumable],
    batches: &[ConsumableBatch],
) -> (Vec<InventoryAlert>, Vec<String>, f64, bool) {
    let mut alerts = vec![];
    let mut selected_batches = vec![];
    let mut hard_fail = false;

    for need in required {
        let candidate = batches
            .iter()
            .filter(|b| b.material_code.eq_ignore_ascii_case(&need.material_code))
            .filter(|b| is_active(&b.status))
            .max_by(|l, r| l.qty_available.partial_cmp(&r.qty_available).unwrap_or(std::cmp::Ordering::Equal));

        if let Some(batch) = candidate {
            selected_batches.push(batch.batch_no.clone());

            if batch.qty_available < need.required_qty {
                let severity = if matches!(policy, InventoryPolicy::Strict) {
                    hard_fail = true;
                    Severity::Error
                } else {
                    Severity::Warning
                };
                alerts.push(InventoryAlert {
                    material_code: need.material_code.clone(),
                    batch_no: batch.batch_no.clone(),
                    required_qty: need.required_qty,
                    available_qty: batch.qty_available,
                    expiry_date: batch.expiry_date.clone(),
                    clause_ref: "INVENTORY:STOCK_MIN_001".to_string(),
                    severity,
                    suggestion: "补料或切换可用批次".to_string(),
                });
            }

            if batch.qty_available < batch.safety_stock {
                alerts.push(InventoryAlert {
                    material_code: need.material_code.clone(),
                    batch_no: batch.batch_no.clone(),
                    required_qty: need.required_qty,
                    available_qty: batch.qty_available,
                    expiry_date: batch.expiry_date.clone(),
                    clause_ref: "INVENTORY:SAFETY_STOCK_WARN_001".to_string(),
                    severity: Severity::Warning,
                    suggestion: "低于安全库存，建议尽快补货".to_string(),
                });
            }
        } else {
            let severity = if matches!(policy, InventoryPolicy::Strict) {
                hard_fail = true;
                Severity::Error
            } else {
                Severity::Warning
            };
            alerts.push(InventoryAlert {
                material_code: need.material_code.clone(),
                batch_no: "N/A".to_string(),
                required_qty: need.required_qty,
                available_qty: 0.0,
                expiry_date: "N/A".to_string(),
                clause_ref: "INVENTORY:BATCH_NOT_FOUND_001".to_string(),
                severity,
                suggestion: "新增批次或调整工艺材料".to_string(),
            });
        }
    }

    let mut score = 1.0_f64 - (alerts.len() as f64 * 0.15);
    if score < 0.2 {
        score = 0.2;
    }
    if required.is_empty() {
        score = 1.0;
    }

    (alerts, selected_batches, score, hard_fail)
}

fn conflict(
    entity_type: &str,
    entity_id: &str,
    field_key: &str,
    actual_value: &str,
    expected_value: &str,
    rule_id: &str,
    clause_ref: &str,
) -> ConflictItem {
    ConflictItem {
        entity_type: entity_type.to_string(),
        entity_id: entity_id.to_string(),
        field_key: field_key.to_string(),
        actual_value: actual_value.to_string(),
        expected_value: expected_value.to_string(),
        rule_id: rule_id.to_string(),
        clause_ref: clause_ref.to_string(),
        message: format!("字段 {field_key} 不满足约束"),
        suggestion: "修复数据后重试匹配".to_string(),
        severity: Severity::Error,
        evidence: "engine rule evaluation".to_string(),
    }
}

fn ratio(passed: u64, total: u64) -> f64 {
    if total == 0 {
        1.0
    } else {
        passed as f64 / total as f64
    }
}

fn is_reviewed(status: &ReviewStatus) -> bool {
    matches!(status, ReviewStatus::Confirmed | ReviewStatus::Changed)
}

fn is_active(status: &str) -> bool {
    status.eq_ignore_ascii_case("active")
}

fn equal_process(left: &str, right: &str) -> bool {
    left.eq_ignore_ascii_case(right) || right.to_ascii_uppercase().contains(&left.to_ascii_uppercase())
}

fn has_warning(alerts: &[InventoryAlert]) -> bool {
    alerts
        .iter()
        .any(|a| matches!(a.severity, Severity::Warning | Severity::Info))
}

#[cfg(test)]
mod tests {
    use super::*;
    use contracts::matching::{
        ConsumableBatch, InventoryPolicy, MatchRequest, PqrCandidate, RequiredConsumable, ReviewStatus, StandardCode,
        WelderCandidate, WeldSeam,
    };

    fn sample_request(policy: InventoryPolicy, qty_available: f64) -> MatchRequest {
        MatchRequest {
            trace_id: "TRC-TEST-0001".to_string(),
            project_id: "PRJ-1".to_string(),
            standard_code: StandardCode::AsmeIx,
            inventory_policy: policy,
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
                position_scope: vec!["1G".to_string(), "2G".to_string()],
                dissimilar_support: true,
                thickness_mismatch_support: true,
                thickness_delta_max_mm: 10.0,
                valid_to: "2027-01-01".to_string(),
                status: "active".to_string(),
            }],
            welder_candidates: vec![WelderCandidate {
                welder_id: "WELDER-001".to_string(),
                cert_no: "CERT-1".to_string(),
                standard_code: StandardCode::AsmeIx,
                process_code: "GTAW".to_string(),
                material_group_scope: vec!["P-No.1".to_string()],
                position_scope: vec!["2G".to_string(), "5G".to_string()],
                dissimilar_qualified: true,
                thickness_mismatch_qualified: true,
                thickness_delta_max_mm: 10.0,
                expiry_date: "2027-02-01".to_string(),
                status: "active".to_string(),
            }],
            required_consumables: vec![RequiredConsumable {
                material_code: "ER70S-6".to_string(),
                required_qty: 10.0,
            }],
            consumable_batches: vec![ConsumableBatch {
                batch_no: "B-001".to_string(),
                material_code: "ER70S-6".to_string(),
                spec_standard: "AWS".to_string(),
                qty_available,
                safety_stock: 8.0,
                expiry_date: "2027-01-01".to_string(),
                status: "active".to_string(),
            }],
        }
    }

    #[test]
    fn warn_policy_returns_partial_when_stock_insufficient() {
        let response = run_match(&sample_request(InventoryPolicy::Warn, 5.0)).expect("engine should run");
        assert_eq!(response.decision, Decision::Partial);
        assert!(!response.inventory_alerts.is_empty());
        assert!(response.recommended.is_some());
    }

    #[test]
    fn strict_policy_returns_fail_when_stock_insufficient() {
        let response = run_match(&sample_request(InventoryPolicy::Strict, 5.0)).expect("engine should run");
        assert_eq!(response.decision, Decision::Fail);
        assert!(response.recommended.is_none());
    }
}
