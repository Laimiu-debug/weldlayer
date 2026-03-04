use app_service::{run_match_and_persist, run_parse_via_sidecar, SidecarConfig};
use contracts::matching::{
    ConsumableBatch, InventoryPolicy, MatchRequest, PqrCandidate, RequiredConsumable, ReviewStatus, StandardCode,
    WelderCandidate, WeldSeam,
};
use contracts::parser::{ParseOptions, ParseRequest, SourceFile, SourceFileType};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let subcmd = args.first().map(|s| s.as_str()).unwrap_or("match");

    match subcmd {
        "match" => {
            let db_path = args
                .get(1)
                .cloned()
                .unwrap_or_else(|| "weldlayer.db".to_string());
            let request = if let Some(input_file) = args.get(2) {
                match load_match_request_from_file(input_file) {
                    Ok(mut req) => {
                        if req.trace_id.trim().is_empty() {
                            req.trace_id = generate_trace_id();
                        }
                        req
                    }
                    Err(err) => {
                        eprintln!("failed to load match request from {input_file}: {err}");
                        std::process::exit(65);
                    }
                }
            } else {
                sample_match_request(generate_trace_id())
            };
            let response = match run_match_and_persist(&db_path, "Demo Project", &request) {
                Ok(response) => response,
                Err(err) => {
                    eprintln!("app service error: {err}");
                    std::process::exit(1);
                }
            };
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
        "parse" => {
            let request = if let Some(input_file) = args.get(1) {
                match load_parse_request_from_file(input_file) {
                    Ok(mut req) => {
                        if req.trace_id.trim().is_empty() {
                            req.trace_id = generate_trace_id();
                        }
                        req
                    }
                    Err(err) => {
                        eprintln!("failed to load parse request from {input_file}: {err}");
                        std::process::exit(66);
                    }
                }
            } else {
                sample_parse_request(generate_trace_id())
            };
            let sidecar = SidecarConfig::default();
            let response = match run_parse_via_sidecar(&sidecar, &request) {
                Ok(response) => response,
                Err(err) => {
                    eprintln!("parse service error: {err}");
                    std::process::exit(2);
                }
            };
            println!(
                "{}",
                serde_json::json!({
                    "trace_id": response.trace_id,
                    "status": response.status,
                    "seam_count": response.seams.len(),
                    "error_count": response.errors.len()
                })
            );
        }
        _ => {
            eprintln!("unknown subcommand: {subcmd}");
            eprintln!("usage:");
            eprintln!("  engine-cli match [db_path] [match_request.json]");
            eprintln!("  engine-cli parse [parse_request.json]");
            std::process::exit(64);
        }
    }
}

fn sample_match_request(trace_id: String) -> MatchRequest {
    MatchRequest {
        trace_id,
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

fn generate_trace_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("TRC-CLI-{ts}")
}

fn sample_parse_request(trace_id: String) -> ParseRequest {
    ParseRequest {
        trace_id,
        project_id: "PRJ-CLI-001".to_string(),
        files: vec![
            SourceFile {
                path: "G:/drawings/pressure_line_01.pdf".to_string(),
                file_type: SourceFileType::Pdf,
            },
            SourceFile {
                path: "G:/drawings/vessel_joint_revB.dwg".to_string(),
                file_type: SourceFileType::Dwg,
            },
        ],
        options: ParseOptions {
            detect_weld_symbols: true,
            detect_sections: true,
            language: "zh-CN".to_string(),
        },
    }
}

fn load_match_request_from_file(path: &str) -> Result<MatchRequest, String> {
    let raw = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str::<MatchRequest>(&raw).map_err(|e| e.to_string())
}

fn load_parse_request_from_file(path: &str) -> Result<ParseRequest, String> {
    let raw = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str::<ParseRequest>(&raw).map_err(|e| e.to_string())
}
