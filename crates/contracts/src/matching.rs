use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StandardCode {
    CnGb,
    AsmeIx,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum InventoryPolicy {
    Warn,
    Strict,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReviewStatus {
    Pending,
    Confirmed,
    Changed,
    Uncertain,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeldSeam {
    pub weld_id: String,
    pub material_group_a: String,
    pub material_group_b: String,
    pub thickness_a_mm: f64,
    pub thickness_b_mm: f64,
    pub position_code: String,
    pub process_hint: String,
    pub review_status: ReviewStatus,
    #[serde(default)]
    pub weld_symbol: Option<String>,
    #[serde(default)]
    pub confidence_score: Option<f64>,
    #[serde(default)]
    pub source_kind: Option<String>,
    #[serde(default)]
    pub source_draw_ref: Option<String>,
    #[serde(default)]
    pub source_candidate_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PqrCandidate {
    pub pqr_id: String,
    pub standard_code: StandardCode,
    pub process_code: String,
    pub material_group_scope: Vec<String>,
    pub thickness_min_mm: f64,
    pub thickness_max_mm: f64,
    pub position_scope: Vec<String>,
    pub dissimilar_support: bool,
    pub thickness_mismatch_support: bool,
    pub thickness_delta_max_mm: f64,
    pub valid_to: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WelderCandidate {
    pub welder_id: String,
    pub cert_no: String,
    pub standard_code: StandardCode,
    pub process_code: String,
    pub material_group_scope: Vec<String>,
    pub position_scope: Vec<String>,
    pub dissimilar_qualified: bool,
    pub thickness_mismatch_qualified: bool,
    pub thickness_delta_max_mm: f64,
    pub expiry_date: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequiredConsumable {
    pub material_code: String,
    pub required_qty: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsumableBatch {
    pub batch_no: String,
    pub material_code: String,
    pub spec_standard: String,
    pub qty_available: f64,
    pub safety_stock: f64,
    pub expiry_date: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchRequest {
    pub trace_id: String,
    pub project_id: String,
    pub standard_code: StandardCode,
    pub inventory_policy: InventoryPolicy,
    pub top_k: usize,
    pub weld_seams: Vec<WeldSeam>,
    pub pqr_candidates: Vec<PqrCandidate>,
    pub welder_candidates: Vec<WelderCandidate>,
    pub required_consumables: Vec<RequiredConsumable>,
    pub consumable_batches: Vec<ConsumableBatch>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Decision {
    Match,
    Partial,
    Fail,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreBreakdown {
    pub pqr_score: f64,
    pub welder_score: f64,
    pub consumable_score: f64,
    pub final_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recommendation {
    pub pqr_id: String,
    pub welder_id: String,
    pub consumable_batch_ids: Vec<String>,
    pub score: ScoreBreakdown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictItem {
    pub entity_type: String,
    pub entity_id: String,
    pub field_key: String,
    pub actual_value: String,
    pub expected_value: String,
    pub rule_id: String,
    pub clause_ref: String,
    pub message: String,
    pub suggestion: String,
    pub severity: Severity,
    pub evidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryAlert {
    pub material_code: String,
    pub batch_no: String,
    pub required_qty: f64,
    pub available_qty: f64,
    pub expiry_date: String,
    pub clause_ref: String,
    pub severity: Severity,
    pub suggestion: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RulePackageRef {
    pub standard_code: StandardCode,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchResponse {
    pub trace_id: String,
    pub decision: Decision,
    pub recommended: Option<Recommendation>,
    pub alternatives: Vec<Recommendation>,
    pub hard_conflicts: Vec<ConflictItem>,
    pub inventory_alerts: Vec<InventoryAlert>,
    pub rule_package: RulePackageRef,
}
