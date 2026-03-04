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
pub struct ExtractedWeldSeam {
    pub weld_id: String,
    pub draw_ref: String,
    pub weld_symbol: String,
    pub material_spec: String,
    pub thickness_mm: f64,
    pub position_code: String,
    pub confidence_score: f64,
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
    pub seams: Vec<ExtractedWeldSeam>,
    pub errors: Vec<ParseError>,
    pub logs: Vec<ParseLog>,
}
