use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SourceFileType {
    Pdf,
    Dwg,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceFile {
    pub path: String,
    pub file_type: SourceFileType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseOptions {
    pub detect_weld_symbols: bool,
    pub detect_sections: bool,
    pub language: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseRequest {
    pub trace_id: String,
    pub project_id: String,
    pub files: Vec<SourceFile>,
    pub options: ParseOptions,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ParseStatus {
    Success,
    Partial,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewAnchorBox {
    pub x: f64,
    pub y: f64,
    #[serde(default)]
    pub w: f64,
    #[serde(default)]
    pub h: f64,
    #[serde(default)]
    pub page_index: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CandidateEvidence {
    #[serde(default)]
    pub r#type: String,
    #[serde(default)]
    pub score: f64,
    #[serde(default)]
    pub source_ref: String,
    #[serde(default)]
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedWeldSeam {
    pub weld_id: String,
    pub draw_ref: String,
    pub weld_symbol: String,
    pub material_spec: String,
    pub thickness_mm: f64,
    pub position_code: String,
    pub confidence_score: f64,
    #[serde(default)]
    pub review_status: String,
    #[serde(default)]
    pub source_kind: String,
    #[serde(default)]
    pub anchor_bbox: Option<PreviewAnchorBox>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedWeldCandidate {
    pub candidate_id: String,
    pub draw_ref: String,
    #[serde(default)]
    pub sheet_no: String,
    #[serde(default)]
    pub page_index: usize,
    #[serde(default)]
    pub source_kind: String,
    #[serde(default)]
    pub candidate_type: String,
    #[serde(default)]
    pub joint_geometry: String,
    #[serde(default)]
    pub material_guess_a: String,
    #[serde(default)]
    pub material_guess_b: String,
    #[serde(default)]
    pub thickness_guess_a_mm: f64,
    #[serde(default)]
    pub thickness_guess_b_mm: f64,
    #[serde(default)]
    pub position_guess: String,
    #[serde(default)]
    pub weld_symbol_guess: String,
    #[serde(default)]
    pub confidence_score: f64,
    #[serde(default)]
    pub review_status: String,
    #[serde(default)]
    pub anchor_bbox: Option<PreviewAnchorBox>,
    #[serde(default)]
    pub evidence: Vec<CandidateEvidence>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseError {
    pub code: String,
    pub message: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseLog {
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseResponse {
    pub trace_id: String,
    pub status: ParseStatus,
    #[serde(default)]
    pub seams: Vec<ExtractedWeldSeam>,
    #[serde(default)]
    pub candidates: Vec<ExtractedWeldCandidate>,
    #[serde(default)]
    pub errors: Vec<ParseError>,
    #[serde(default)]
    pub logs: Vec<ParseLog>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_response_defaults_new_candidate_fields() {
        let payload = r#"{
            "trace_id": "PARSE-001",
            "status": "success",
            "seams": [
                {
                    "weld_id": "W-AUTO-001",
                    "draw_ref": "demo.pdf",
                    "weld_symbol": "FW",
                    "material_spec": "P-No.1",
                    "thickness_mm": 12.0,
                    "position_code": "2G",
                    "confidence_score": 0.88
                }
            ]
        }"#;

        let parsed: ParseResponse = serde_json::from_str(payload).expect("parse response should deserialize");
        assert_eq!(parsed.candidates.len(), 0);
        assert_eq!(parsed.errors.len(), 0);
        assert_eq!(parsed.logs.len(), 0);
        assert_eq!(parsed.seams[0].review_status, "");
        assert!(parsed.seams[0].anchor_bbox.is_none());
    }
}
