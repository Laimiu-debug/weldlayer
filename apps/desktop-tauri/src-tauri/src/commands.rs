use app_service::{
    archive_project as archive_project_service,
    delete_consumable_batch, delete_pqr_profile, delete_weld_seam, delete_welder_profile,
    freeze_match_baseline as freeze_match_baseline_service,
    get_project as get_project_service,
    get_match_audit_bundle as get_match_audit_bundle_service,
    get_match_baseline_impact as get_match_baseline_impact_service,
    list_projects as list_projects_service,
    list_audit_logs as list_audit_logs_service, list_consumable_batches,
    list_match_baselines as list_match_baselines_service,
    list_match_reports as list_match_reports_service, list_pqr_profiles, list_weld_seams,
    list_welder_profiles, run_match_and_persist_with_master_data, run_parse_via_sidecar,
    upsert_project as upsert_project_service,
    upsert_consumable_batch, upsert_pqr_profile, upsert_weld_seam, upsert_welder_profile,
    SidecarConfig,
};
use contracts::matching::{
    ConsumableBatch, MatchRequest, PqrCandidate, StandardCode, WeldSeam, WelderCandidate,
};
use contracts::parser::ParseRequest;
use serde::{Deserialize, Serialize};
use std::env;
use std::path::{Path, PathBuf};
use base64::Engine as _;

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
    let config_path = ai_config_path()?.to_string_lossy().into_owned();

    Ok(SidecarConfig {
        interpreter,
        script_path,
        envs: vec![("WELDLAYER_AI_CONFIG_PATH".to_string(), config_path)],
    })
}

fn parse_standard_code(value: &str) -> Result<StandardCode, String> {
    match value.trim().to_ascii_uppercase().as_str() {
        "ASME_IX" | "ASMEIX" | "ASME-IX" | "ASME IX" => Ok(StandardCode::AsmeIx),
        "CN_GB" | "CNGB" | "CN-GB" | "CN GB" => Ok(StandardCode::CnGb),
        other => Err(format!("unsupported standard code: {other}")),
    }
}

#[derive(Debug, Serialize)]
struct PickedDrawingFile {
    path: String,
    file_name: String,
    file_type: String,
    size_bytes: u64,
}

#[derive(Debug, Serialize)]
struct DrawingPreviewPayload {
    mime_type: String,
    base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
struct AiProviderConfig {
    ocr: String,
    layout: String,
    reasoning: String,
}

impl Default for AiProviderConfig {
    fn default() -> Self {
        Self {
            ocr: "rapidocr_local".to_string(),
            layout: "onnx_local".to_string(),
            reasoning: "disabled".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
struct AiModelConfig {
    ocr_dir: String,
    layout_model: String,
    reasoning_model: String,
    reasoning_endpoint: String,
}

impl Default for AiModelConfig {
    fn default() -> Self {
        Self {
            ocr_dir: "%APPDATA%\\WeldLayer\\models\\ocr".to_string(),
            layout_model: "%APPDATA%\\WeldLayer\\models\\layout\\layout.onnx".to_string(),
            reasoning_model: "qwen2.5:7b".to_string(),
            reasoning_endpoint: "http://127.0.0.1:11434".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
struct AiRuntimeConfig {
    device: String,
    threads: u16,
    offline_mode: bool,
    ocr_languages: Vec<String>,
    candidate_confidence_threshold: f32,
    association_confidence_threshold: f32,
}

impl Default for AiRuntimeConfig {
    fn default() -> Self {
        Self {
            device: "cpu".to_string(),
            threads: 6,
            offline_mode: true,
            ocr_languages: vec!["zh".to_string(), "en".to_string()],
            candidate_confidence_threshold: 0.55,
            association_confidence_threshold: 0.70,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
struct AiFeatureConfig {
    enable_ocr: bool,
    enable_layout_detection: bool,
    enable_table_extraction: bool,
    enable_llm_reasoning: bool,
    enable_cloud_api: bool,
}

impl Default for AiFeatureConfig {
    fn default() -> Self {
        Self {
            enable_ocr: true,
            enable_layout_detection: true,
            enable_table_extraction: true,
            enable_llm_reasoning: false,
            enable_cloud_api: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
struct AiFieldAlias {
    names: Vec<String>,
}

impl Default for AiFieldAlias {
    fn default() -> Self {
        Self { names: Vec::new() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
struct AiFieldAliasMap {
    material: AiFieldAlias,
    thickness: AiFieldAlias,
    part_no: AiFieldAlias,
    interface_no: AiFieldAlias,
    weld_method: AiFieldAlias,
    filler: AiFieldAlias,
}

impl Default for AiFieldAliasMap {
    fn default() -> Self {
        Self {
            material: AiFieldAlias {
                names: vec!["材料".to_string(), "材质".to_string(), "母材".to_string()],
            },
            thickness: AiFieldAlias {
                names: vec!["厚度".to_string(), "δ".to_string(), "t".to_string()],
            },
            part_no: AiFieldAlias {
                names: vec!["件号".to_string(), "位号".to_string(), "编号".to_string()],
            },
            interface_no: AiFieldAlias {
                names: vec!["接口号".to_string(), "接口".to_string(), "接管号".to_string()],
            },
            weld_method: AiFieldAlias {
                names: vec!["焊接方法".to_string(), "焊接规程".to_string(), "WPS".to_string()],
            },
            filler: AiFieldAlias {
                names: vec!["焊接材料".to_string(), "焊材".to_string(), "焊丝".to_string()],
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
struct AiLayoutHintConfig {
    prefer_title_block: String,
    prefer_bom_region: String,
    prefer_interface_region: String,
    prefer_requirement_region: String,
}

impl Default for AiLayoutHintConfig {
    fn default() -> Self {
        Self {
            prefer_title_block: "bottom_right".to_string(),
            prefer_bom_region: "bottom_left".to_string(),
            prefer_interface_region: "right_middle".to_string(),
            prefer_requirement_region: "right_bottom".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
struct AiProfileConfig {
    name: String,
    customer_name: String,
    drawing_kinds: Vec<String>,
    part_number_prefixes: Vec<String>,
    field_alias: AiFieldAliasMap,
    layout_hint: AiLayoutHintConfig,
}

impl Default for AiProfileConfig {
    fn default() -> Self {
        Self {
            name: "pressure_vessel_default".to_string(),
            customer_name: "default".to_string(),
            drawing_kinds: vec!["容器图".to_string(), "管口方位图".to_string(), "装配图".to_string()],
            part_number_prefixes: vec!["A".to_string(), "B".to_string(), "DN".to_string()],
            field_alias: AiFieldAliasMap::default(),
            layout_hint: AiLayoutHintConfig::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
struct AiConfig {
    providers: AiProviderConfig,
    models: AiModelConfig,
    runtime: AiRuntimeConfig,
    features: AiFeatureConfig,
    profile: AiProfileConfig,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            providers: AiProviderConfig::default(),
            models: AiModelConfig::default(),
            runtime: AiRuntimeConfig::default(),
            features: AiFeatureConfig::default(),
            profile: AiProfileConfig::default(),
        }
    }
}

#[derive(Debug, Serialize)]
struct AiConfigPayload {
    config_path: String,
    config: AiConfig,
}

fn infer_drawing_file_type(path: &Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.trim().to_ascii_lowercase())
        .as_deref()
    {
        Some("pdf") => Some("pdf"),
        Some("dwg") => Some("dwg"),
        _ => None,
    }
}

fn infer_preview_mime_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.trim().to_ascii_lowercase())
        .as_deref()
    {
        Some("pdf") => "application/pdf",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        _ => "application/octet-stream",
    }
}

fn weldlayer_config_dir() -> Result<PathBuf, String> {
    if let Ok(appdata) = env::var("APPDATA") {
        let trimmed = appdata.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed).join("WeldLayer").join("config"));
        }
    }
    if let Ok(local_appdata) = env::var("LOCALAPPDATA") {
        let trimmed = local_appdata.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed).join("WeldLayer").join("config"));
        }
    }
    env::current_dir()
        .map(|cwd| cwd.join(".weldlayer").join("config"))
        .map_err(|e| format!("resolve fallback config directory failed: {e}"))
}

fn ai_config_path() -> Result<PathBuf, String> {
    weldlayer_config_dir().map(|dir| dir.join("ai_config.toml"))
}

fn ensure_ai_config_parent(path: &Path) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "ai config path has no parent directory".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|e| format!("create ai config directory failed for {}: {e}", parent.display()))
}

fn persist_ai_config(config: &AiConfig) -> Result<(), String> {
    let path = ai_config_path()?;
    ensure_ai_config_parent(&path)?;
    let toml_text =
        toml::to_string_pretty(config).map_err(|e| format!("serialize ai config failed: {e}"))?;
    std::fs::write(&path, toml_text)
        .map_err(|e| format!("write ai config failed for {}: {e}", path.display()))
}

fn load_ai_config_model() -> Result<AiConfig, String> {
    let path = ai_config_path()?;
    if !path.is_file() {
        let default_config = AiConfig::default();
        persist_ai_config(&default_config)?;
        return Ok(default_config);
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("read ai config failed for {}: {e}", path.display()))?;
    toml::from_str::<AiConfig>(&content)
        .map_err(|e| format!("parse ai config failed for {}: {e}", path.display()))
}

fn build_ai_config_payload(config: AiConfig) -> Result<String, String> {
    let path = ai_config_path()?;
    serde_json::to_string(&AiConfigPayload {
        config_path: path.to_string_lossy().into_owned(),
        config,
    })
    .map_err(|e| format!("serialize ai config payload failed: {e}"))
}

#[tauri::command]
pub fn upsert_project(
    db_path: String,
    project_id: String,
    project_name: String,
    company_name: String,
    drawing_type: String,
    standard_code: String,
) -> Result<String, String> {
    let standard_code = parse_standard_code(&standard_code)?;
    upsert_project_service(
        &db_path,
        &project_id,
        &project_name,
        &company_name,
        &drawing_type,
        &standard_code,
    )
    .map_err(|e| format!("upsert project failed: {e}"))?;
    Ok("{\"ok\":true}".to_string())
}

#[tauri::command]
pub fn get_project(db_path: String, project_id: String) -> Result<String, String> {
    let row = get_project_service(&db_path, &project_id)
        .map_err(|e| format!("get project failed: {e}"))?;
    serde_json::to_string(&row.map(|item| {
        serde_json::json!({
            "project_id": item.project_id,
            "project_name": item.project_name,
            "company_name": item.company_name,
            "drawing_type": item.drawing_type,
            "standard_code": format!("{:?}", item.standard_code),
            "archived_at": item.archived_at,
            "updated_at": item.updated_at
        })
    }))
    .map_err(|e| format!("serialize project failed: {e}"))
}

#[tauri::command]
pub fn list_projects(
    db_path: String,
    limit: Option<usize>,
    include_archived: Option<bool>,
) -> Result<String, String> {
    let rows = list_projects_service(&db_path, limit.unwrap_or(20), include_archived.unwrap_or(true))
        .map_err(|e| format!("list projects failed: {e}"))?;
    let payload = rows
        .into_iter()
        .map(|item| {
            serde_json::json!({
                "project_id": item.project_id,
                "project_name": item.project_name,
                "company_name": item.company_name,
                "drawing_type": item.drawing_type,
                "standard_code": format!("{:?}", item.standard_code),
                "archived_at": item.archived_at,
                "updated_at": item.updated_at
            })
        })
        .collect::<Vec<_>>();
    serde_json::to_string(&payload).map_err(|e| format!("serialize project list failed: {e}"))
}

#[tauri::command]
pub fn archive_project(
    db_path: String,
    project_id: String,
    archived: Option<bool>,
) -> Result<String, String> {
    let archived = archived.unwrap_or(true);
    let changed = archive_project_service(&db_path, &project_id, archived)
        .map_err(|e| format!("archive project failed: {e}"))?;
    serde_json::to_string(&serde_json::json!({ "changed": changed, "archived": archived }))
        .map_err(|e| format!("serialize archive project result failed: {e}"))
}

#[tauri::command]
pub fn pick_drawing_files() -> Result<String, String> {
    let files = rfd::FileDialog::new()
        .add_filter("Drawing Files", &["pdf", "dwg"])
        .pick_files()
        .unwrap_or_default();

    let payload = files
        .into_iter()
        .filter_map(|path| {
            let file_type = infer_drawing_file_type(&path)?;
            let metadata = std::fs::metadata(&path).ok();
            Some(PickedDrawingFile {
                path: path.to_string_lossy().into_owned(),
                file_name: path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or_default()
                    .to_string(),
                file_type: file_type.to_string(),
                size_bytes: metadata.map(|value| value.len()).unwrap_or(0),
            })
        })
        .collect::<Vec<_>>();

    serde_json::to_string(&payload).map_err(|e| format!("serialize picked drawing files failed: {e}"))
}

#[tauri::command]
pub fn read_drawing_preview(path: String) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("drawing preview path is empty".to_string());
    }

    let file_path = PathBuf::from(trimmed);
    let bytes = std::fs::read(&file_path)
        .map_err(|e| format!("read drawing preview failed for {}: {e}", file_path.display()))?;
    let payload = DrawingPreviewPayload {
        mime_type: infer_preview_mime_type(&file_path).to_string(),
        base64: base64::engine::general_purpose::STANDARD.encode(bytes),
    };
    serde_json::to_string(&payload).map_err(|e| format!("serialize drawing preview failed: {e}"))
}

#[tauri::command]
pub fn get_ai_config_path() -> Result<String, String> {
    ai_config_path().map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn load_ai_config() -> Result<String, String> {
    let config = load_ai_config_model()?;
    build_ai_config_payload(config)
}

#[tauri::command]
pub fn save_ai_config(config_json: String) -> Result<String, String> {
    let config = serde_json::from_str::<AiConfig>(&config_json)
        .map_err(|e| format!("invalid ai config json: {e}"))?;
    persist_ai_config(&config)?;
    build_ai_config_payload(config)
}

#[tauri::command]
pub fn run_match(
    db_path: String,
    project_name: String,
    request_json: String,
) -> Result<String, String> {
    let request = serde_json::from_str::<MatchRequest>(&request_json)
        .map_err(|e| format!("invalid match request: {e}"))?;
    let response = run_match_and_persist_with_master_data(&db_path, &project_name, &request)
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

#[tauri::command]
pub fn upsert_pqr(db_path: String, project_id: String, pqr_json: String) -> Result<String, String> {
    let pqr = serde_json::from_str::<PqrCandidate>(&pqr_json)
        .map_err(|e| format!("invalid pqr json: {e}"))?;
    upsert_pqr_profile(&db_path, &project_id, &pqr)
        .map_err(|e| format!("upsert pqr failed: {e}"))?;
    Ok("{\"ok\":true}".to_string())
}

#[tauri::command]
pub fn list_pqrs(
    db_path: String,
    project_id: String,
    limit: Option<usize>,
) -> Result<String, String> {
    let rows = list_pqr_profiles(&db_path, &project_id, limit.unwrap_or(200))
        .map_err(|e| format!("list pqr failed: {e}"))?;
    serde_json::to_string(&rows).map_err(|e| format!("serialize pqr list failed: {e}"))
}

#[tauri::command]
pub fn delete_pqr(db_path: String, project_id: String, pqr_id: String) -> Result<String, String> {
    let deleted = delete_pqr_profile(&db_path, &project_id, &pqr_id)
        .map_err(|e| format!("delete pqr failed: {e}"))?;
    serde_json::to_string(&serde_json::json!({ "deleted": deleted }))
        .map_err(|e| format!("serialize delete pqr result failed: {e}"))
}

#[tauri::command]
pub fn upsert_welder(
    db_path: String,
    project_id: String,
    welder_json: String,
) -> Result<String, String> {
    let welder = serde_json::from_str::<WelderCandidate>(&welder_json)
        .map_err(|e| format!("invalid welder json: {e}"))?;
    upsert_welder_profile(&db_path, &project_id, &welder)
        .map_err(|e| format!("upsert welder failed: {e}"))?;
    Ok("{\"ok\":true}".to_string())
}

#[tauri::command]
pub fn list_welders(
    db_path: String,
    project_id: String,
    limit: Option<usize>,
) -> Result<String, String> {
    let rows = list_welder_profiles(&db_path, &project_id, limit.unwrap_or(200))
        .map_err(|e| format!("list welder failed: {e}"))?;
    serde_json::to_string(&rows).map_err(|e| format!("serialize welder list failed: {e}"))
}

#[tauri::command]
pub fn delete_welder(
    db_path: String,
    project_id: String,
    welder_id: String,
) -> Result<String, String> {
    let deleted = delete_welder_profile(&db_path, &project_id, &welder_id)
        .map_err(|e| format!("delete welder failed: {e}"))?;
    serde_json::to_string(&serde_json::json!({ "deleted": deleted }))
        .map_err(|e| format!("serialize delete welder result failed: {e}"))
}

#[tauri::command]
pub fn upsert_batch(
    db_path: String,
    project_id: String,
    batch_json: String,
) -> Result<String, String> {
    let batch = serde_json::from_str::<ConsumableBatch>(&batch_json)
        .map_err(|e| format!("invalid batch json: {e}"))?;
    upsert_consumable_batch(&db_path, &project_id, &batch)
        .map_err(|e| format!("upsert batch failed: {e}"))?;
    Ok("{\"ok\":true}".to_string())
}

#[tauri::command]
pub fn list_batches(
    db_path: String,
    project_id: String,
    limit: Option<usize>,
) -> Result<String, String> {
    let rows = list_consumable_batches(&db_path, &project_id, limit.unwrap_or(200))
        .map_err(|e| format!("list batch failed: {e}"))?;
    serde_json::to_string(&rows).map_err(|e| format!("serialize batch list failed: {e}"))
}

#[tauri::command]
pub fn delete_batch(
    db_path: String,
    project_id: String,
    batch_no: String,
) -> Result<String, String> {
    let deleted = delete_consumable_batch(&db_path, &project_id, &batch_no)
        .map_err(|e| format!("delete batch failed: {e}"))?;
    serde_json::to_string(&serde_json::json!({ "deleted": deleted }))
        .map_err(|e| format!("serialize delete batch result failed: {e}"))
}

#[tauri::command]
pub fn upsert_seam(
    db_path: String,
    project_id: String,
    seam_json: String,
) -> Result<String, String> {
    let seam = serde_json::from_str::<WeldSeam>(&seam_json)
        .map_err(|e| format!("invalid seam json: {e}"))?;
    upsert_weld_seam(&db_path, &project_id, &seam)
        .map_err(|e| format!("upsert seam failed: {e}"))?;
    Ok("{\"ok\":true}".to_string())
}

#[tauri::command]
pub fn list_seams(
    db_path: String,
    project_id: String,
    limit: Option<usize>,
) -> Result<String, String> {
    let rows = list_weld_seams(&db_path, &project_id, limit.unwrap_or(200))
        .map_err(|e| format!("list seam failed: {e}"))?;
    serde_json::to_string(&rows).map_err(|e| format!("serialize seam list failed: {e}"))
}

#[tauri::command]
pub fn delete_seam(db_path: String, project_id: String, weld_id: String) -> Result<String, String> {
    let deleted = delete_weld_seam(&db_path, &project_id, &weld_id)
        .map_err(|e| format!("delete seam failed: {e}"))?;
    serde_json::to_string(&serde_json::json!({ "deleted": deleted }))
        .map_err(|e| format!("serialize delete seam result failed: {e}"))
}

#[tauri::command]
pub fn list_match_reports(
    db_path: String,
    project_id: Option<String>,
    limit: Option<usize>,
) -> Result<String, String> {
    let rows = list_match_reports_service(&db_path, project_id.as_deref(), limit.unwrap_or(20))
        .map_err(|e| format!("list match reports failed: {e}"))?;
    let payload = rows
        .into_iter()
        .map(|row| {
            serde_json::json!({
                "trace_id": row.trace_id,
                "project_id": row.project_id,
                "decision": row.decision,
                "rule_package_version": row.rule_package_version,
                "request_json": row.request_json,
                "response_json": row.response_json,
                "created_at": row.created_at
            })
        })
        .collect::<Vec<_>>();
    serde_json::to_string(&payload).map_err(|e| format!("serialize match reports failed: {e}"))
}

#[tauri::command]
pub fn list_audit_logs(
    db_path: String,
    project_id: Option<String>,
    limit: Option<usize>,
) -> Result<String, String> {
    let rows = list_audit_logs_service(&db_path, project_id.as_deref(), limit.unwrap_or(20))
        .map_err(|e| format!("list audit logs failed: {e}"))?;
    let payload = rows
        .into_iter()
        .map(|row| {
            serde_json::json!({
                "trace_id": row.trace_id,
                "action": row.action,
                "result": row.result,
                "payload_json": row.payload_json,
                "created_at": row.created_at
            })
        })
        .collect::<Vec<_>>();
    serde_json::to_string(&payload).map_err(|e| format!("serialize audit logs failed: {e}"))
}

#[tauri::command]
pub fn get_match_audit_bundle(db_path: String, trace_id: String) -> Result<String, String> {
    let payload = get_match_audit_bundle_service(&db_path, &trace_id)
        .map_err(|e| format!("get audit bundle failed: {e}"))?;
    serde_json::to_string(&payload).map_err(|e| format!("serialize audit bundle failed: {e}"))
}

#[tauri::command]
pub fn freeze_match_baseline(
    db_path: String,
    trace_id: String,
    baseline_label: Option<String>,
) -> Result<String, String> {
    let row = freeze_match_baseline_service(&db_path, &trace_id, baseline_label.as_deref())
        .map_err(|e| format!("freeze match baseline failed: {e}"))?;
    let payload = serde_json::json!({
        "trace_id": row.trace_id,
        "project_id": row.project_id,
        "baseline_label": row.baseline_label,
        "decision": row.decision,
        "rule_package_version": row.rule_package_version,
        "summary_json": row.summary_json,
        "created_at": row.created_at
    });
    serde_json::to_string(&payload).map_err(|e| format!("serialize baseline failed: {e}"))
}

#[tauri::command]
pub fn list_match_baselines(
    db_path: String,
    project_id: String,
    limit: Option<usize>,
) -> Result<String, String> {
    let rows = list_match_baselines_service(&db_path, &project_id, limit.unwrap_or(20))
        .map_err(|e| format!("list match baselines failed: {e}"))?;
    serde_json::to_string(&rows).map_err(|e| format!("serialize match baselines failed: {e}"))
}

#[tauri::command]
pub fn get_match_baseline_impact(
    db_path: String,
    trace_id: String,
    limit_per_scope: Option<usize>,
    compare_trace_id: Option<String>,
) -> Result<String, String> {
    let payload = get_match_baseline_impact_service(
        &db_path,
        &trace_id,
        limit_per_scope.unwrap_or(5),
        compare_trace_id.as_deref(),
    )
    .map_err(|e| format!("get match baseline impact failed: {e}"))?;
    serde_json::to_string(&payload)
        .map_err(|e| format!("serialize match baseline impact failed: {e}"))
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
        assert!(result
            .expect_err("invalid JSON should return Err")
            .contains("invalid match request"));
    }

    #[test]
    fn run_parse_rejects_invalid_json() {
        let result = run_parse("{".to_string());
        assert!(result.is_err());
        assert!(result
            .expect_err("invalid JSON should return Err")
            .contains("invalid parse request"));
    }

    #[test]
    fn resolve_sidecar_script_path_finds_existing_script() {
        let script_path =
            resolve_sidecar_script_path().expect("sidecar script should exist in repository");
        assert!(Path::new(&script_path).is_file());
        assert!(script_path.ends_with("parser_sidecar.py"));
    }

    #[test]
    fn infer_drawing_file_type_recognizes_supported_extensions() {
        assert_eq!(
            infer_drawing_file_type(Path::new("C:/demo/a.PDF")),
            Some("pdf")
        );
        assert_eq!(
            infer_drawing_file_type(Path::new("C:/demo/a.dwg")),
            Some("dwg")
        );
        assert_eq!(infer_drawing_file_type(Path::new("C:/demo/a.txt")), None);
    }

    #[test]
    fn ai_config_defaults_serialize_to_toml() {
        let config = AiConfig::default();
        let toml_text = toml::to_string_pretty(&config).expect("default ai config should serialize");
        assert!(toml_text.contains("[providers]"));
        assert!(toml_text.contains("rapidocr_local"));
        assert!(toml_text.contains("[profile.field_alias.material]"));
    }
}
