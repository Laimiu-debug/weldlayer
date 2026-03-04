use contracts::matching::{
    ConsumableBatch, InventoryPolicy, MatchRequest, PqrCandidate, RequiredConsumable, ReviewStatus, StandardCode,
    WelderCandidate, WeldSeam,
};
use core_engine::run_match;
use core_store::Store;

fn main() {
    let db_path = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "weldlayer.db".to_string());

    let request = sample_request();
    let response = match run_match(&request) {
        Ok(response) => response,
        Err(err) => {
            eprintln!("engine error: {err}");
            std::process::exit(1);
        }
    };

    let store = match Store::open(&db_path) {
        Ok(store) => store,
        Err(err) => {
            eprintln!("open store failed: {err}");
            std::process::exit(2);
        }
    };

    if let Err(err) = store.upsert_project(&request.project_id, "Demo Project", &request.standard_code) {
        eprintln!("upsert project failed: {err}");
        std::process::exit(3);
    }
    if let Err(err) = store.insert_match_report(&request, &response) {
        eprintln!("save report failed: {err}");
        std::process::exit(4);
    }
    if let Err(err) = store.insert_audit_log(
        &response.trace_id,
        "run_match",
        &format!("{:?}", response.decision).to_lowercase(),
        "{}",
    ) {
        eprintln!("save audit log failed: {err}");
        std::process::exit(5);
    }

    let output = serde_json::json!({
        "db_path": db_path,
        "trace_id": response.trace_id,
        "decision": format!("{:?}", response.decision).to_lowercase(),
        "recommended": response.recommended.as_ref().map(|r| {
            serde_json::json!({
                "pqr_id": r.pqr_id,
                "welder_id": r.welder_id,
                "score": r.score.final_score
            })
        }),
        "hard_conflicts": response.hard_conflicts.len(),
        "inventory_alerts": response.inventory_alerts.len()
    });
    println!("{output}");
}

fn sample_request() -> MatchRequest {
    MatchRequest {
        trace_id: "TRC-CLI-20260304-00001".to_string(),
        project_id: "PRJ-CLI-001".to_string(),
        standard_code: StandardCode::AsmeIx,
        inventory_policy: InventoryPolicy::Warn,
        top_k: 3,
        weld_seams: vec![
            WeldSeam {
                weld_id: "W-001".to_string(),
                material_group_a: "P-No.1".to_string(),
                material_group_b: "P-No.1".to_string(),
                thickness_a_mm: 12.0,
                thickness_b_mm: 12.0,
                position_code: "2G".to_string(),
                process_hint: "GTAW".to_string(),
                review_status: ReviewStatus::Confirmed,
            },
            WeldSeam {
                weld_id: "W-002".to_string(),
                material_group_a: "P-No.1".to_string(),
                material_group_b: "P-No.8".to_string(),
                thickness_a_mm: 20.0,
                thickness_b_mm: 14.0,
                position_code: "5G".to_string(),
                process_hint: "GTAW".to_string(),
                review_status: ReviewStatus::Changed,
            },
        ],
        pqr_candidates: vec![PqrCandidate {
            pqr_id: "PQR-102".to_string(),
            standard_code: StandardCode::AsmeIx,
            process_code: "GTAW".to_string(),
            material_group_scope: vec!["P-No.1".to_string(), "P-No.8".to_string()],
            thickness_min_mm: 3.0,
            thickness_max_mm: 45.0,
            position_scope: vec!["2G".to_string(), "5G".to_string()],
            dissimilar_support: true,
            thickness_mismatch_support: true,
            thickness_delta_max_mm: 10.0,
            valid_to: "2027-01-20".to_string(),
            status: "active".to_string(),
        }],
        welder_candidates: vec![WelderCandidate {
            welder_id: "WELDER-018".to_string(),
            cert_no: "CERT-7782".to_string(),
            standard_code: StandardCode::AsmeIx,
            process_code: "GTAW".to_string(),
            material_group_scope: vec!["P-No.1".to_string(), "P-No.8".to_string()],
            position_scope: vec!["2G".to_string(), "5G".to_string(), "6G".to_string()],
            dissimilar_qualified: true,
            thickness_mismatch_qualified: true,
            thickness_delta_max_mm: 10.0,
            expiry_date: "2026-12-31".to_string(),
            status: "active".to_string(),
        }],
        required_consumables: vec![
            RequiredConsumable {
                material_code: "ER70S-6".to_string(),
                required_qty: 8.0,
            },
            RequiredConsumable {
                material_code: "ER308L".to_string(),
                required_qty: 5.0,
            },
        ],
        consumable_batches: vec![
            ConsumableBatch {
                batch_no: "B-001".to_string(),
                material_code: "ER70S-6".to_string(),
                spec_standard: "AWS A5.18".to_string(),
                qty_available: 12.0,
                safety_stock: 6.0,
                expiry_date: "2027-03-01".to_string(),
                status: "active".to_string(),
            },
            ConsumableBatch {
                batch_no: "B-002".to_string(),
                material_code: "ER308L".to_string(),
                spec_standard: "AWS A5.9".to_string(),
                qty_available: 3.0,
                safety_stock: 4.0,
                expiry_date: "2026-06-15".to_string(),
                status: "active".to_string(),
            },
        ],
    }
}
