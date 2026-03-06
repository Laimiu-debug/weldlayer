const THICKNESS_DIFF_THRESHOLD = 3;
const PROTOTYPE_DB_PATH = "weldlayer.db";
const PROTOTYPE_PROJECT_ID = "PRJ-PROTOTYPE-001";
const MASTER_DATA_SYNC_LIMIT = 1000;
const EXECUTION_HISTORY_LIMIT = 12;
const PARSE_HISTORY_LIMIT = 16;
const DEFAULT_PROJECT = {
  id: PROTOTYPE_PROJECT_ID,
  name: "压力管道改造 A-26",
  company: "Laimiu Fabrication",
  drawingType: "PDF + DWG",
  standard: "ASME_IX",
  archivedAt: 0,
  updatedAt: Math.floor(Date.now() / 1000)
};
const MASTER_BATCH_ROWS = [
  {
    batch_no: "B-001",
    material_code: "ER70S-6",
    spec_standard: "AWS A5.18",
    qty_available: 12.0,
    safety_stock: 6.0,
    expiry_date: "2027-03-01",
    status: "active"
  },
  {
    batch_no: "B-002",
    material_code: "ER308L",
    spec_standard: "AWS A5.9",
    qty_available: 3.0,
    safety_stock: 4.0,
    expiry_date: "2026-06-15",
    status: "active"
  }
];
const PARSE_ALLOWED_FILE_TYPES = new Set(["pdf", "dwg"]);
const DEFAULT_PARSE_OPTIONS = {
  detectWeldSymbols: true,
  detectSections: true,
  language: "zh-CN"
};
const SAMPLE_PARSE_FILES = [
  { path: "pressure_line_01.pdf", fileType: "pdf", source: "sample" },
  { path: "vessel_joint_revB.dwg", fileType: "dwg", source: "sample" },
  { path: "support_branch_03.dwg", fileType: "dwg", source: "sample" }
];

const appState = {
  view: "project",
  standard: DEFAULT_PROJECT.standard,
  currentProject: { ...DEFAULT_PROJECT },
  projects: [{ ...DEFAULT_PROJECT }],
  seamRows: [
    { id: "W-001", matA: "P-No.1", matB: "P-No.1", thkA: 16, thkB: 16, pos: "2G", symbol: "BW", conf: 0.92, status: "confirmed" },
    { id: "W-002", matA: "P-No.1", matB: "P-No.8", thkA: 38, thkB: 25, pos: "5G", symbol: "BW", conf: 0.65, status: "pending" },
    { id: "W-003", matA: "P-No.8", matB: "P-No.8", thkA: 9, thkB: 9, pos: "1G", symbol: "FW", conf: 0.88, status: "confirmed" },
    { id: "W-004", matA: "P-No.1", matB: "P-No.1", thkA: 22, thkB: 14, pos: "6G", symbol: "BW", conf: 0.58, status: "pending" },
    { id: "W-005", matA: "P-No.11", matB: "P-No.11", thkA: 12, thkB: 12, pos: "2F", symbol: "FW", conf: 0.81, status: "confirmed" },
    { id: "W-006", matA: "P-No.1", matB: "P-No.11", thkA: 45, thkB: 28, pos: "5G", symbol: "BW", conf: 0.54, status: "pending" }
  ],
  pqrRows: [
    {
      id: "PQR-102",
      standard: "ASME_IX",
      process: "GTAW+SMAW",
      range: "3-45",
      pos: "1G/2G/5G",
      dissimilar: true,
      thicknessMismatch: true,
      maxDelta: 20,
      valid: "2027-01-20",
      status: "active"
    },
    {
      id: "PQR-118",
      standard: "ASME_IX",
      process: "SMAW",
      range: "6-25",
      pos: "1G/2G",
      dissimilar: false,
      thicknessMismatch: true,
      maxDelta: 10,
      valid: "2026-09-12",
      status: "active"
    },
    {
      id: "PQR-203",
      standard: "CN_GB",
      process: "MAG",
      range: "4-32",
      pos: "PA/PB/PC",
      dissimilar: true,
      thicknessMismatch: false,
      maxDelta: 3,
      valid: "2026-11-02",
      status: "active"
    }
  ],
  welderRows: [
    {
      id: "W-018",
      cert: "CERT-7782",
      process: "GTAW+SMAW",
      pos: "1G/2G/5G/6G",
      group: "P-No.1/P-No.8",
      dissimilarQualified: true,
      thicknessMismatchQualified: true,
      thicknessDeltaMax: 18,
      exp: "2026-12-31",
      status: "active"
    },
    {
      id: "W-021",
      cert: "CERT-7810",
      process: "SMAW",
      pos: "1G/2G",
      group: "P-No.1",
      dissimilarQualified: false,
      thicknessMismatchQualified: true,
      thicknessDeltaMax: 8,
      exp: "2026-07-11",
      status: "warning"
    },
    {
      id: "W-042",
      cert: "CERT-7933",
      process: "MAG",
      pos: "PA/PB",
      group: "P-No.8/P-No.11",
      dissimilarQualified: true,
      thicknessMismatchQualified: false,
      thicknessDeltaMax: 3,
      exp: "2027-03-05",
      status: "active"
    }
  ],
  batchRows: MASTER_BATCH_ROWS.map((row) => ({ ...row })),
  alternatives: [
    { pqr: "PQR-118", welder: "W-021", score: 0.72 },
    { pqr: "PQR-102", welder: "W-042", score: 0.69 },
    { pqr: "PQR-203", welder: "W-018", score: 0.64 }
  ],
  conflicts: [
    {
      entity: "pqr",
      field: "thickness_mm",
      actual: "38",
      expected: "<=25",
      clause: "ASME_IX:QW-452.1(b)",
      severity: "error"
    },
    {
      entity: "welder",
      field: "expiry_date",
      actual: "2026-07-11",
      expected: "> 2026-08-01",
      clause: "ASME_IX:QW-322",
      severity: "warning"
    }
  ],
  inventoryAlerts: [],
  matchReports: [],
  auditLogs: [],
  matchBaselines: [],
  baselineComparison: null,
  baselineImpact: null,
  selectedMatchTraceId: "",
  parseQueue: [],
  parseLogs: [],
  parseResult: null,
  parseOptions: { ...DEFAULT_PARSE_OPTIONS },
  parseFilters: {
    status: "all",
    review: "all"
  },
  parseHistory: [],
  selectedParseHistoryId: "",
  parseSelectedQueueId: "",
  parseSelectedSeamId: "",
  parseSelectedCandidateId: "",
  parseBusy: false,
  parseProgress: 0,
  parsePreviewMode: "browse",
  parsePreviewZoom: 100,
  parsePreviewRotation: 0,
  parsePreviewExpanded: false,
  parsePreviewPageIndex: 0,
  parsePreviewPageCount: 0,
  parsePreviewDrag: null,
  parsePreviewSuppressClickUntil: 0,
  parsePreviewAddSeamMode: false,
  parseShortcutPanelVisible: false,
  templateVersion: [1, 0, 0],
  traceId: "TRC-20260304-00017",
  licenseStatus: "NotActivated",
  masterDirty: {
    seam: false,
    pqr: false,
    welder: false,
    batch: false
  },
  pqrFilter: {
    dissimilarOnly: false,
    thicknessOnly: false,
    sortCol: "valid",
    sortDir: "asc"
  },
  welderFilter: {
    dissimilarOnly: false,
    thicknessOnly: false,
    sortCol: "exp",
    sortDir: "asc"
  }
};

const parsePreviewRuntime = {
  pdfJsPromise: null,
  documentKey: "",
  documentProxy: null,
  loadingTask: null,
  renderTask: null,
  requestToken: 0
};

const viewMeta = {
  project: {
    title: "焊接工艺匹配工作台",
    breadcrumb: "项目中心 / 项目首页",
    detailTitle: "项目摘要",
    detailText: "当前视图展示端到端流程入口。建议进入图纸导入页开始解析。"
  },
  import: {
    title: "图纸导入与解析",
    breadcrumb: "项目中心 / 图纸导入解析",
    detailTitle: "解析任务",
    detailText: "导入 PDF/DWG，输出焊缝信息初稿与解析日志。"
  },
  seam: {
    title: "焊缝信息确认",
    breadcrumb: "项目中心 / 焊缝信息确认",
    detailTitle: "人工复核",
    detailText: "重点复核异种金属与不同厚度两类特殊工况。"
  },
  pqr: {
    title: "PQR 主数据管理",
    breadcrumb: "资源库 / PQR 管理",
    detailTitle: "PQR 库",
    detailText: "列头右侧支持符号化排序与筛选浮层。"
  },
  welder: {
    title: "焊工资格管理",
    breadcrumb: "资源库 / 焊工资格管理",
    detailTitle: "焊工资格库",
    detailText: "列头右侧支持符号化排序与筛选浮层。"
  },
  match: {
    title: "匹配结果与冲突解释",
    breadcrumb: "项目中心 / 匹配与冲突解释",
    detailTitle: "规则执行结果",
    detailText: "展示推荐方案与字段级条款冲突。"
  },
  template: {
    title: "工艺卡模板映射",
    breadcrumb: "资源库 / 模板映射",
    detailTitle: "模板版本",
    detailText: "模板映射支持版本化保存。"
  },
  export: {
    title: "工艺卡预览与导出",
    breadcrumb: "输出中心 / 工艺卡预览导出",
    detailTitle: "导出检查",
    detailText: "导出前完成完整性检查。"
  },
  license: {
    title: "许可证中心",
    breadcrumb: "系统中心 / 许可证",
    detailTitle: "授权管理",
    detailText: "支持在线激活与离线许可证导入。"
  }
};

viewMeta.inventory = {
  title: "库存批次管理",
  breadcrumb: "资源库 / 库存批次管理",
  detailTitle: "库存批次主数据",
  detailText: "维护批次库存、到期日期和可用数量，并支持与后端主数据同步。"
};

const menuButtons = [...document.querySelectorAll(".menu-item")];
const views = [...document.querySelectorAll(".view")];
const projectForm = document.querySelector("#project-form");
const projectFormMode = document.querySelector("#project-form-mode");
const projectCurrentId = document.querySelector("#project-current-id");
const projectCurrentName = document.querySelector("#project-current-name");
const projectCurrentSummary = document.querySelector("#project-current-summary");
const projectCurrentPills = document.querySelector("#project-current-pills");
const projectRecentBody = document.querySelector("#project-recent-body");
const projectRecentCaption = document.querySelector("#project-recent-caption");
const projectLastScore = document.querySelector("#project-last-score");
const projectRefreshBtn = document.querySelector("#btn-project-refresh");
const projectResetBtn = document.querySelector("#btn-project-reset");
const projectOpenImportBtn = document.querySelector("#btn-project-open-import");
const projectArchiveCurrentBtn = document.querySelector("#btn-project-archive-current");
const parseDropzone = document.querySelector("#parse-dropzone");
const parseFileInput = document.querySelector("#parse-file-input");
const parsePickFilesBtn = document.querySelector("#btn-pick-parse-files");
const parseAddSampleBtn = document.querySelector("#btn-parse-add-sample");
const parseClearQueueBtn = document.querySelector("#btn-clear-parse-queue");
const parseRunBtn = document.querySelector("#btn-parse");
const parseRetryBtn = document.querySelector("#btn-retry-parse");
const parseAcceptAllBtn = document.querySelector("#btn-parse-accept-all");
const parseQueueBody = document.querySelector("#parse-queue-body");
const parseQueueCaption = document.querySelector("#parse-queue-caption");
const parseFilterStatus = document.querySelector("#parse-filter-status");
const parseFilterReview = document.querySelector("#parse-filter-review");
const parseFilterResetBtn = document.querySelector("#btn-parse-filter-reset");
const parseProgressBar = document.querySelector("#parse-progress-bar");
const parseProgressLabel = document.querySelector("#parse-progress-label");
const parseStatusLabel = document.querySelector("#parse-status");
const parseSummaryLabel = document.querySelector("#parse-summary");
const parsePreviewCaption = document.querySelector("#parse-preview-caption");
const parsePreviewEmpty = document.querySelector("#parse-preview-empty");
const parsePreviewContent = document.querySelector("#parse-preview-content");
const parsePreviewBody = document.querySelector("#parse-preview-body");
const parsePreviewCandidateBody = document.querySelector("#parse-preview-candidate-body");
const parseErrorList = document.querySelector("#parse-error-list");
const parseLogPanel = document.querySelector("#parse-log");
const parseOptionsForm = document.querySelector("#parse-options-form");
const parseDetectSymbolsInput = document.querySelector("#parse-option-detect-symbols");
const parseDetectSectionsInput = document.querySelector("#parse-option-detect-sections");
const parseLanguageSelect = document.querySelector("#parse-option-language");
const parseLoadSeamsBtn = document.querySelector("#btn-parse-load-seams");
const parseSelectedTitle = document.querySelector("#parse-selected-title");
const parseSelectedMeta = document.querySelector("#parse-selected-meta");
const parseDetailGrid = document.querySelector("#parse-detail-grid");
const parseSelectPrevBtn = document.querySelector("#btn-parse-select-prev");
const parseSelectNextBtn = document.querySelector("#btn-parse-select-next");
const parsePreviewExpandBtn = document.querySelector("#btn-parse-preview-expand");
const parseAddSeamBtn = document.querySelector("#btn-parse-add-seam");
const parseDeleteSeamBtn = document.querySelector("#btn-parse-delete-seam");
const parseAcceptSelectedBtn = document.querySelector("#btn-parse-accept-selected");
const parseResetSelectedBtn = document.querySelector("#btn-parse-reset-selected");
const parseFlagSeamBtn = document.querySelector("#btn-parse-flag-seam");
const parseUnflagSeamBtn = document.querySelector("#btn-parse-unflag-seam");
const parseLoadAcceptedBtn = document.querySelector("#btn-parse-load-accepted");
const parseLoadSelectedBtn = document.querySelector("#btn-parse-load-selected");
const parsePreviewCanvas = document.querySelector("#parse-preview-canvas");
const parsePreviewScroll = document.querySelector("#parse-preview-scroll");
const parsePreviewDocument = document.querySelector("#parse-preview-document");
const parsePreviewSurface = document.querySelector("#parse-preview-surface");
const parsePreviewCanvasEmpty = document.querySelector("#parse-preview-canvas-empty");
const parsePreviewHelp = document.querySelector("#parse-preview-help");
const parsePreviewShortcuts = document.querySelector("#parse-preview-shortcuts");
const parsePreviewHotspots = document.querySelector("#parse-preview-hotspots");
const parsePreviewModeBtn = document.querySelector("#btn-parse-preview-mode");
const parseShortcutsBtn = document.querySelector("#btn-parse-shortcuts");
const parseShortcutPanel = document.querySelector("#parse-shortcut-panel");
const parseShortcutsCloseBtn = document.querySelector("#btn-parse-shortcuts-close");
const parsePreviewRotateLeftBtn = document.querySelector("#btn-parse-preview-rotate-left");
const parsePreviewRotateRightBtn = document.querySelector("#btn-parse-preview-rotate-right");
const parsePreviewZoomOutBtn = document.querySelector("#btn-parse-preview-zoom-out");
const parsePreviewZoomResetBtn = document.querySelector("#btn-parse-preview-zoom-reset");
const parsePreviewZoomInBtn = document.querySelector("#btn-parse-preview-zoom-in");
const parseFileStatus = document.querySelector("#parse-file-status");
const parseFileSeamCount = document.querySelector("#parse-file-seam-count");
const parseFileErrorCount = document.querySelector("#parse-file-error-count");
const parseFileCandidateCount = document.querySelector("#parse-file-candidate-count");
const parseFileSource = document.querySelector("#parse-file-source");
const parseFileSeamBody = document.querySelector("#parse-file-seam-body");
const parseFileCandidateBody = document.querySelector("#parse-file-candidate-body");
const parseFileErrorList = document.querySelector("#parse-file-error-list");
const parseHistoryCaption = document.querySelector("#parse-history-caption");
const parseHistoryRefreshBtn = document.querySelector("#btn-parse-history-refresh");
const parseHistoryBody = document.querySelector("#parse-history-body");
const parseHistoryDetailEmpty = document.querySelector("#parse-history-detail-empty");
const parseHistoryDetailContent = document.querySelector("#parse-history-detail-content");
const parseHistoryDetailTitle = document.querySelector("#parse-history-detail-title");
const parseHistoryDetailMeta = document.querySelector("#parse-history-detail-meta");
const parseHistoryDetailPills = document.querySelector("#parse-history-detail-pills");
const parseHistoryFileList = document.querySelector("#parse-history-file-list");
const parseQuickModal = document.querySelector("#parse-quick-modal");
const parseQuickBackdrop = document.querySelector("#parse-quick-backdrop");
const parseQuickTitle = document.querySelector("#parse-quick-title");
const parseQuickMeta = document.querySelector("#parse-quick-meta");
const parseQuickBody = document.querySelector("#parse-quick-body");
const parseQuickCloseBtn = document.querySelector("#btn-parse-quick-close");
const parseQuickCancelBtn = document.querySelector("#btn-parse-quick-cancel");
const parseQuickSaveBtn = document.querySelector("#btn-parse-quick-save");
const seamBody = document.querySelector("#seam-table tbody");
const seamImportInput = document.querySelector("#seam-import-file");
const seamImportPreview = document.querySelector("#seam-import-preview");
const seamImportSummary = document.querySelector("#seam-import-summary");
const seamImportAllowPartial = document.querySelector("#seam-import-allow-partial");
const seamImportPreviewBody = document.querySelector("#seam-import-preview-body");
const seamTemplateBtn = document.querySelector("#btn-seam-template");
const seamImportExportErrorsBtn = document.querySelector("#btn-seam-import-export-errors");
const seamImportApplyBtn = document.querySelector("#btn-seam-import-apply");
const seamImportCancelBtn = document.querySelector("#btn-seam-import-cancel");
const pqrBody = document.querySelector("#pqr-body");
const welderBody = document.querySelector("#welder-body");
const batchBody = document.querySelector("#batch-body");
const altList = document.querySelector("#alt-list");
const inventoryAlertList = document.querySelector("#inventory-alert-list");
const conflictBody = document.querySelector("#conflict-body");
const matchReportBody = document.querySelector("#match-report-body");
const auditLogBody = document.querySelector("#audit-log-body");
const matchDetailTrace = document.querySelector("#match-detail-trace");
const matchDetailEmpty = document.querySelector("#match-detail-empty");
const matchDetailContent = document.querySelector("#match-detail-content");
const matchDetailProject = document.querySelector("#match-detail-project");
const matchDetailStandard = document.querySelector("#match-detail-standard");
const matchDetailDecision = document.querySelector("#match-detail-decision");
const matchDetailRulePackage = document.querySelector("#match-detail-rule-package");
const matchDetailInputCounts = document.querySelector("#match-detail-input-counts");
const matchDetailReviewCounts = document.querySelector("#match-detail-review-counts");
const matchDetailRecommendation = document.querySelector("#match-detail-recommendation");
const matchDetailResults = document.querySelector("#match-detail-results");
const matchDetailRequestJson = document.querySelector("#match-detail-request-json");
const matchDetailResponseJson = document.querySelector("#match-detail-response-json");
const matchDetailAuditList = document.querySelector("#match-detail-audit-list");
const freezeBaselineBtn = document.querySelector("#btn-freeze-baseline");
const exportAuditPackageBtn = document.querySelector("#btn-export-audit-package");
const refreshBaselinesBtn = document.querySelector("#btn-refresh-baselines");
const matchBaselineBody = document.querySelector("#match-baseline-body");
const baselineCompareCaption = document.querySelector("#baseline-compare-caption");
const baselineCompareEmpty = document.querySelector("#baseline-compare-empty");
const baselineCompareContent = document.querySelector("#baseline-compare-content");
const baselineCompareDecision = document.querySelector("#baseline-compare-decision");
const baselineCompareRecommendation = document.querySelector("#baseline-compare-recommendation");
const baselineCompareInputs = document.querySelector("#baseline-compare-inputs");
const baselineCompareResults = document.querySelector("#baseline-compare-results");
const baselineCompareList = document.querySelector("#baseline-compare-list");
const rematchFreezeBaselineBtn = document.querySelector("#btn-rematch-freeze-baseline");
const refreshBaselineImpactBtn = document.querySelector("#btn-refresh-baseline-impact");
const exportReviewChecklistBtn = document.querySelector("#btn-export-review-checklist");
const baselineImpactCaption = document.querySelector("#baseline-impact-caption");
const baselineImpactEmpty = document.querySelector("#baseline-impact-empty");
const baselineImpactContent = document.querySelector("#baseline-impact-content");
const baselineImpactSummary = document.querySelector("#baseline-impact-summary");
const baselineImpactGroups = document.querySelector("#baseline-impact-groups");
const columnFilterPopover = document.querySelector("#column-filter-popover");
const columnFilterTitle = document.querySelector("#column-filter-title");
const columnFilterBody = document.querySelector("#column-filter-body");
const columnFilterResetBtn = document.querySelector("#column-filter-reset");
const columnFilterOkBtn = document.querySelector("#column-filter-ok");
const masterFocusBanner = document.querySelector("#master-focus-banner");
const masterFocusText = document.querySelector("#master-focus-text");
const masterFocusCount = document.querySelector("#master-focus-count");
const masterFocusPrevBtn = document.querySelector("#btn-master-focus-prev");
const masterFocusNextBtn = document.querySelector("#btn-master-focus-next");
const clearMasterFocusBtn = document.querySelector("#btn-clear-master-focus");

const uiState = {
  activeFilterContext: null,
  pendingSeamImportResult: null,
  pendingSeamImportFileName: "",
  locatedRowTimer: 0,
  parseProgressTimer: 0,
  masterFocus: null,
  parseQuickEdit: null
};

function statusTag(text, type) {
  return `<span class="tag ${type}">${text}</span>`;
}

function getSpecialCase(row) {
  const dissimilar = row.matA !== row.matB;
  const thicknessMismatch = Math.abs(Number(row.thkA) - Number(row.thkB)) > THICKNESS_DIFF_THRESHOLD;
  if (dissimilar && thicknessMismatch) return { key: "both", label: "异种+不同厚度", type: "danger" };
  if (dissimilar) return { key: "dissimilar", label: "异种金属", type: "warn" };
  if (thicknessMismatch) return { key: "thickness", label: "不同厚度", type: "warn" };
  return { key: "normal", label: "常规", type: "ok" };
}

function renderSpecialSummary() {
  const count = { dissimilar: 0, thickness: 0, both: 0 };
  appState.seamRows.forEach((row) => {
    const special = getSpecialCase(row).key;
    if (special === "dissimilar") count.dissimilar += 1;
    if (special === "thickness") count.thickness += 1;
    if (special === "both") count.both += 1;
  });
  document.querySelector("#special-dissimilar-count").textContent = String(count.dissimilar);
  document.querySelector("#special-thickness-count").textContent = String(count.thickness);
  document.querySelector("#special-both-count").textContent = String(count.both);
}

function renderSeamTable() {
  seamBody.innerHTML = "";
  const focusIds = getMasterFocusIds("seam");
  const rows = appState.seamRows
    .map((row, idx) => ({ row, idx }))
    .filter((item) => !focusIds || focusIds.has(item.row.id));
  if (!rows.length) {
    seamBody.innerHTML = '<tr><td colspan="11">当前仅看对象条件下没有焊缝数据</td></tr>';
    document.querySelector("#status-seam-count").textContent = String(appState.seamRows.length);
    const pendingCount = appState.seamRows.filter((row) => row.status !== "confirmed").length;
    document.querySelector("#project-pending-count").textContent = `${pendingCount} 条`;
    renderSpecialSummary();
    return;
  }

  rows.forEach(({ row, idx }) => {
    const tr = document.createElement("tr");
    const special = getSpecialCase(row);
    const stateType = row.status === "confirmed" ? "ok" : row.status === "uncertain" ? "danger" : "warn";
    tr.dataset.masterScope = "seam";
    tr.dataset.masterId = row.id;
    tr.innerHTML = `
      <td>${row.id}</td>
      <td contenteditable="true" data-edit="${idx}:matA">${row.matA}</td>
      <td contenteditable="true" data-edit="${idx}:matB">${row.matB}</td>
      <td contenteditable="true" data-edit="${idx}:thkA">${row.thkA}</td>
      <td contenteditable="true" data-edit="${idx}:thkB">${row.thkB}</td>
      <td contenteditable="true" data-edit="${idx}:pos">${row.pos}</td>
      <td>${row.symbol}</td>
      <td>${statusTag(special.label, special.type)}</td>
      <td>${row.conf.toFixed(2)}</td>
      <td>${statusTag(row.status, stateType)}</td>
      <td><button class="ghost" data-seam-delete="${idx}">删除</button></td>
    `;
    seamBody.appendChild(tr);
  });
  document.querySelector("#status-seam-count").textContent = String(appState.seamRows.length);
  const pendingCount = appState.seamRows.filter((row) => row.status !== "confirmed").length;
  document.querySelector("#project-pending-count").textContent = `${pendingCount} 条`;
  renderSpecialSummary();
}

function normalizeSortValue(table, row, col) {
  if (table === "pqr") {
    if (col === "valid") return new Date(row.valid).getTime();
    if (col === "maxDelta") return Number(row.maxDelta) || 0;
    if (col === "dissimilar") return row.dissimilar ? 1 : 0;
    if (col === "thicknessMismatch") return row.thicknessMismatch ? 1 : 0;
    return String(row[col] ?? "").toLowerCase();
  }
  if (table === "welder") {
    if (col === "exp") return new Date(row.exp).getTime();
    if (col === "thicknessDeltaMax") return Number(row.thicknessDeltaMax) || 0;
    if (col === "dissimilarQualified") return row.dissimilarQualified ? 1 : 0;
    if (col === "thicknessMismatchQualified") return row.thicknessMismatchQualified ? 1 : 0;
    return String(row[col] ?? "").toLowerCase();
  }
  return 0;
}

function getFilterStateByTable(table) {
  return table === "pqr" ? appState.pqrFilter : appState.welderFilter;
}

function syncMasterTableHeaderState() {
  document.querySelectorAll(".head-sort-btn").forEach((btn) => {
    const state = getFilterStateByTable(btn.dataset.table);
    const active = state.sortCol === btn.dataset.col;
    btn.classList.toggle("is-active", active);
    btn.textContent = active ? (state.sortDir === "asc" ? "↑" : "↓") : "↕";
  });

  document.querySelectorAll(".head-filter-btn").forEach((btn) => {
    if (btn.dataset.filterType !== "bool") {
      btn.classList.remove("is-active");
      return;
    }
    const state = getFilterStateByTable(btn.dataset.table);
    btn.classList.toggle("is-active", Boolean(state[btn.dataset.filterKey]));
  });
}

function getViewKeyForScope(scope) {
  return scope === "batch" ? "inventory" : scope;
}

function getMasterFocusIds(scope) {
  if (!uiState.masterFocus || uiState.masterFocus.scope !== scope) return null;
  return new Set(uiState.masterFocus.ids || []);
}

function buildMasterFocusLabel(scope, ids) {
  const cleanIds = [...new Set((Array.isArray(ids) ? ids : []).map((value) => String(value || "").trim()).filter(Boolean))];
  const label = formatBaselineImpactScopeLabel(scope);
  if (!cleanIds.length) return `${label}：无有效对象`;
  const preview = cleanIds.slice(0, 3).join("、");
  const suffix = cleanIds.length > 3 ? ` 等 ${cleanIds.length} 项` : "";
  return `仅看${label} ${preview}${suffix}`;
}

function getNormalizedMasterFocusIndex(focus) {
  if (!focus || !Array.isArray(focus.ids) || !focus.ids.length) return 0;
  const index = Number(focus.index) || 0;
  if (index < 0) return 0;
  if (index >= focus.ids.length) return focus.ids.length - 1;
  return index;
}

function syncMasterFocusBanner() {
  if (!masterFocusBanner || !masterFocusText) return;
  const focus = uiState.masterFocus;
  if (!focus || !focus.scope || !Array.isArray(focus.ids) || !focus.ids.length) {
    masterFocusBanner.classList.add("hidden");
    masterFocusText.textContent = "当前未启用仅看对象";
    if (masterFocusCount) masterFocusCount.textContent = "1 / 1";
    if (masterFocusPrevBtn) masterFocusPrevBtn.disabled = true;
    if (masterFocusNextBtn) masterFocusNextBtn.disabled = true;
    return;
  }
  focus.index = getNormalizedMasterFocusIndex(focus);
  masterFocusBanner.classList.remove("hidden");
  masterFocusText.textContent = focus.label || buildMasterFocusLabel(focus.scope, focus.ids);
  if (masterFocusCount) {
    masterFocusCount.textContent = `${focus.index + 1} / ${focus.ids.length}`;
  }
  const disableNav = focus.ids.length <= 1;
  if (masterFocusPrevBtn) masterFocusPrevBtn.disabled = disableNav;
  if (masterFocusNextBtn) masterFocusNextBtn.disabled = disableNav;
}

function clearMasterFocus(silent = false) {
  const focus = uiState.masterFocus;
  if (!focus) return;
  uiState.masterFocus = null;
  syncMasterFocusBanner();
  renderMasterTableByScope(focus.scope);
  if (!silent) {
    addEvent("已恢复全量视图");
  }
}

function focusCurrentMasterFocusItem(silent = false) {
  const focus = uiState.masterFocus;
  if (!focus || !focus.scope || !Array.isArray(focus.ids) || !focus.ids.length) return false;
  focus.ids = focus.ids.filter((itemId) => hasMasterItem(focus.scope, itemId));
  if (!focus.ids.length) {
    clearMasterFocus(true);
    return false;
  }
  focus.index = getNormalizedMasterFocusIndex(focus);
  const currentId = focus.ids[focus.index];
  setView(getViewKeyForScope(focus.scope));
  renderMasterTableByScope(focus.scope);
  syncMasterFocusBanner();
  const located = focusMasterRow(focus.scope, currentId);
  if (!located) return false;
  if (!silent) {
    addEvent(`已切换到${formatBaselineImpactScopeLabel(focus.scope)} ${currentId}（${focus.index + 1}/${focus.ids.length}）`);
  }
  return true;
}

function advanceMasterFocus(step) {
  const focus = uiState.masterFocus;
  if (!focus || !Array.isArray(focus.ids) || focus.ids.length <= 1) return false;
  const total = focus.ids.length;
  focus.index = (getNormalizedMasterFocusIndex(focus) + total + Number(step || 0)) % total;
  return focusCurrentMasterFocusItem();
}

function setMasterFocus(scope, itemIds, label = "") {
  const normalizedScope = normalizeMasterScope(scope);
  const ids = [...new Set((Array.isArray(itemIds) ? itemIds : [itemIds])
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
  if (!normalizedScope || !ids.length) {
    addEvent("仅看对象失败：没有可用的对象编号");
    return false;
  }

  const validIds = ids.filter((itemId) => hasMasterItem(normalizedScope, itemId));
  if (!validIds.length) {
    addEvent(`仅看对象失败：未找到${formatBaselineImpactScopeLabel(normalizedScope)}数据`);
    return false;
  }

  uiState.masterFocus = {
    scope: normalizedScope,
    ids: validIds,
    label: label || buildMasterFocusLabel(normalizedScope, validIds),
    index: 0
  };
  focusCurrentMasterFocusItem(true);
  addEvent(`已切换为${uiState.masterFocus.label}`);
  return true;
}

function compareBySort(table, sortCol, sortDir) {
  return (leftRow, rightRow) => {
    const left = normalizeSortValue(table, leftRow, sortCol);
    const right = normalizeSortValue(table, rightRow, sortCol);
    if (typeof left === "number" && typeof right === "number") {
      return sortDir === "asc" ? left - right : right - left;
    }
    const result = String(left).localeCompare(String(right), "zh-CN");
    return sortDir === "asc" ? result : -result;
  };
}

function getFilteredSortedPqrRows() {
  const { dissimilarOnly, thicknessOnly, sortCol, sortDir } = appState.pqrFilter;
  const filtered = appState.pqrRows.filter((row) => {
    if (dissimilarOnly && !row.dissimilar) return false;
    if (thicknessOnly && !row.thicknessMismatch) return false;
    return true;
  });
  const focusIds = getMasterFocusIds("pqr");
  return [...filtered]
    .filter((row) => !focusIds || focusIds.has(row.id))
    .sort(compareBySort("pqr", sortCol, sortDir));
}

function getFilteredSortedWelderRows() {
  const { dissimilarOnly, thicknessOnly, sortCol, sortDir } = appState.welderFilter;
  const filtered = appState.welderRows.filter((row) => {
    if (dissimilarOnly && !row.dissimilarQualified) return false;
    if (thicknessOnly && !row.thicknessMismatchQualified) return false;
    return true;
  });
  const focusIds = getMasterFocusIds("welder");
  return [...filtered]
    .filter((row) => !focusIds || focusIds.has(row.id))
    .sort(compareBySort("welder", sortCol, sortDir));
}

function renderPqr() {
  const rows = getFilteredSortedPqrRows();
  if (!rows.length) {
    pqrBody.innerHTML = '<tr><td colspan="10">当前仅看对象条件下没有 PQR 数据</td></tr>';
    return;
  }
  pqrBody.innerHTML = rows
    .map((row) => {
      const statusType = row.status === "active" ? "ok" : "warn";
      return `
        <tr data-master-scope="pqr" data-master-id="${row.id}">
          <td>${row.id}</td>
          <td contenteditable="true" data-pqr-edit="${row.id}:standard">${row.standard}</td>
          <td contenteditable="true" data-pqr-edit="${row.id}:process">${row.process}</td>
          <td contenteditable="true" data-pqr-edit="${row.id}:range">${row.range}</td>
          <td contenteditable="true" data-pqr-edit="${row.id}:pos">${row.pos}</td>
          <td><button class="ghost" data-pqr-toggle="${row.id}:dissimilar">${row.dissimilar ? "Yes" : "No"}</button></td>
          <td><button class="ghost" data-pqr-toggle="${row.id}:thicknessMismatch">${row.thicknessMismatch ? "Yes" : "No"}</button></td>
          <td contenteditable="true" data-pqr-edit="${row.id}:maxDelta">${row.maxDelta}</td>
          <td contenteditable="true" data-pqr-edit="${row.id}:valid">${row.valid}</td>
          <td>
            ${statusTag(row.status, statusType)}
            <button class="ghost" data-pqr-toggle="${row.id}:status">Toggle</button>
            <button class="ghost" data-pqr-delete="${row.id}">删除</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderWelder() {
  const rows = getFilteredSortedWelderRows();
  if (!rows.length) {
    welderBody.innerHTML = '<tr><td colspan="10">当前仅看对象条件下没有焊工数据</td></tr>';
    return;
  }
  welderBody.innerHTML = rows
    .map((row) => {
      const statusType = row.status === "active" ? "ok" : "warn";
      return `
        <tr data-master-scope="welder" data-master-id="${row.id}">
          <td>${row.id}</td>
          <td contenteditable="true" data-welder-edit="${row.id}:cert">${row.cert}</td>
          <td contenteditable="true" data-welder-edit="${row.id}:process">${row.process}</td>
          <td contenteditable="true" data-welder-edit="${row.id}:pos">${row.pos}</td>
          <td contenteditable="true" data-welder-edit="${row.id}:group">${row.group}</td>
          <td><button class="ghost" data-welder-toggle="${row.id}:dissimilarQualified">${row.dissimilarQualified ? "Yes" : "No"}</button></td>
          <td><button class="ghost" data-welder-toggle="${row.id}:thicknessMismatchQualified">${row.thicknessMismatchQualified ? "Yes" : "No"}</button></td>
          <td contenteditable="true" data-welder-edit="${row.id}:thicknessDeltaMax">${row.thicknessDeltaMax}</td>
          <td contenteditable="true" data-welder-edit="${row.id}:exp">${row.exp}</td>
          <td>
            ${statusTag(row.status, statusType)}
            <button class="ghost" data-welder-toggle="${row.id}:status">Toggle</button>
            <button class="ghost" data-welder-delete="${row.id}">删除</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function normalizeBatchRow(item) {
  return {
    batch_no: String(item?.batch_no || ""),
    material_code: String(item?.material_code || ""),
    spec_standard: String(item?.spec_standard || ""),
    qty_available: Number(item?.qty_available) || 0,
    safety_stock: Number(item?.safety_stock) || 0,
    expiry_date: String(item?.expiry_date || ""),
    status: String(item?.status || "active")
  };
}

function getNextSequenceId(existingValues, prefix, width = 3) {
  const existing = new Set(existingValues.map((value) => String(value || "").trim()));
  let index = 1;
  while (existing.has(`${prefix}-${String(index).padStart(width, "0")}`)) {
    index += 1;
  }
  return `${prefix}-${String(index).padStart(width, "0")}`;
}

function getNextBatchNo() {
  return getNextSequenceId(
    appState.batchRows.map((row) => row.batch_no),
    "B",
    3
  );
}

function getNextSeamId() {
  return getNextSequenceId(
    appState.seamRows.map((row) => row.id),
    "W",
    3
  );
}

function getNextPqrId() {
  return getNextSequenceId(
    appState.pqrRows.map((row) => row.id),
    "PQR",
    3
  );
}

function getNextWelderId() {
  return getNextSequenceId(
    appState.welderRows.map((row) => row.id),
    "W",
    3
  );
}

function getNextCertNo() {
  return getNextSequenceId(
    appState.welderRows.map((row) => row.cert),
    "CERT",
    4
  );
}

function ensureMasterToolbarButtons(viewKey, prefix, addLabel) {
  const row = document.querySelector(`.view[data-view-panel="${viewKey}"] .toolbar .button-row`);
  if (!row) return { add: null, sync: null, load: null };

  row.innerHTML = `
    <button class="ghost" id="btn-${prefix}-add">${addLabel}</button>
    <button class="primary" id="btn-${prefix}-sync">同步到后端</button>
    <button class="ghost" id="btn-${prefix}-load">从后端加载</button>
  `;

  return {
    add: row.querySelector(`#btn-${prefix}-add`),
    sync: row.querySelector(`#btn-${prefix}-sync`),
    load: row.querySelector(`#btn-${prefix}-load`)
  };
}

function normalizeTextInput(rawValue, allowEmpty = false) {
  const value = String(rawValue || "").trim();
  if (!allowEmpty && !value) {
    return { ok: false, value: "", reason: "empty" };
  }
  return { ok: true, value, reason: "" };
}

function normalizeNumberInput(rawValue, min = 0) {
  const value = Number(String(rawValue || "").trim());
  if (!Number.isFinite(value) || value < min) {
    return { ok: false, value: 0, reason: "number" };
  }
  return { ok: true, value, reason: "" };
}

function normalizeDateInput(rawValue, allowEmpty = true) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return allowEmpty ? { ok: true, value: "", reason: "" } : { ok: false, value: "", reason: "date_empty" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, value: "", reason: "date_format" };
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return { ok: false, value: "", reason: "date_invalid" };
  }
  return { ok: true, value, reason: "" };
}

function normalizeThicknessRangeInput(rawValue) {
  const text = String(rawValue || "").trim();
  const matched = text.match(/^([0-9]+(?:\.[0-9]+)?)\s*-\s*([0-9]+(?:\.[0-9]+)?)$/);
  if (!matched) {
    return { ok: false, value: "", reason: "range_format" };
  }
  const min = Number(matched[1]);
  const max = Number(matched[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 0 || min > max) {
    return { ok: false, value: "", reason: "range_value" };
  }
  const minText = Number.isInteger(min) ? String(min) : String(min);
  const maxText = Number.isInteger(max) ? String(max) : String(max);
  return { ok: true, value: `${minText}-${maxText}`, reason: "" };
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function normalizeCsvHeaderKey(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-（）()]+/g, "");
}

function resolveSeamCsvFieldKey(headerValue) {
  const key = normalizeCsvHeaderKey(headerValue);
  if (!key) return "";
  const aliases = {
    id: ["id", "weldid", "weldseamid", "焊缝id", "焊缝编号", "焊缝"],
    matA: ["mata", "materiala", "materialgroupa", "母材a", "材质a", "母材组a"],
    matB: ["matb", "materialb", "materialgroupb", "母材b", "材质b", "母材组b"],
    thkA: ["thka", "thicknessa", "thicknessamm", "厚度a", "厚度amm"],
    thkB: ["thkb", "thicknessb", "thicknessbmm", "厚度b", "厚度bmm"],
    pos: ["pos", "position", "positioncode", "焊接位置", "位置"],
    symbol: ["symbol", "jointtype", "焊缝符号", "符号", "接头形式"],
    conf: ["conf", "confidence", "置信度"],
    status: ["status", "reviewstatus", "状态", "审核状态"]
  };

  for (const [field, keys] of Object.entries(aliases)) {
    if (keys.includes(key)) return field;
  }
  return "";
}

function normalizeImportedSeamStatus(rawValue) {
  const value = String(rawValue || "").trim().toLowerCase();
  if (!value) return "pending";
  if (["confirmed", "confirm", "已确认", "确认"].includes(value)) return "confirmed";
  if (["changed", "已修改", "修改"].includes(value)) return "changed";
  if (["uncertain", "存疑", "不确定", "待复核"].includes(value)) return "uncertain";
  return "pending";
}

function normalizeImportedSeamConfidence(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return 0.8;
  let parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.8;
  if (parsed > 1 && parsed <= 100) parsed /= 100;
  if (parsed < 0) parsed = 0;
  if (parsed > 1) parsed = 1;
  return parsed;
}

function parseSeamCsvText(content) {
  const lines = String(content || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    throw new Error("CSV内容为空");
  }

  const firstRow = parseCsvLine(lines[0]);
  const headerKeys = firstRow.map((item) => resolveSeamCsvFieldKey(item));
  const hasHeader = headerKeys.some(Boolean);

  let startIndex = 0;
  let fieldOrder = [];
  if (hasHeader) {
    startIndex = 1;
    fieldOrder = headerKeys;
  } else {
    fieldOrder = ["id", "matA", "matB", "thkA", "thkB", "pos", "symbol", "conf", "status"];
  }

  const validRows = [];
  const previewRows = [];
  const idSet = new Set();

  for (let lineIndex = startIndex; lineIndex < lines.length; lineIndex += 1) {
    const lineNo = lineIndex + 1;
    const cells = parseCsvLine(lines[lineIndex]);
    const rowData = {};
    for (let i = 0; i < fieldOrder.length; i += 1) {
      const field = fieldOrder[i];
      if (!field) continue;
      rowData[field] = cells[i] ?? "";
    }

    const row = {
      id: String(rowData.id || "").trim(),
      matA: String(rowData.matA || "").trim(),
      matB: String(rowData.matB || "").trim(),
      thkA: Number(rowData.thkA),
      thkB: Number(rowData.thkB),
      pos: String(rowData.pos || "").trim(),
      symbol: String(rowData.symbol || "").trim() || "BW",
      conf: normalizeImportedSeamConfidence(rowData.conf),
      status: normalizeImportedSeamStatus(rowData.status)
    };

    let error = validateSeamRow(row);
    if (!error && idSet.has(row.id)) {
      error = `焊缝ID重复 (${row.id})`;
    }

    if (!error) {
      idSet.add(row.id);
      validRows.push(row);
    }

    previewRows.push({
      lineNo,
      row,
      error
    });
  }

  if (!previewRows.length) {
    throw new Error("CSV中没有可导入的数据行");
  }

  const invalidRows = previewRows.filter((item) => item.error);
  return {
    hasHeader,
    totalRows: previewRows.length,
    validRows,
    invalidRows,
    previewRows
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function syncSeamImportApplyState() {
  if (!seamImportApplyBtn) return;
  const result = uiState.pendingSeamImportResult;
  if (!result) {
    seamImportApplyBtn.disabled = true;
    seamImportApplyBtn.textContent = "确认导入";
    seamImportApplyBtn.title = "";
    if (seamImportExportErrorsBtn) {
      seamImportExportErrorsBtn.disabled = true;
      seamImportExportErrorsBtn.title = "";
    }
    return;
  }

  const validCount = result.validRows?.length || 0;
  const invalidCount = result.invalidRows?.length || 0;
  const allowPartial = Boolean(seamImportAllowPartial?.checked);
  const canApply = validCount > 0 && (invalidCount === 0 || allowPartial);

  seamImportApplyBtn.disabled = !canApply;
  seamImportApplyBtn.textContent =
    invalidCount > 0 && allowPartial ? `确认导入（${validCount}条通过）` : "确认导入";

  if (validCount === 0) {
    seamImportApplyBtn.title = "没有可导入的通过行";
  } else if (invalidCount > 0 && !allowPartial) {
    seamImportApplyBtn.title = "存在错误行，勾选“仅导入通过行”后可继续";
  } else {
    seamImportApplyBtn.title = "";
  }

  if (seamImportExportErrorsBtn) {
    seamImportExportErrorsBtn.disabled = invalidCount === 0;
    seamImportExportErrorsBtn.title = invalidCount === 0 ? "当前无错误行" : "";
  }
}

function renderSeamImportPreview(result, fileName = "") {
  if (
    !seamImportPreview ||
    !seamImportSummary ||
    !seamImportPreviewBody ||
    !seamImportApplyBtn ||
    !seamImportAllowPartial
  ) {
    return;
  }
  const currentCount = appState.seamRows.length;
  const previewRows = result.previewRows || [];
  const validCount = result.validRows?.length || 0;
  const invalidCount = result.invalidRows?.length || 0;

  seamImportSummary.textContent = `文件 ${fileName || "-"} 已解析：共 ${result.totalRows} 行，成功 ${validCount} 行，失败 ${invalidCount} 行。确认后将覆盖当前 ${currentCount} 条焊缝数据。`;
  seamImportAllowPartial.checked = false;
  seamImportAllowPartial.disabled = invalidCount === 0;

  seamImportPreviewBody.innerHTML = previewRows
    .slice(0, 150)
    .map((item) => {
      const row = item.row;
      const hasError = Boolean(item.error);
      const resultText = hasError ? "失败" : "通过";
      return `
        <tr class="${hasError ? "import-row-error" : "import-row-ok"}">
          <td>${item.lineNo}</td>
          <td>${escapeHtml(row.id)}</td>
          <td>${escapeHtml(row.matA)}</td>
          <td>${escapeHtml(row.matB)}</td>
          <td>${Number(row.thkA).toFixed(1)}</td>
          <td>${Number(row.thkB).toFixed(1)}</td>
          <td>${escapeHtml(row.pos)}</td>
          <td>${escapeHtml(row.symbol)}</td>
          <td>${Number(row.conf).toFixed(2)}</td>
          <td>${escapeHtml(row.status)}</td>
          <td><span class="seam-import-result ${hasError ? "error" : "ok"}">${resultText}</span></td>
          <td class="seam-import-error-text">${escapeHtml(item.error || "-")}</td>
        </tr>
      `;
    })
    .join("");
  syncSeamImportApplyState();
  seamImportPreview.classList.remove("hidden");
}

function clearSeamImportPreview() {
  uiState.pendingSeamImportResult = null;
  uiState.pendingSeamImportFileName = "";
  if (
    !seamImportPreview ||
    !seamImportSummary ||
    !seamImportPreviewBody ||
    !seamImportApplyBtn ||
    !seamImportAllowPartial
  ) {
    return;
  }
  seamImportSummary.textContent = "预览数据将显示在这里";
  seamImportPreviewBody.innerHTML = "";
  seamImportAllowPartial.checked = false;
  seamImportAllowPartial.disabled = false;
  seamImportApplyBtn.textContent = "确认导入";
  seamImportApplyBtn.disabled = true;
  seamImportApplyBtn.title = "";
  if (seamImportExportErrorsBtn) {
    seamImportExportErrorsBtn.disabled = true;
    seamImportExportErrorsBtn.title = "";
  }
  seamImportPreview.classList.add("hidden");
}

function toCsvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function downloadSeamCsvTemplate() {
  const lines = [
    "id,matA,matB,thkA,thkB,pos,symbol,conf,status",
    "W-001,P-No.1,P-No.1,16,16,2G,BW,0.92,confirmed",
    "W-002,P-No.1,P-No.8,38,25,5G,BW,0.65,pending"
  ];
  const blob = new Blob(["\uFEFF", lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "seam_import_template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadSeamImportErrorRows(result, sourceFileName = "") {
  const invalidItems = (result?.previewRows || []).filter((item) => item.error);
  if (!invalidItems.length) return 0;

  const header = [
    "line_no",
    "id",
    "matA",
    "matB",
    "thkA",
    "thkB",
    "pos",
    "symbol",
    "conf",
    "status",
    "error"
  ];

  const lines = [header.join(",")];
  for (const item of invalidItems) {
    const row = item.row || {};
    const values = [
      item.lineNo,
      row.id,
      row.matA,
      row.matB,
      Number.isFinite(row.thkA) ? row.thkA : "",
      Number.isFinite(row.thkB) ? row.thkB : "",
      row.pos,
      row.symbol,
      Number.isFinite(row.conf) ? row.conf : "",
      row.status,
      item.error || ""
    ];
    lines.push(values.map((value) => toCsvCell(value)).join(","));
  }

  const stem = String(sourceFileName || "seam_import")
    .replace(/\.csv$/i, "")
    .trim();
  const filename = `${stem || "seam_import"}_errors.csv`;
  const blob = new Blob(["\uFEFF", lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return invalidItems.length;
}

function syncMasterToolbarState() {
  const set = (syncSelector, loadSelector, dirty) => {
    const syncBtn = document.querySelector(syncSelector);
    if (syncBtn) syncBtn.textContent = dirty ? "同步到后端 *" : "同步到后端";
    const loadBtn = document.querySelector(loadSelector);
    if (loadBtn) loadBtn.textContent = dirty ? "从后端加载（覆盖本地）" : "从后端加载";
  };
  set("#btn-seam-sync", "#btn-seam-load", appState.masterDirty.seam);
  set("#btn-pqr-sync", "#btn-pqr-load", appState.masterDirty.pqr);
  set("#btn-welder-sync", "#btn-welder-load", appState.masterDirty.welder);
  set("#btn-batch-sync", "#btn-batch-load", appState.masterDirty.batch);
}

function refreshLocalBaselineReviewState() {
  if (typeof window.__TAURI_INTERNALS__?.invoke === "function") return;
  const reasons = [];
  if (appState.masterDirty.seam) reasons.push("焊缝主数据有本地未同步变更");
  if (appState.masterDirty.pqr) reasons.push("PQR 有本地未同步变更");
  if (appState.masterDirty.welder) reasons.push("焊工资格有本地未同步变更");
  if (appState.masterDirty.batch) reasons.push("库存批次有本地未同步变更");
  const reviewStatus = reasons.length ? "needs_review" : "ok";
  const latestChangeAt = reasons.length ? Math.floor(Date.now() / 1000) : 0;
  const changeCounts = {
    seam: appState.masterDirty.seam ? appState.seamRows.length : 0,
    pqr: appState.masterDirty.pqr ? appState.pqrRows.length : 0,
    welder: appState.masterDirty.welder ? appState.welderRows.length : 0,
    batch: appState.masterDirty.batch ? appState.batchRows.length : 0
  };
  appState.matchBaselines = appState.matchBaselines.map((item) => ({
    ...item,
    reviewStatus,
    reviewReasons: reasons,
    latestChangeAt,
    changeCounts
  }));
  renderMatchBaselines();
}

function setMasterDirty(scope, dirty = true) {
  if (!Object.prototype.hasOwnProperty.call(appState.masterDirty, scope)) return;
  appState.masterDirty[scope] = Boolean(dirty);
  syncMasterToolbarState();
  refreshLocalBaselineReviewState();
  void refreshBaselineComparisonForSelectedTrace();
  void refreshBaselineImpactForSelectedTrace();
}

function validateSeamRow(row) {
  if (!normalizeTextInput(row.id).ok) return "焊缝ID不能为空";
  if (!normalizeTextInput(row.matA).ok) return `焊缝 ${row.id}: 母材A不能为空`;
  if (!normalizeTextInput(row.matB).ok) return `焊缝 ${row.id}: 母材B不能为空`;
  if (!normalizeNumberInput(row.thkA, 0.01).ok) return `焊缝 ${row.id}: 厚度A必须大于0`;
  if (!normalizeNumberInput(row.thkB, 0.01).ok) return `焊缝 ${row.id}: 厚度B必须大于0`;
  if (!normalizeTextInput(row.pos).ok) return `焊缝 ${row.id}: 位置不能为空`;
  return "";
}

function validatePqrRow(row) {
  const standard = normalizeTextInput(String(row.standard || "").toUpperCase().replace(/\s+/g, "_"));
  if (!standard.ok || (standard.value !== "ASME_IX" && standard.value !== "CN_GB")) {
    return `PQR ${row.id}: 标准只能是 ASME_IX 或 CN_GB`;
  }
  if (!normalizeTextInput(row.process).ok) return `PQR ${row.id}: 焊接工艺不能为空`;
  if (!normalizeTextInput(row.pos).ok) return `PQR ${row.id}: 位置不能为空`;
  if (!normalizeThicknessRangeInput(row.range).ok) return `PQR ${row.id}: 厚度范围格式应为 min-max`;
  if (!normalizeNumberInput(row.maxDelta, 0).ok) return `PQR ${row.id}: 最大厚度差必须 >= 0`;
  if (!normalizeDateInput(row.valid, true).ok) return `PQR ${row.id}: 有效期格式应为 YYYY-MM-DD`;
  return "";
}

function validateWelderRow(row) {
  if (!normalizeTextInput(row.cert).ok) return `焊工 ${row.id}: 证书号不能为空`;
  if (!normalizeTextInput(row.process).ok) return `焊工 ${row.id}: 焊接工艺不能为空`;
  if (!normalizeTextInput(row.pos).ok) return `焊工 ${row.id}: 位置不能为空`;
  if (!normalizeTextInput(row.group).ok) return `焊工 ${row.id}: 材料组不能为空`;
  if (!normalizeNumberInput(row.thicknessDeltaMax, 0).ok) return `焊工 ${row.id}: 最大厚度差必须 >= 0`;
  if (!normalizeDateInput(row.exp, true).ok) return `焊工 ${row.id}: 到期日期格式应为 YYYY-MM-DD`;
  return "";
}

function validateBatchRow(row) {
  if (!normalizeTextInput(row.batch_no).ok) return "批次号不能为空";
  if (!normalizeTextInput(row.material_code).ok) return `批次 ${row.batch_no}: 焊材编码不能为空`;
  if (!normalizeTextInput(row.spec_standard).ok) return `批次 ${row.batch_no}: 规格标准不能为空`;
  if (!normalizeNumberInput(row.qty_available, 0).ok) return `批次 ${row.batch_no}: 可用数量必须 >= 0`;
  if (!normalizeNumberInput(row.safety_stock, 0).ok) return `批次 ${row.batch_no}: 安全库存必须 >= 0`;
  if (!normalizeDateInput(row.expiry_date, true).ok) return `批次 ${row.batch_no}: 到期日期格式应为 YYYY-MM-DD`;
  return "";
}

function ensureMasterRowsValid(scope) {
  const rows =
    scope === "seam"
      ? appState.seamRows
      : scope === "pqr"
        ? appState.pqrRows
        : scope === "welder"
          ? appState.welderRows
          : scope === "batch"
            ? appState.batchRows
            : [];
  const validate =
    scope === "seam"
      ? validateSeamRow
      : scope === "pqr"
        ? validatePqrRow
        : scope === "welder"
          ? validateWelderRow
          : validateBatchRow;
  for (const row of rows) {
    const error = validate(row);
    if (error) {
      addEvent(error);
      return false;
    }
  }
  return true;
}

function ensureAllMasterRowsValid() {
  return (
    ensureMasterRowsValid("seam") &&
    ensureMasterRowsValid("pqr") &&
    ensureMasterRowsValid("welder") &&
    ensureMasterRowsValid("batch")
  );
}

function renderBatch() {
  if (!batchBody) return;
  const focusIds = getMasterFocusIds("batch");
  const rows = appState.batchRows.filter((row) => !focusIds || focusIds.has(row.batch_no));
  if (!rows.length) {
    batchBody.innerHTML = '<tr><td colspan="8">当前仅看对象条件下没有库存批次数据</td></tr>';
    return;
  }
  batchBody.innerHTML = rows
    .map((row, idx) => {
      const statusType = row.status === "active" ? "ok" : "warn";
      const sourceIdx = appState.batchRows.findIndex((item) => item.batch_no === row.batch_no);
      return `
        <tr data-master-scope="batch" data-master-id="${row.batch_no}">
          <td>${row.batch_no}</td>
          <td contenteditable="true" data-batch-edit="${sourceIdx}:material_code">${row.material_code}</td>
          <td contenteditable="true" data-batch-edit="${sourceIdx}:spec_standard">${row.spec_standard}</td>
          <td contenteditable="true" data-batch-edit="${sourceIdx}:qty_available">${Number(row.qty_available).toFixed(1)}</td>
          <td contenteditable="true" data-batch-edit="${sourceIdx}:safety_stock">${Number(row.safety_stock).toFixed(1)}</td>
          <td contenteditable="true" data-batch-edit="${sourceIdx}:expiry_date">${row.expiry_date}</td>
          <td>${statusTag(row.status, statusType)}</td>
          <td><button class="ghost" data-batch-delete="${sourceIdx}">删除</button></td>
        </tr>
      `;
    })
    .join("");
}

function renderAlternatives() {
  altList.innerHTML = appState.alternatives
    .map((item, idx) => `<li>#${idx + 1} ${item.pqr} + ${item.welder} <strong>${item.score.toFixed(2)}</strong></li>`)
    .join("");
}

function renderInventoryAlerts() {
  if (!inventoryAlertList) return;
  if (!appState.inventoryAlerts.length) {
    inventoryAlertList.innerHTML = `<li><span>暂无库存告警</span>${statusTag("ok", "ok")}</li>`;
    return;
  }
  inventoryAlertList.innerHTML = appState.inventoryAlerts
    .map((item) => {
      const severity = String(item.severity || "warning").toLowerCase();
      const cls = severity === "error" ? "danger" : severity === "info" ? "ok" : "warn";
      const batchNo = item.batchNo || "-";
      return `<li><span>${item.materialCode} / ${batchNo} 需求 ${item.requiredQty.toFixed(1)}，可用 ${item.availableQty.toFixed(1)}</span>${statusTag(
        severity,
        cls
      )}</li>`;
    })
    .join("");
}

function renderConflicts(severity = "all") {
  const rows = severity === "all" ? appState.conflicts : appState.conflicts.filter((item) => item.severity === severity);
  conflictBody.innerHTML = rows
    .map((item) => {
      const cls = item.severity === "error" ? "danger" : "warn";
      return `
        <tr>
          <td>${item.entity}</td>
          <td>${item.field}</td>
          <td>${item.actual}</td>
          <td>${item.expected}</td>
          <td>${item.clause}</td>
          <td>${statusTag(item.severity, cls)}</td>
        </tr>
      `;
    })
    .join("");
}

function formatCreatedAt(timestamp) {
  const value = Number(timestamp) || 0;
  if (!value) return "-";
  return new Date(value * 1000).toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function parseJsonSafely(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function formatCodeLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "-";
  return text.replace(/_/g, " ").toUpperCase();
}

function formatJsonBlock(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string") {
    const parsed = parseJsonSafely(value);
    if (parsed !== null) {
      return JSON.stringify(parsed, null, 2);
    }
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function sanitizeFilenameSegment(value) {
  return String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "audit";
}

function triggerDownload(content, filename, type = "application/json;charset=utf-8;") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function isSelectedTraceFrozen() {
  const traceId = String(appState.selectedMatchTraceId || "").trim();
  return !!traceId && appState.matchBaselines.some((item) => item.traceId === traceId);
}

function syncFreezeBaselineButtonState() {
  if (!freezeBaselineBtn) return;
  const traceId = String(appState.selectedMatchTraceId || "").trim();
  if (!traceId) {
    freezeBaselineBtn.disabled = true;
    freezeBaselineBtn.textContent = "冻结为基线";
    return;
  }
  if (isSelectedTraceFrozen()) {
    freezeBaselineBtn.disabled = true;
    freezeBaselineBtn.textContent = "已冻结为基线";
    return;
  }
  freezeBaselineBtn.disabled = false;
  freezeBaselineBtn.textContent = "冻结为基线";
}

function syncRematchFreezeButtonState() {
  if (!rematchFreezeBaselineBtn) return;
  const traceId = String(appState.selectedMatchTraceId || "").trim();
  const hasBackend = typeof window.__TAURI_INTERNALS__?.invoke === "function";
  rematchFreezeBaselineBtn.disabled = !traceId || !hasBackend;
  rematchFreezeBaselineBtn.textContent = hasBackend ? "重新匹配并冻结新基线" : "桌面端可用";
}

function syncExportReviewChecklistButtonState() {
  if (!exportReviewChecklistBtn) return;
  const hasImpact = Boolean(appState.baselineImpact);
  exportReviewChecklistBtn.disabled = !hasImpact;
  exportReviewChecklistBtn.textContent = "导出复核清单";
  exportReviewChecklistBtn.title = hasImpact ? "" : "请先选择需要分析的基线";
}

function collectReviewStatusCounts(seams) {
  const counts = {
    confirmed: 0,
    changed: 0,
    pending: 0,
    uncertain: 0
  };
  (Array.isArray(seams) ? seams : []).forEach((item) => {
    const status = String(item?.review_status || "").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(counts, status)) {
      counts[status] += 1;
    }
  });
  return counts;
}

function syncSelectedMatchTrace() {
  const traceIds = appState.matchReports.map((item) => item.traceId).filter(Boolean);
  if (traceIds.includes(appState.selectedMatchTraceId)) return;
  appState.selectedMatchTraceId = traceIds[0] || "";
}

function getLatestComparableBaseline(traceId) {
  const current = String(traceId || "").trim();
  return appState.matchBaselines.find((item) => item.traceId && item.traceId !== current) || null;
}

function getBaselineImpactTarget(traceId) {
  const current = String(traceId || "").trim();
  if (!current) return null;
  return appState.matchBaselines.find((item) => item.traceId === current) || getLatestComparableBaseline(current);
}

function setSelectedMatchTrace(traceId) {
  appState.selectedMatchTraceId = String(traceId || "");
  renderMatchReports();
  renderAuditLogs();
  renderMatchBaselines();
  renderSelectedMatchDetail();
  syncFreezeBaselineButtonState();
  syncRematchFreezeButtonState();
  void refreshBaselineComparisonForSelectedTrace();
  void refreshBaselineImpactForSelectedTrace();
}

function getBundleInputCounts(bundle) {
  const request = bundle?.request || {};
  const auditPayload = Array.isArray(bundle?.audit_logs) ? bundle.audit_logs[0]?.payload || {} : {};
  return auditPayload.input_counts || {
    weld_seams: Array.isArray(request.weld_seams) ? request.weld_seams.length : 0,
    pqr_candidates: Array.isArray(request.pqr_candidates) ? request.pqr_candidates.length : 0,
    welder_candidates: Array.isArray(request.welder_candidates) ? request.welder_candidates.length : 0,
    required_consumables: Array.isArray(request.required_consumables) ? request.required_consumables.length : 0,
    consumable_batches: Array.isArray(request.consumable_batches) ? request.consumable_batches.length : 0
  };
}

function getBundleReviewCounts(bundle) {
  const request = bundle?.request || {};
  const auditPayload = Array.isArray(bundle?.audit_logs) ? bundle.audit_logs[0]?.payload || {} : {};
  return auditPayload.review_status_counts || collectReviewStatusCounts(request.weld_seams);
}

function getBundleRecommendationLabel(bundle) {
  const recommended = bundle?.response?.recommended || bundle?.summary?.recommended || null;
  return getRecommendationLabel(recommended);
}

function getRecommendationLabel(recommended) {
  return recommended ? `${recommended.pqr_id || "-"} + ${recommended.welder_id || "-"}` : "无推荐组合";
}

function getBundleResultSummary(bundle) {
  const response = bundle?.response || {};
  const summary = bundle?.summary || {};
  const alternativeCount = summary.alternative_count ?? (Array.isArray(response.alternatives) ? response.alternatives.length : 0);
  const hardConflictCount = summary.hard_conflict_count ?? (Array.isArray(response.hard_conflicts) ? response.hard_conflicts.length : 0);
  const inventoryAlertCount = summary.inventory_alert_count ?? (Array.isArray(response.inventory_alerts) ? response.inventory_alerts.length : 0);
  return {
    alternativeCount,
    hardConflictCount,
    inventoryAlertCount
  };
}

function buildDiffLine(label, baselineValue, currentValue) {
  return `${label}: ${baselineValue} -> ${currentValue}`;
}

function renderBaselineComparison() {
  if (!baselineCompareCaption || !baselineCompareEmpty || !baselineCompareContent) return;
  const comparison = appState.baselineComparison;
  if (!comparison) {
    baselineCompareCaption.textContent = "当前未生成对比结果";
    baselineCompareEmpty.classList.remove("hidden");
    baselineCompareContent.classList.add("hidden");
    if (baselineCompareList) baselineCompareList.innerHTML = "";
    return;
  }

  if (!comparison.baselineTraceId) {
    baselineCompareCaption.textContent = comparison.baselineLabel || "暂无可对比基线";
    baselineCompareEmpty.textContent = "选中其他匹配记录，或先冻结一条新的项目基线后再比较。";
    baselineCompareEmpty.classList.remove("hidden");
    baselineCompareContent.classList.add("hidden");
    if (baselineCompareList) baselineCompareList.innerHTML = "";
    return;
  }

  baselineCompareCaption.textContent = `当前 ${comparison.currentTraceId} 对比基线 ${comparison.baselineLabel}`;
  baselineCompareEmpty.classList.add("hidden");
  baselineCompareContent.classList.remove("hidden");
  baselineCompareDecision.textContent = buildDiffLine("决策", comparison.baselineDecision, comparison.currentDecision);
  baselineCompareRecommendation.textContent = buildDiffLine(
    "推荐",
    comparison.baselineRecommendation,
    comparison.currentRecommendation
  );
  baselineCompareInputs.textContent = buildDiffLine("输入", comparison.baselineInputs, comparison.currentInputs);
  baselineCompareResults.textContent = buildDiffLine("结果", comparison.baselineResults, comparison.currentResults);

  if (!baselineCompareList) return;
  if (!comparison.changes.length) {
    baselineCompareList.innerHTML = "<li><span>差异</span><strong>当前记录与最近基线一致</strong></li>";
    return;
  }
  baselineCompareList.innerHTML = comparison.changes
    .map((item) => `<li><span>${item.label}</span><strong>${item.detail}</strong></li>`)
    .join("");
}

function formatBaselineImpactScopeLabel(scope) {
  const normalized = String(scope || "").toLowerCase();
  if (normalized === "seam") return "焊缝";
  if (normalized === "pqr") return "PQR";
  if (normalized === "welder") return "焊工";
  if (normalized === "batch") return "库存批次";
  return "主数据";
}

function getBaselineImpactScopeTagType(scope) {
  const normalized = String(scope || "").toLowerCase();
  if (normalized === "seam") return "danger";
  if (normalized === "pqr" || normalized === "welder") return "warn";
  return "info";
}

function normalizeMasterScope(scope) {
  const normalized = String(scope || "").trim().toLowerCase();
  return ["seam", "pqr", "welder", "batch"].includes(normalized) ? normalized : "";
}

function hasMasterItem(scope, itemId) {
  const normalizedScope = normalizeMasterScope(scope);
  const normalizedId = String(itemId || "").trim();
  if (!normalizedScope || !normalizedId) return false;
  if (normalizedScope === "seam") return appState.seamRows.some((row) => row.id === normalizedId);
  if (normalizedScope === "pqr") return appState.pqrRows.some((row) => row.id === normalizedId);
  if (normalizedScope === "welder") return appState.welderRows.some((row) => row.id === normalizedId);
  if (normalizedScope === "batch") return appState.batchRows.some((row) => row.batch_no === normalizedId);
  return false;
}

function resetMasterFiltersForLocate(scope) {
  if (scope === "pqr") {
    appState.pqrFilter.dissimilarOnly = false;
    appState.pqrFilter.thicknessOnly = false;
    renderPqr();
    syncMasterTableHeaderState();
  } else if (scope === "welder") {
    appState.welderFilter.dissimilarOnly = false;
    appState.welderFilter.thicknessOnly = false;
    renderWelder();
    syncMasterTableHeaderState();
  }
}

function renderMasterTableByScope(scope) {
  if (scope === "seam") renderSeamTable();
  if (scope === "pqr") renderPqr();
  if (scope === "welder") renderWelder();
  if (scope === "batch") renderBatch();
}

function escapeSelectorValue(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(String(value || ""));
  }
  return String(value || "").replace(/["\\]/g, "\\$&");
}

function clearLocatedMasterRow() {
  document.querySelectorAll(".is-located-row").forEach((row) => row.classList.remove("is-located-row"));
  if (uiState.locatedRowTimer) {
    window.clearTimeout(uiState.locatedRowTimer);
    uiState.locatedRowTimer = 0;
  }
}

function focusMasterRow(scope, itemId) {
  const selector = `[data-master-scope="${escapeSelectorValue(scope)}"][data-master-id="${escapeSelectorValue(itemId)}"]`;
  const row = document.querySelector(selector);
  if (!row) return false;
  clearLocatedMasterRow();
  row.classList.add("is-located-row");
  row.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  uiState.locatedRowTimer = window.setTimeout(() => {
    row.classList.remove("is-located-row");
    uiState.locatedRowTimer = 0;
  }, 3200);
  return true;
}

function getLocateButtonsForImpactItem(item, fallbackScope = "") {
  const buttons = [];
  const itemScope = normalizeMasterScope(item.scope || fallbackScope);
  const itemId = String(item.item_id || "").trim();
  if (itemScope && itemId) {
    buttons.push({
      scope: itemScope,
      itemId,
      label: `定位${formatBaselineImpactScopeLabel(itemScope)}`
    });
  }

  const seamIds = [...new Set((Array.isArray(item.affected_seam_ids) ? item.affected_seam_ids : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean))]
    .slice(0, 3);
  seamIds.forEach((seamId) => {
    buttons.push({
      scope: "seam",
      itemId: seamId,
      label: `定位焊缝 ${seamId}`
    });
  });
  return buttons;
}

function getFocusButtonsForImpactItem(item, fallbackScope = "") {
  const buttons = [];
  const itemScope = normalizeMasterScope(item.scope || fallbackScope);
  const itemId = String(item.item_id || "").trim();
  if (itemScope && itemId && hasMasterItem(itemScope, itemId)) {
    buttons.push({
      scope: itemScope,
      ids: [itemId],
      label: `只看此${formatBaselineImpactScopeLabel(itemScope)}`,
      focusLabel: `仅看${formatBaselineImpactScopeLabel(itemScope)} ${itemId}`
    });
  }

  const seamIds = [...new Set((Array.isArray(item.affected_seam_ids) ? item.affected_seam_ids : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
  if (seamIds.length) {
    buttons.push({
      scope: "seam",
      ids: seamIds,
      label: seamIds.length > 1 ? `只看相关焊缝（${seamIds.length}）` : `只看相关焊缝 ${seamIds[0]}`,
      focusLabel: buildMasterFocusLabel("seam", seamIds)
    });
  }
  return buttons;
}

function locateMasterItem(scope, itemId) {
  const normalizedScope = normalizeMasterScope(scope);
  const normalizedId = String(itemId || "").trim();
  if (!normalizedScope || !normalizedId) {
    addEvent("定位失败：缺少对象范围或对象编号");
    return false;
  }
  if (!hasMasterItem(normalizedScope, normalizedId)) {
    addEvent(`定位失败：未找到${formatBaselineImpactScopeLabel(normalizedScope)} ${normalizedId}`);
    return false;
  }

  if (uiState.masterFocus && uiState.masterFocus.scope === normalizedScope && !uiState.masterFocus.ids.includes(normalizedId)) {
    clearMasterFocus(true);
  } else if (uiState.masterFocus && uiState.masterFocus.scope === normalizedScope) {
    uiState.masterFocus.index = Math.max(0, uiState.masterFocus.ids.indexOf(normalizedId));
    syncMasterFocusBanner();
  }

  setView(getViewKeyForScope(normalizedScope));
  renderMasterTableByScope(normalizedScope);

  if (!focusMasterRow(normalizedScope, normalizedId)) {
    resetMasterFiltersForLocate(normalizedScope);
  }

  const located = focusMasterRow(normalizedScope, normalizedId);
  if (!located) {
    addEvent(`定位失败：${formatBaselineImpactScopeLabel(normalizedScope)} ${normalizedId} 当前未显示`);
    return false;
  }

  addEvent(`已定位到${formatBaselineImpactScopeLabel(normalizedScope)} ${normalizedId}`);
  return true;
}

function normalizeReviewActionScopes(scopes) {
  const values = Array.isArray(scopes) ? scopes : [];
  return [...new Set(values.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))];
}

function buildReviewChecklistRows(impact) {
  if (!impact) return [];

  const baselineTraceId = String(impact.trace_id || "");
  const baselineLabel = String(impact.baseline_label || baselineTraceId || "");
  const compareTraceId = String(impact.compare_trace_id || "");
  const reviewStatus = String(impact.review_status || "");
  const reviewReasons = Array.isArray(impact.review_reasons) ? impact.review_reasons.join("；") : "";
  const baselineRecommendation = getRecommendationLabel(impact.baseline_recommended || impact.summary?.recommended || null);
  const compareRecommendation = getRecommendationLabel(impact.compare_recommended || null);
  const recommendationShift = String(impact.recommendation_shift || "");
  const baselineCreatedAt = formatCreatedAt(impact.created_at);
  const latestChangeAt = formatCreatedAt(impact.latest_change_at);
  const changesByScope = impact.changes_by_scope || {};
  const actions = Array.isArray(impact.review_actions) && impact.review_actions.length
    ? impact.review_actions
    : [{
      code: "no_action",
      title: "当前无额外处理动作",
      detail: reviewReasons || "当前基线未检测到需要额外处理的变更。",
      priority: "low",
      scopes: []
    }];

  const rows = [];
  for (const action of actions) {
    const actionScopes = normalizeReviewActionScopes(action.scopes);
    const scopeList = actionScopes.length ? actionScopes : [""];
    for (const scope of scopeList) {
      const relatedItems = scope && Array.isArray(changesByScope[scope]) ? changesByScope[scope] : [];
      if (relatedItems.length) {
        for (const item of relatedItems) {
          rows.push({
            baseline_trace_id: baselineTraceId,
            baseline_label: baselineLabel,
            compare_trace_id: compareTraceId,
            review_status: reviewStatus,
            review_reasons: reviewReasons,
            action_priority: String(action.priority || "low"),
            action_code: String(action.code || ""),
            action_title: String(action.title || ""),
            action_detail: String(action.detail || ""),
            action_scope: formatBaselineImpactScopeLabel(scope),
            item_scope: formatBaselineImpactScopeLabel(item.scope || scope),
            item_id: String(item.item_id || ""),
            item_summary: String(item.summary || ""),
            impact_detail: String(item.impact_detail || item.impact_hint || ""),
            recommendation_relation: String(item.recommendation_relation || ""),
            affects_baseline_recommended: item.affects_recommended_candidate ? "是" : "否",
            affects_current_recommended: item.affects_compare_recommended_candidate ? "是" : "否",
            affected_seam_ids: Array.isArray(item.affected_seam_ids) ? item.affected_seam_ids.join(" / ") : "",
            affected_material_codes: Array.isArray(item.affected_material_codes) ? item.affected_material_codes.join(" / ") : "",
            baseline_recommendation: baselineRecommendation,
            current_recommendation: compareRecommendation,
            recommendation_shift: recommendationShift,
            item_updated_at: formatCreatedAt(item.updated_at),
            baseline_created_at: baselineCreatedAt,
            latest_change_at: latestChangeAt
          });
        }
        continue;
      }

      rows.push({
        baseline_trace_id: baselineTraceId,
        baseline_label: baselineLabel,
        compare_trace_id: compareTraceId,
        review_status: reviewStatus,
        review_reasons: reviewReasons,
        action_priority: String(action.priority || "low"),
        action_code: String(action.code || ""),
        action_title: String(action.title || ""),
        action_detail: String(action.detail || ""),
        action_scope: formatBaselineImpactScopeLabel(scope),
        item_scope: formatBaselineImpactScopeLabel(scope),
        item_id: "",
        item_summary: "",
        impact_detail: "",
        recommendation_relation: "",
        affects_baseline_recommended: "否",
        affects_current_recommended: "否",
        affected_seam_ids: "",
        affected_material_codes: "",
        baseline_recommendation: baselineRecommendation,
        current_recommendation: compareRecommendation,
        recommendation_shift: recommendationShift,
        item_updated_at: "",
        baseline_created_at: baselineCreatedAt,
        latest_change_at: latestChangeAt
      });
    }
  }

  return rows;
}

function exportBaselineReviewChecklist() {
  const impact = appState.baselineImpact;
  if (!impact) return null;

  const rows = buildReviewChecklistRows(impact);
  if (!rows.length) return null;

  const header = [
    "baseline_trace_id",
    "baseline_label",
    "compare_trace_id",
    "review_status",
    "review_reasons",
    "action_priority",
    "action_code",
    "action_title",
    "action_detail",
    "action_scope",
    "item_scope",
    "item_id",
    "item_summary",
    "impact_detail",
    "recommendation_relation",
    "affects_baseline_recommended",
    "affects_current_recommended",
    "affected_seam_ids",
    "affected_material_codes",
    "baseline_recommendation",
    "current_recommendation",
    "recommendation_shift",
    "item_updated_at",
    "baseline_created_at",
    "latest_change_at"
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(header.map((key) => toCsvCell(row[key])).join(","));
  }

  const baselineStem = sanitizeFilenameSegment(impact.baseline_label || impact.trace_id || "baseline_review");
  const compareStem = impact.compare_trace_id ? `_vs_${sanitizeFilenameSegment(impact.compare_trace_id)}` : "";
  const filename = `review_checklist_${baselineStem}${compareStem}.csv`;
  triggerDownload(`\uFEFF${lines.join("\n")}`, filename, "text/csv;charset=utf-8;");
  return {
    filename,
    rowCount: rows.length
  };
}

function localImpactItemMatchesRecommendation(item, recommended) {
  if (!recommended) return false;
  if (item.scope === "pqr") return item.item_id === recommended.pqr_id;
  if (item.scope === "welder") return item.item_id === recommended.welder_id;
  if (item.scope === "batch") {
    return Array.isArray(recommended.consumable_batch_ids) && recommended.consumable_batch_ids.includes(item.item_id);
  }
  return false;
}

function buildLocalBaselineReviewActions(
  baselineDecision,
  compareDecision,
  baselineRecommended,
  compareRecommended,
  changesByScope,
  changeCounts,
  recommendationShift
) {
  const actions = [];
  const payloadItems = Object.values(changesByScope).flat();
  const recommendedHitCount = payloadItems.filter((item) => item.affects_recommended_candidate).length;
  const hasCompare = Boolean(compareDecision);

  if (changeCounts.seam > 0) {
    actions.push({
      code: "recheck_input",
      title: "复核焊缝输入并重新匹配",
      detail: `焊缝主数据更新 ${changeCounts.seam} 条，建议先确认焊缝输入，再重新执行匹配。`,
      priority: "high",
      scopes: ["seam"]
    });
  }

  if (changeCounts.pqr > 0 || changeCounts.welder > 0) {
    actions.push({
      code: "review_qualification",
      title: compareDecision === "fail" ? "补充或更新 PQR/焊工资格" : "复核 PQR/焊工资格覆盖范围",
      detail: compareDecision === "fail"
        ? `当前结果已降为 fail，建议优先补充资格主数据。PQR 变更 ${changeCounts.pqr} 条，焊工资格变更 ${changeCounts.welder} 条。`
        : `PQR 变更 ${changeCounts.pqr} 条，焊工资格变更 ${changeCounts.welder} 条，建议复核候选覆盖范围后再确认推荐。`,
      priority: compareDecision === "fail" ? "high" : "medium",
      scopes: ["pqr", "welder"]
    });
  }

  if (changeCounts.batch > 0) {
    actions.push({
      code: "review_inventory",
      title: compareDecision === "fail" || compareDecision === "partial" ? "补料或调整库存策略" : "复核库存批次可用性",
      detail: compareDecision === "fail" || compareDecision === "partial"
        ? `库存批次变更 ${changeCounts.batch} 条，当前结果受库存影响，建议补料或调整库存策略。`
        : `库存批次变更 ${changeCounts.batch} 条，建议复核批次可用量和安全库存设置。`,
      priority: compareDecision === "fail" || compareDecision === "partial" ? "high" : "medium",
      scopes: ["batch"]
    });
  }

  if ((hasCompare && getRecommendationLabel(baselineRecommended) !== getRecommendationLabel(compareRecommended)) || recommendedHitCount > 0) {
    actions.push({
      code: "freeze_new_baseline",
      title: "确认当前推荐并冻结新基线",
      detail: recommendationShift || `有 ${recommendedHitCount} 条变更命中原推荐组合，建议确认当前推荐后冻结新基线。`,
      priority: compareDecision === "match" || compareDecision === "partial" ? "medium" : "high",
      scopes: ["pqr", "welder", "batch"]
    });
  }

  if (!actions.length) {
    actions.push({
      code: "no_action",
      title: "当前无需额外处理",
      detail: `基线决策为 ${baselineDecision || "-"}，当前未检测到会影响结果的主数据变更。`,
      priority: "low",
      scopes: []
    });
  }

  return actions;
}

function getReviewActionButtons(action) {
  const code = String(action?.code || "");
  if (code === "recheck_input") {
    return [{ kind: "view", target: "seam", label: "打开焊缝页" }];
  }
  if (code === "review_qualification") {
    const scopes = Array.isArray(action?.scopes) ? action.scopes : [];
    const buttons = [];
    if (scopes.includes("pqr")) buttons.push({ kind: "view", target: "pqr", label: "打开PQR页" });
    if (scopes.includes("welder")) buttons.push({ kind: "view", target: "welder", label: "打开焊工页" });
    return buttons;
  }
  if (code === "review_inventory") {
    return [{ kind: "view", target: "inventory", label: "打开库存页" }];
  }
  if (code === "freeze_new_baseline") {
    return [{ kind: "exec", target: "rematch_freeze", label: "重新匹配并冻结" }];
  }
  return [];
}

async function runReviewAction(actionCode, target) {
  const code = String(actionCode || "");
  const normalizedTarget = String(target || "");
  if (code === "freeze_new_baseline" || normalizedTarget === "rematch_freeze") {
    await rematchAndFreezeNewBaseline();
    return;
  }

  const viewTargets = new Set(["seam", "pqr", "welder", "inventory", "match"]);
  if (viewTargets.has(normalizedTarget)) {
    setView(normalizedTarget);
    const labelMap = {
      seam: "焊缝页",
      pqr: "PQR页",
      welder: "焊工页",
      inventory: "库存页",
      match: "匹配页"
    };
    addEvent(`已跳转到${labelMap[normalizedTarget] || normalizedTarget}`);
  }
}

function pqrRowLikelyAffectsSeam(row, seam) {
  const range = parseThicknessRange(row.range);
  const minThk = Math.min(Number(seam.thkA) || 0, Number(seam.thkB) || 0);
  const maxThk = Math.max(Number(seam.thkA) || 0, Number(seam.thkB) || 0);
  const thkDelta = Math.abs((Number(seam.thkA) || 0) - (Number(seam.thkB) || 0));
  const dissimilar = seam.matA !== seam.matB;
  const mismatch = thkDelta > THICKNESS_DIFF_THRESHOLD;
  const positions = String(row.pos || "").split("/").map((item) => item.trim().toUpperCase());
  return minThk >= range.min
    && maxThk <= range.max
    && positions.includes(String(seam.pos || "").toUpperCase())
    && (!dissimilar || row.dissimilar)
    && (!mismatch || (row.thicknessMismatch && Number(row.maxDelta) >= thkDelta));
}

function welderRowLikelyAffectsSeam(row, seam) {
  const groupScope = String(row.group || "");
  const positions = String(row.pos || "").split("/").map((item) => item.trim().toUpperCase());
  const thkDelta = Math.abs((Number(seam.thkA) || 0) - (Number(seam.thkB) || 0));
  const dissimilar = seam.matA !== seam.matB;
  const mismatch = thkDelta > THICKNESS_DIFF_THRESHOLD;
  return [seam.matA, seam.matB].every((group) => groupScope.includes(group))
    && positions.includes(String(seam.pos || "").toUpperCase())
    && (!dissimilar || row.dissimilarQualified)
    && (!mismatch || (row.thicknessMismatchQualified && Number(row.thicknessDeltaMax) >= thkDelta));
}

function buildLocalImpactItems(scope, limit) {
  const now = Math.floor(Date.now() / 1000);
  if (scope === "seam") {
    return appState.seamRows.slice(0, limit).map((row) => ({
      scope,
      item_id: row.id,
      updated_at: now,
      summary: `${row.matA}/${row.matB} / ${row.pos} / ${row.thkA}+${row.thkB}mm`,
      impact_hint: "本地焊缝数据待同步，可能改变输入条件",
      impact_detail: "该焊缝输入发生变化后，需要重新参与匹配计算",
      affects_recommended_candidate: false,
      affected_seam_count: 1,
      affected_seam_ids: [row.id],
      affected_material_codes: []
    }));
  }
  if (scope === "pqr") {
    return appState.pqrRows.slice(0, limit).map((row) => {
      const affectedSeamIds = appState.seamRows.filter((seam) => pqrRowLikelyAffectsSeam(row, seam)).map((seam) => seam.id);
      return {
      scope,
      item_id: row.id,
      updated_at: now,
      summary: `${row.process} / ${row.range} / ${row.pos}`,
      impact_hint: "本地 PQR 待同步，可能改变候选覆盖范围",
      impact_detail: affectedSeamIds.length
        ? `可能改变焊缝 ${affectedSeamIds.join("、")} 的 PQR 候选覆盖`
        : "当前未直接命中现有焊缝，但会改变候选池",
      affects_recommended_candidate: false,
      affected_seam_count: affectedSeamIds.length,
      affected_seam_ids: affectedSeamIds,
      affected_material_codes: []
    };
    });
  }
  if (scope === "welder") {
    return appState.welderRows.slice(0, limit).map((row) => {
      const affectedSeamIds = appState.seamRows.filter((seam) => welderRowLikelyAffectsSeam(row, seam)).map((seam) => seam.id);
      return {
      scope,
      item_id: row.id,
      updated_at: now,
      summary: `${row.process} / ${row.pos} / 证书 ${row.cert}`,
      impact_hint: "本地焊工资格待同步，可能改变人员可用范围",
      impact_detail: affectedSeamIds.length
        ? `可能改变焊缝 ${affectedSeamIds.join("、")} 的焊工资格可用范围`
        : "当前未直接命中现有焊缝，但会改变候选池",
      affects_recommended_candidate: false,
      affected_seam_count: affectedSeamIds.length,
      affected_seam_ids: affectedSeamIds,
      affected_material_codes: []
    };
    });
  }
  if (scope === "batch") {
    return appState.batchRows.slice(0, limit).map((row) => ({
      scope,
      item_id: row.batch_no,
      updated_at: now,
      summary: `${row.material_code} / 可用 ${row.qty_available} / 安全 ${row.safety_stock}`,
      impact_hint: "本地库存批次待同步，可能改变库存告警结果",
      impact_detail: `该批次会影响焊材 ${row.material_code} 的库存可用性`,
      affects_recommended_candidate: false,
      affected_seam_count: 0,
      affected_seam_ids: [],
      affected_material_codes: [row.material_code]
    }));
  }
  return [];
}

function buildLocalBaselineImpact(targetBaseline) {
  if (!targetBaseline) return null;
  const limit = 5;
  const baselineReport = appState.matchReports.find((item) => item.traceId === targetBaseline.traceId) || null;
  const compareReport = appState.selectedMatchTraceId && appState.selectedMatchTraceId !== targetBaseline.traceId
    ? appState.matchReports.find((item) => item.traceId === appState.selectedMatchTraceId) || null
    : null;
  const baselineRecommended = baselineReport?.response?.recommended || targetBaseline.summary?.recommended || null;
  const compareRecommended = compareReport?.response?.recommended || null;
  const rawChangesByScope = {
    seam: appState.masterDirty.seam ? buildLocalImpactItems("seam", limit) : [],
    pqr: appState.masterDirty.pqr ? buildLocalImpactItems("pqr", limit) : [],
    welder: appState.masterDirty.welder ? buildLocalImpactItems("welder", limit) : [],
    batch: appState.masterDirty.batch ? buildLocalImpactItems("batch", limit) : []
  };
  const changesByScope = Object.fromEntries(
    Object.entries(rawChangesByScope).map(([scope, items]) => [
      scope,
      items.map((item) => {
        const affectsBaseline = localImpactItemMatchesRecommendation(item, baselineRecommended);
        const affectsCompare = localImpactItemMatchesRecommendation(item, compareRecommended);
        const recommendationRelation = item.scope === "seam"
          ? "该焊缝输入变化会直接改变匹配输入条件"
          : compareReport
            ? affectsBaseline && affectsCompare
              ? "基线与当前推荐均命中该对象"
              : affectsBaseline
                ? "原推荐命中该对象，当前推荐已切换"
                : affectsCompare
                  ? "当前推荐已切换到该对象"
                  : "未直接命中基线/当前推荐，但会影响候选池"
            : affectsBaseline
              ? "命中原推荐组合"
              : "未直接命中原推荐组合，但会影响候选池";
        return {
          ...item,
          affects_recommended_candidate: affectsBaseline,
          affects_compare_recommended_candidate: affectsCompare,
          recommendation_relation: recommendationRelation
        };
      })
    ])
  );
  const reasons = Array.isArray(targetBaseline.reviewReasons) && targetBaseline.reviewReasons.length
    ? targetBaseline.reviewReasons.slice()
    : [];
  const changeCounts = targetBaseline.changeCounts || {
    seam: changesByScope.seam.length,
    pqr: changesByScope.pqr.length,
    welder: changesByScope.welder.length,
    batch: changesByScope.batch.length
  };
  return {
    trace_id: targetBaseline.traceId,
    baseline_label: targetBaseline.label,
    baseline_recommended: baselineRecommended,
    created_at: Number(targetBaseline.createdAt) || 0,
    review_status: targetBaseline.reviewStatus || (reasons.length ? "needs_review" : "ok"),
    review_reasons: reasons,
    latest_change_at: Number(targetBaseline.latestChangeAt) || 0,
    change_counts: changeCounts,
    display_limit_per_scope: limit,
    changes_by_scope: changesByScope,
    compare_trace_id: compareReport?.traceId || null,
    compare_decision: compareReport?.decision || null,
    compare_recommended: compareRecommended,
    recommendation_shift: compareReport
      ? `推荐已从 ${getRecommendationLabel(baselineRecommended)} 切换为 ${getRecommendationLabel(compareRecommended)}`
      : null,
    review_actions: buildLocalBaselineReviewActions(
      targetBaseline.decision,
      compareReport?.decision || "",
      baselineRecommended,
      compareRecommended,
      changesByScope,
      changeCounts,
      compareReport
        ? `推荐已从 ${getRecommendationLabel(baselineRecommended)} 切换为 ${getRecommendationLabel(compareRecommended)}`
        : null
    )
  };
}

function renderBaselineImpact() {
  if (!baselineImpactCaption || !baselineImpactEmpty || !baselineImpactContent) return;
  const impact = appState.baselineImpact;
  if (!impact) {
    baselineImpactCaption.textContent = "当前未选择需要分析的基线";
    baselineImpactEmpty.textContent = "选中匹配记录后，系统会显示对应基线在冻结后的主数据变更明细。";
    baselineImpactEmpty.classList.remove("hidden");
    baselineImpactContent.classList.add("hidden");
    if (baselineImpactSummary) baselineImpactSummary.innerHTML = "";
    if (baselineImpactGroups) baselineImpactGroups.innerHTML = "";
    syncExportReviewChecklistButtonState();
    return;
  }

  baselineImpactCaption.textContent = `基线 ${impact.baseline_label || impact.trace_id || "-"} 的影响范围`;
  baselineImpactEmpty.classList.add("hidden");
  baselineImpactContent.classList.remove("hidden");

  const reviewType = impact.review_status === "needs_review" ? "warn" : impact.review_status === "ok" ? "ok" : "info";
  const reviewText = impact.review_status === "needs_review" ? "需复核" : impact.review_status === "ok" ? "正常" : "待检测";
  const counts = impact.change_counts || {};
  const reasonText = Array.isArray(impact.review_reasons) && impact.review_reasons.length
    ? impact.review_reasons.join("；")
    : "当前基线冻结后未检测到主数据变更";
  const latestChangeText = impact.latest_change_at ? formatCreatedAt(impact.latest_change_at) : "无";
  const baselineRecommendation = getRecommendationLabel(impact.baseline_recommended || impact.summary?.recommended || null);
  const compareRecommendation = getRecommendationLabel(impact.compare_recommended || null);
  const recommendationShift = impact.recommendation_shift || (impact.compare_trace_id
    ? `推荐已从 ${baselineRecommendation} 切换为 ${compareRecommendation}`
    : `基线推荐为 ${baselineRecommendation}`);
  const reviewActions = Array.isArray(impact.review_actions) ? impact.review_actions : [];
  const priorityTag = (priority) => {
    if (priority === "high") return statusTag("高优先级", "danger");
    if (priority === "medium") return statusTag("中优先级", "warn");
    return statusTag("低优先级", "info");
  };
  if (baselineImpactSummary) {
    baselineImpactSummary.innerHTML = `
      <div class="baseline-impact-summary-grid">
        <div class="baseline-impact-summary-item">
          <span>复核状态</span>
          <strong>${statusTag(reviewText, reviewType)}</strong>
        </div>
        <div class="baseline-impact-summary-item">
          <span>冻结时间</span>
          <strong>${formatCreatedAt(impact.created_at)}</strong>
        </div>
        <div class="baseline-impact-summary-item">
          <span>最近变更</span>
          <strong>${latestChangeText}</strong>
        </div>
        <div class="baseline-impact-summary-item">
          <span>变更计数</span>
          <strong>焊缝 ${counts.seam || 0} / PQR ${counts.pqr || 0} / 焊工 ${counts.welder || 0} / 批次 ${counts.batch || 0}</strong>
        </div>
        <div class="baseline-impact-summary-item">
          <span>基线推荐</span>
          <strong>${baselineRecommendation}</strong>
        </div>
        <div class="baseline-impact-summary-item">
          <span>${impact.compare_trace_id ? "当前推荐" : "推荐变化"}</span>
          <strong>${impact.compare_trace_id ? compareRecommendation : recommendationShift}</strong>
        </div>
      </div>
      <p class="baseline-impact-reason">${reasonText}</p>
      <p class="baseline-impact-reason">${recommendationShift}</p>
      <div class="baseline-action-board">
        <p class="card-kicker">建议动作</p>
        <ul class="queue-list compact baseline-action-list">
          ${reviewActions.map((action) => `
            <li>
              <span>${action.title || "-"}</span>
              <strong>${priorityTag(String(action.priority || "low"))}</strong>
              <em class="baseline-impact-meta">${action.detail || "-"}</em>
              <div class="baseline-action-buttons">
                ${getReviewActionButtons(action).map((button) => `
                  <button
                    class="${button.kind === "exec" ? "primary small" : "ghost small"}"
                    data-review-action="${action.code || ""}"
                    data-review-target="${button.target || ""}"
                  >${button.label || "处理"}</button>
                `).join("")}
              </div>
            </li>
          `).join("")}
        </ul>
      </div>
    `;
  }

  const scopes = ["seam", "pqr", "welder", "batch"];
  const groups = scopes
    .map((scope) => {
      const items = Array.isArray(impact.changes_by_scope?.[scope]) ? impact.changes_by_scope[scope] : [];
      const total = Number(impact.change_counts?.[scope] || 0);
      if (!items.length && total === 0) return "";
      const limit = Number(impact.display_limit_per_scope || items.length || 0);
      const hint = total > items.length ? `仅展示最近 ${items.length} / ${total} 条` : `共 ${total || items.length} 条`;
      return `
        <article class="match-detail-panel baseline-impact-group">
          <div class="baseline-impact-group-head">
            <span>${statusTag(formatBaselineImpactScopeLabel(scope), getBaselineImpactScopeTagType(scope))}</span>
            <strong>${hint}</strong>
          </div>
          <ul class="queue-list compact baseline-impact-list">
            ${items.map((item) => {
              const locateButtons = getLocateButtonsForImpactItem(item, scope);
              const focusButtons = getFocusButtonsForImpactItem(item, scope);
              return `
                <li>
                  <span>${item.item_id || "-"} · ${item.summary || "-"}</span>
                  <strong>${item.impact_detail || item.impact_hint || "-"}</strong>
                  <em class="baseline-impact-meta">
                    ${item.recommendation_relation || ""}${item.recommendation_relation ? " · " : ""}${item.affects_recommended_candidate ? "命中原推荐组合 · " : ""}${item.affects_compare_recommended_candidate ? "命中当前推荐 · " : ""}${item.affected_seam_count ? `影响焊缝 ${item.affected_seam_ids.join("、")} · ` : ""}${Array.isArray(item.affected_material_codes) && item.affected_material_codes.length ? `影响焊材 ${item.affected_material_codes.join("、")} · ` : ""}${formatCreatedAt(item.updated_at)}
                  </em>
                  ${(locateButtons.length || focusButtons.length) ? `
                    <div class="baseline-impact-item-actions">
                      ${locateButtons.map((button) => `
                        <button
                          class="ghost small"
                          data-locate-scope="${button.scope}"
                          data-locate-id="${button.itemId}"
                        >${button.label}</button>
                      `).join("")}
                      ${focusButtons.map((button) => `
                        <button
                          class="ghost small"
                          data-focus-scope="${button.scope}"
                          data-focus-ids="${button.ids.join(",")}"
                          data-focus-label="${button.focusLabel}"
                        >${button.label}</button>
                      `).join("")}
                    </div>
                  ` : ""}
                </li>
              `;
            }).join("")}
          </ul>
        </article>
      `;
    })
    .filter(Boolean);

  baselineImpactGroups.innerHTML = groups.length
    ? groups.join("")
    : '<article class="match-detail-panel baseline-impact-group"><p class="baseline-impact-empty-copy">当前基线冻结后未检测到受影响主数据。</p></article>';
  syncExportReviewChecklistButtonState();
}

function renderSelectedMatchDetail() {
  if (!matchDetailTrace || !matchDetailContent || !matchDetailEmpty) return;

  const traceId = appState.selectedMatchTraceId;
  const report = appState.matchReports.find((item) => item.traceId === traceId);
  if (!report) {
    matchDetailTrace.textContent = "请选择一条匹配记录";
    matchDetailEmpty.classList.remove("hidden");
    matchDetailContent.classList.add("hidden");
    if (matchDetailAuditList) {
      matchDetailAuditList.innerHTML = "";
    }
    return;
  }

  const request = report.request || {};
  const response = report.response || {};
  const relatedLogs = appState.auditLogs.filter((item) => item.traceId === traceId);
  const auditPayload = relatedLogs[0]?.payload || {};
  const inputCounts = auditPayload.input_counts || {
    weld_seams: Array.isArray(request.weld_seams) ? request.weld_seams.length : 0,
    pqr_candidates: Array.isArray(request.pqr_candidates) ? request.pqr_candidates.length : 0,
    welder_candidates: Array.isArray(request.welder_candidates) ? request.welder_candidates.length : 0,
    required_consumables: Array.isArray(request.required_consumables) ? request.required_consumables.length : 0,
    consumable_batches: Array.isArray(request.consumable_batches) ? request.consumable_batches.length : 0
  };
  const reviewCounts = auditPayload.review_status_counts || collectReviewStatusCounts(request.weld_seams);
  const recommended = response?.recommended || auditPayload?.recommended || null;

  matchDetailTrace.textContent = `Trace ID: ${traceId}`;
  matchDetailEmpty.classList.add("hidden");
  matchDetailContent.classList.remove("hidden");
  matchDetailProject.textContent = report.projectId || auditPayload.project_id || "-";
  matchDetailStandard.textContent = formatCodeLabel(request.standard_code || auditPayload.standard_code);
  matchDetailDecision.textContent = formatCodeLabel(report.decision || response.decision);
  matchDetailRulePackage.textContent = report.rulePackageVersion || response?.rule_package?.version || "-";
  matchDetailInputCounts.textContent = `焊缝 ${inputCounts.weld_seams || 0} / PQR ${inputCounts.pqr_candidates || 0} / 焊工 ${inputCounts.welder_candidates || 0} / 批次 ${inputCounts.consumable_batches || 0}`;
  matchDetailReviewCounts.textContent = `已确认 ${reviewCounts.confirmed || 0} / 已变更 ${reviewCounts.changed || 0} / 待确认 ${reviewCounts.pending || 0} / 存疑 ${reviewCounts.uncertain || 0}`;
  matchDetailRecommendation.textContent = recommended
    ? `${recommended.pqr_id || "-"} + ${recommended.welder_id || "-"}`
    : "无推荐组合";
  matchDetailResults.textContent = `候选 ${Array.isArray(response.alternatives) ? response.alternatives.length : 0} / 冲突 ${Array.isArray(response.hard_conflicts) ? response.hard_conflicts.length : 0} / 库存告警 ${Array.isArray(response.inventory_alerts) ? response.inventory_alerts.length : 0}`;
  matchDetailRequestJson.textContent = formatJsonBlock(report.requestJson || request);
  matchDetailResponseJson.textContent = formatJsonBlock(report.responseJson || response);

  if (!matchDetailAuditList) return;
  if (!relatedLogs.length) {
    matchDetailAuditList.innerHTML = "<li><span>审计日志</span><strong>暂无</strong></li>";
    return;
  }
  matchDetailAuditList.innerHTML = relatedLogs
    .map((item) => {
      const seamCount = item.payload?.input_counts?.weld_seams;
      const summary = seamCount
        ? `${item.result} / 焊缝 ${seamCount} 条`
        : item.payload?.project_name || item.result;
      return `<li><span>${formatCreatedAt(item.createdAt)} ${item.action}</span><strong>${summary}</strong></li>`;
    })
    .join("");
}

function renderMatchBaselines() {
  if (!matchBaselineBody) return;
  if (!appState.matchBaselines.length) {
    matchBaselineBody.innerHTML = '<tr><td colspan="6">暂无已冻结基线</td></tr>';
    return;
  }
  matchBaselineBody.innerHTML = appState.matchBaselines
    .map((item) => {
      const type = item.decision === "match" ? "ok" : item.decision === "fail" ? "danger" : "warn";
      const reviewType = item.reviewStatus === "needs_review" ? "warn" : item.reviewStatus === "ok" ? "ok" : "info";
      const reviewText = item.reviewStatus === "needs_review" ? "需复核" : item.reviewStatus === "ok" ? "正常" : "待检测";
      const reviewTitle = Array.isArray(item.reviewReasons) && item.reviewReasons.length
        ? item.reviewReasons.join("；")
        : item.latestChangeAt
          ? `最近变更 ${formatCreatedAt(item.latestChangeAt)}`
          : reviewText;
      const active = item.traceId === appState.selectedMatchTraceId ? ' class="is-selected-row"' : "";
      return `
        <tr${active} data-baseline-trace="${item.traceId}" title="${reviewTitle}">
          <td>${formatCreatedAt(item.createdAt)}</td>
          <td>${item.label}</td>
          <td>${statusTag(item.decision, type)}</td>
          <td>${statusTag(reviewText, reviewType)}</td>
          <td>${item.traceId}</td>
          <td>${item.rulePackageVersion}</td>
        </tr>
      `;
    })
    .join("");
}

function buildAuditPackageFromState(traceId) {
  const report = appState.matchReports.find((item) => item.traceId === traceId);
  if (!report) return null;
  const relatedLogs = appState.auditLogs.filter((item) => item.traceId === traceId);
  return {
    trace_id: report.traceId,
    project_id: report.projectId,
    decision: report.decision,
    rule_package_version: report.rulePackageVersion,
    created_at: report.createdAt,
    summary: {
      recommended: report.response?.recommended || null,
      alternative_count: Array.isArray(report.response?.alternatives) ? report.response.alternatives.length : 0,
      hard_conflict_count: Array.isArray(report.response?.hard_conflicts) ? report.response.hard_conflicts.length : 0,
      inventory_alert_count: Array.isArray(report.response?.inventory_alerts) ? report.response.inventory_alerts.length : 0
    },
    request: report.request || parseJsonSafely(report.requestJson) || null,
    response: report.response || parseJsonSafely(report.responseJson) || null,
    audit_logs: relatedLogs.map((item) => ({
      trace_id: item.traceId,
      action: item.action,
      result: item.result,
      payload: item.payload || parseJsonSafely(item.payloadJson) || null,
      created_at: item.createdAt
    }))
  };
}

async function loadAuditBundleForTrace(traceId) {
  const normalized = String(traceId || "").trim();
  if (!normalized) return null;

  if (typeof window.__TAURI_INTERNALS__?.invoke === "function") {
    const payload = await invokeTauriCommand("get_match_audit_bundle", {
      dbPath: PROTOTYPE_DB_PATH,
      traceId: normalized
    });
    return JSON.parse(payload);
  }

  return buildAuditPackageFromState(normalized);
}

async function loadBaselineImpactForTrace(traceId, compareTraceId = "") {
  const normalized = String(traceId || "").trim();
  if (!normalized) return null;

  if (typeof window.__TAURI_INTERNALS__?.invoke === "function") {
    const payload = await invokeTauriCommand("get_match_baseline_impact", {
      dbPath: PROTOTYPE_DB_PATH,
      traceId: normalized,
      limitPerScope: 5,
      compareTraceId: String(compareTraceId || "").trim() || null
    });
    return JSON.parse(payload);
  }

  return buildLocalBaselineImpact(getBaselineImpactTarget(normalized));
}

async function refreshBaselineComparisonForSelectedTrace() {
  const currentTraceId = String(appState.selectedMatchTraceId || "").trim();
  const baseline = getLatestComparableBaseline(currentTraceId);

  if (!currentTraceId) {
    appState.baselineComparison = null;
    renderBaselineComparison();
    return;
  }

  if (!baseline) {
    const frozen = appState.matchBaselines.some((item) => item.traceId === currentTraceId);
    appState.baselineComparison = {
      currentTraceId,
      baselineLabel: frozen ? "当前记录已是最新基线" : "暂无可对比基线",
      currentDecision: "-",
      baselineDecision: "-",
      currentRecommendation: "-",
      baselineRecommendation: "-",
      currentInputs: "-",
      baselineInputs: "-",
      currentResults: "-",
      baselineResults: "-",
      changes: []
    };
    renderBaselineComparison();
    return;
  }

  try {
    const [currentBundle, baselineBundle] = await Promise.all([
      loadAuditBundleForTrace(currentTraceId),
      loadAuditBundleForTrace(baseline.traceId)
    ]);
    if (!currentBundle || !baselineBundle) {
      appState.baselineComparison = null;
      renderBaselineComparison();
      return;
    }

    const currentInputs = getBundleInputCounts(currentBundle);
    const baselineInputs = getBundleInputCounts(baselineBundle);
    const currentReview = getBundleReviewCounts(currentBundle);
    const baselineReview = getBundleReviewCounts(baselineBundle);
    const currentResults = getBundleResultSummary(currentBundle);
    const baselineResults = getBundleResultSummary(baselineBundle);

    const changes = [];
    const maybePush = (label, beforeValue, afterValue) => {
      if (String(beforeValue) === String(afterValue)) return;
      changes.push({
        label,
        detail: `${beforeValue} -> ${afterValue}`
      });
    };

    maybePush("决策", formatCodeLabel(baselineBundle.decision), formatCodeLabel(currentBundle.decision));
    maybePush("推荐组合", getBundleRecommendationLabel(baselineBundle), getBundleRecommendationLabel(currentBundle));
    maybePush("焊缝数量", baselineInputs.weld_seams || 0, currentInputs.weld_seams || 0);
    maybePush("PQR 数量", baselineInputs.pqr_candidates || 0, currentInputs.pqr_candidates || 0);
    maybePush("焊工数量", baselineInputs.welder_candidates || 0, currentInputs.welder_candidates || 0);
    maybePush("批次数量", baselineInputs.consumable_batches || 0, currentInputs.consumable_batches || 0);
    maybePush("待确认焊缝", baselineReview.pending || 0, currentReview.pending || 0);
    maybePush("存疑焊缝", baselineReview.uncertain || 0, currentReview.uncertain || 0);
    maybePush("冲突数量", baselineResults.hardConflictCount, currentResults.hardConflictCount);
    maybePush("库存告警", baselineResults.inventoryAlertCount, currentResults.inventoryAlertCount);
    maybePush("备选方案数", baselineResults.alternativeCount, currentResults.alternativeCount);
    maybePush(
      "规则版本",
      baselineBundle.rule_package_version || "-",
      currentBundle.rule_package_version || "-"
    );

    appState.baselineComparison = {
      currentTraceId,
      baselineTraceId: baseline.traceId,
      baselineLabel: baseline.label,
      currentDecision: formatCodeLabel(currentBundle.decision),
      baselineDecision: formatCodeLabel(baselineBundle.decision),
      currentRecommendation: getBundleRecommendationLabel(currentBundle),
      baselineRecommendation: getBundleRecommendationLabel(baselineBundle),
      currentInputs: `焊缝 ${currentInputs.weld_seams || 0} / PQR ${currentInputs.pqr_candidates || 0} / 焊工 ${currentInputs.welder_candidates || 0} / 批次 ${currentInputs.consumable_batches || 0}`,
      baselineInputs: `焊缝 ${baselineInputs.weld_seams || 0} / PQR ${baselineInputs.pqr_candidates || 0} / 焊工 ${baselineInputs.welder_candidates || 0} / 批次 ${baselineInputs.consumable_batches || 0}`,
      currentResults: `冲突 ${currentResults.hardConflictCount} / 告警 ${currentResults.inventoryAlertCount} / 备选 ${currentResults.alternativeCount}`,
      baselineResults: `冲突 ${baselineResults.hardConflictCount} / 告警 ${baselineResults.inventoryAlertCount} / 备选 ${baselineResults.alternativeCount}`,
      changes
    };
    renderBaselineComparison();
  } catch (error) {
    appState.baselineComparison = {
      currentTraceId,
      baselineLabel: baseline.label,
      currentDecision: "-",
      baselineDecision: "-",
      currentRecommendation: "-",
      baselineRecommendation: "-",
      currentInputs: "-",
      baselineInputs: "-",
      currentResults: "-",
      baselineResults: "-",
      changes: [
        {
          label: "对比失败",
          detail: String(error)
        }
      ]
    };
    renderBaselineComparison();
  }
}

async function refreshBaselineImpactForSelectedTrace() {
  const currentTraceId = String(appState.selectedMatchTraceId || "").trim();
  const targetBaseline = getBaselineImpactTarget(currentTraceId);
  const compareTraceId = targetBaseline && currentTraceId && currentTraceId !== targetBaseline.traceId
    ? currentTraceId
    : "";

  if (!currentTraceId || !targetBaseline) {
    appState.baselineImpact = null;
    renderBaselineImpact();
    return;
  }

  try {
    const impact = await loadBaselineImpactForTrace(targetBaseline.traceId, compareTraceId);
    if (!impact) {
      appState.baselineImpact = null;
      renderBaselineImpact();
      return;
    }
    appState.baselineImpact = impact;
    renderBaselineImpact();
  } catch (error) {
    appState.baselineImpact = {
      trace_id: targetBaseline.traceId,
      baseline_label: targetBaseline.label,
      baseline_recommended: targetBaseline.summary?.recommended || null,
      created_at: Number(targetBaseline.createdAt) || 0,
      review_status: targetBaseline.reviewStatus || "unknown",
      review_reasons: [`影响范围明细加载失败: ${String(error)}`],
      latest_change_at: Number(targetBaseline.latestChangeAt) || 0,
      change_counts: targetBaseline.changeCounts || { seam: 0, pqr: 0, welder: 0, batch: 0 },
      display_limit_per_scope: 0,
      compare_trace_id: compareTraceId || null,
      compare_recommended: null,
      recommendation_shift: null,
      review_actions: [{
        code: "impact_load_failed",
        title: "影响明细加载失败",
        detail: "当前无法生成处理建议，请先刷新记录后重试。",
        priority: "medium",
        scopes: []
      }],
      changes_by_scope: {
        seam: [],
        pqr: [],
        welder: [],
        batch: []
      }
    };
    renderBaselineImpact();
  }
}

async function exportSelectedAuditPackage() {
  const traceId = String(appState.selectedMatchTraceId || "").trim();
  if (!traceId) {
    addEvent("请先选择一条匹配记录，再导出审计包");
    return;
  }

  let bundle = null;
  if (typeof window.__TAURI_INTERNALS__?.invoke === "function") {
    try {
      const payload = await invokeTauriCommand("get_match_audit_bundle", {
        dbPath: PROTOTYPE_DB_PATH,
        traceId
      });
      bundle = JSON.parse(payload);
    } catch (error) {
      addEvent(`后端审计包读取失败，改用本地缓存导出: ${String(error)}`);
    }
  }

  if (!bundle) {
    bundle = buildAuditPackageFromState(traceId);
  }
  if (!bundle) {
    addEvent(`未找到 Trace ${traceId} 的审计数据`);
    return;
  }

  const exported = {
    exported_at: new Date().toISOString(),
    source: "weldlayer-prototype",
    ...bundle
  };
  const filename = `audit_package_${sanitizeFilenameSegment(traceId)}.json`;
  triggerDownload(JSON.stringify(exported, null, 2), filename);
  addEvent(`审计包已导出: ${filename}`);
}

function buildBaselineFromState(traceId) {
  const report = appState.matchReports.find((item) => item.traceId === traceId);
  if (!report) return null;
  const response = report.response || parseJsonSafely(report.responseJson) || {};
  const summary = {
    recommended: response.recommended || null,
    alternative_count: Array.isArray(response.alternatives) ? response.alternatives.length : 0,
    hard_conflict_count: Array.isArray(response.hard_conflicts) ? response.hard_conflicts.length : 0,
    inventory_alert_count: Array.isArray(response.inventory_alerts) ? response.inventory_alerts.length : 0
  };
  return {
    traceId: report.traceId,
    projectId: report.projectId || getCurrentProjectId(),
    label: `BASELINE-${report.traceId}`,
    decision: report.decision,
    rulePackageVersion: report.rulePackageVersion,
    summaryJson: JSON.stringify(summary),
    summary,
    createdAt: Math.floor(Date.now() / 1000),
    reviewStatus: "ok",
    reviewReasons: [],
    latestChangeAt: 0,
    changeCounts: {
      seam: 0,
      pqr: 0,
      welder: 0,
      batch: 0
    }
  };
}

async function freezeSelectedMatchAsBaseline() {
  const traceId = String(appState.selectedMatchTraceId || "").trim();
  if (!traceId) {
    addEvent("请先选择一条匹配记录，再冻结基线");
    return;
  }
  if (isSelectedTraceFrozen()) {
    addEvent(`Trace ${traceId} 已经是冻结基线`);
    return;
  }

  let baseline = null;
  if (typeof window.__TAURI_INTERNALS__?.invoke === "function") {
    try {
      const payload = await invokeTauriCommand("freeze_match_baseline", {
        dbPath: PROTOTYPE_DB_PATH,
        traceId,
        baselineLabel: null
      });
      const item = JSON.parse(payload);
      baseline = {
        traceId: String(item.trace_id || traceId),
        projectId: String(item.project_id || getCurrentProjectId()),
        label: String(item.baseline_label || `BASELINE-${traceId}`),
        decision: String(item.decision || "partial"),
        rulePackageVersion: String(item.rule_package_version || "-"),
        summaryJson: String(item.summary_json || "{}"),
        summary: parseJsonSafely(item.summary_json),
        createdAt: Number(item.created_at) || Math.floor(Date.now() / 1000)
      };
    } catch (error) {
      addEvent(`后端冻结基线失败，改用本地状态保留: ${String(error)}`);
    }
  }

  if (!baseline) {
    baseline = buildBaselineFromState(traceId);
  }
  if (!baseline) {
    addEvent(`未找到 Trace ${traceId} 的匹配记录`);
    return;
  }

  appState.matchBaselines = [baseline, ...appState.matchBaselines.filter((item) => item.traceId !== baseline.traceId)];
  renderMatchBaselines();
  syncFreezeBaselineButtonState();
  await refreshBaselineComparisonForSelectedTrace();
  await refreshBaselineImpactForSelectedTrace();
  addEvent(`已冻结项目基线: ${baseline.label}`);
}

async function rematchAndFreezeNewBaseline() {
  if (typeof window.__TAURI_INTERNALS__?.invoke !== "function") {
    addEvent("当前环境不支持重新匹配并冻结新基线，请在桌面端运行");
    return;
  }

  const previousTraceId = String(appState.selectedMatchTraceId || "").trim();
  const result = await runMatch({ freezeAfter: true, preserveSelectionOnFailure: true });
  if (result?.attempted) {
    bumpTraceId();
  }
  if (!result?.response?.trace_id) {
    addEvent("重新匹配未生成新的 Trace，已跳过基线冻结");
    if (previousTraceId) {
      setSelectedMatchTrace(previousTraceId);
    }
    return;
  }

  addEvent(`已完成重新匹配并冻结新基线: ${result.response.trace_id}`);
}

function renderMatchReports() {
  if (!matchReportBody) return;
  if (!appState.matchReports.length) {
    matchReportBody.innerHTML = '<tr><td colspan="4">暂无匹配记录</td></tr>';
    return;
  }
  matchReportBody.innerHTML = appState.matchReports
    .map((item) => {
      const type = item.decision === "match" ? "ok" : item.decision === "fail" ? "danger" : "warn";
      const active = item.traceId === appState.selectedMatchTraceId ? ' class="is-selected-row"' : "";
      return `
        <tr${active} data-match-trace="${item.traceId}">
          <td>${formatCreatedAt(item.createdAt)}</td>
          <td>${statusTag(item.decision, type)}</td>
          <td>${item.traceId}</td>
          <td>${item.rulePackageVersion}</td>
        </tr>
      `;
    })
    .join("");
}

function renderAuditLogs() {
  if (!auditLogBody) return;
  if (!appState.auditLogs.length) {
    auditLogBody.innerHTML = '<tr><td colspan="4">暂无审计日志</td></tr>';
    return;
  }
  auditLogBody.innerHTML = appState.auditLogs
    .map((item) => {
      const type = item.result === "match" ? "ok" : item.result === "fail" ? "danger" : "warn";
      const active = item.traceId === appState.selectedMatchTraceId ? ' class="is-selected-row"' : "";
      return `
        <tr${active} data-audit-trace="${item.traceId}">
          <td>${formatCreatedAt(item.createdAt)}</td>
          <td>${item.action}</td>
          <td>${statusTag(item.result, type)}</td>
          <td>${item.traceId}</td>
        </tr>
      `;
    })
    .join("");
}

function setView(viewKey) {
  appState.view = viewKey;
  if (viewKey !== "import") {
    closeParseQuickEditModal({ silent: true });
  }
  menuButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.view === viewKey));
  views.forEach((panel) => panel.classList.toggle("is-visible", panel.dataset.viewPanel === viewKey));
  const meta = viewMeta[viewKey];
  document.querySelector("#view-title").textContent = meta.title;
  document.querySelector("#breadcrumb").textContent = meta.breadcrumb;
  document.querySelector("#detail-title").textContent = meta.detailTitle;
  document.querySelector("#detail-content").textContent = meta.detailText;
}

function isTauriRuntime() {
  return typeof window.__TAURI_INTERNALS__?.invoke === "function";
}

function basenameFromPath(value) {
  return String(value || "")
    .split(/[\\/]/)
    .filter(Boolean)
    .pop() || "";
}

function normalizeParseFileType(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/^\./, "");
  return PARSE_ALLOWED_FILE_TYPES.has(normalized) ? normalized : "";
}

function inferParseFileType(value) {
  const fileName = basenameFromPath(value);
  const ext = fileName.includes(".") ? fileName.split(".").pop() : "";
  return normalizeParseFileType(ext);
}

function buildParseQueueId() {
  return `PF-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function buildParseQueueKey(item) {
  return `${normalizeParseFileType(item?.fileType || inferParseFileType(item?.path || item?.fileName))}|${String(
    item?.path || item?.fileName || ""
  )
    .trim()
    .toLowerCase()}`;
}

function buildParseQueueItem(input = {}) {
  const path = String(input.path || input.fileName || "").trim();
  const fileName = String(input.fileName || basenameFromPath(path) || "unnamed").trim();
  const fileType = normalizeParseFileType(input.fileType || inferParseFileType(path || fileName));
  const previewUrl = String(input.previewUrl || "");
  return {
    id: String(input.id || buildParseQueueId()),
    path,
    fileName,
    fileType,
    source: String(input.source || "manual"),
    virtual: Boolean(input.virtual),
    sizeBytes: Number(input.sizeBytes) || 0,
    previewUrl,
    previewMimeType: String(input.previewMimeType || ""),
    previewLoadState: String(input.previewLoadState || (previewUrl ? "ready" : "idle")),
    previewError: String(input.previewError || ""),
    status: String(input.status || "ready"),
    progress: Number(input.progress) || 0,
    errorCode: String(input.errorCode || ""),
    errorMessage: String(input.errorMessage || ""),
    reviewStatus: String(input.reviewStatus || "pending"),
    seams: Array.isArray(input.seams) ? input.seams.map((item) => normalizeParseSeamItem(item)) : [],
    candidates: Array.isArray(input.candidates) ? input.candidates.map((item) => normalizeParseCandidateItem(item)) : []
  };
}

function formatBytes(value) {
  const size = Number(value) || 0;
  if (size <= 0) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveParsePreviewUrl(item) {
  if (!item) return "";
  if (item.previewUrl) return item.previewUrl;
  return "";
}

function getParsePreviewModeMeta() {
  return appState.parsePreviewMode === "annotate"
    ? {
        label: "标注模式",
        buttonText: "切换到浏览模式",
        helpText: "当前处于标注模式。可直接拖动标注重定位，或选中目标后在图纸空白处双击落点。"
      }
    : {
        label: "浏览模式",
        buttonText: "切换到标注模式",
        helpText: "当前处于浏览模式。可直接滚动图纸，并用缩放按钮查看细节。"
      };
}

function getParsePreviewExpandMeta() {
  return appState.parsePreviewExpanded
    ? { buttonText: "恢复标准布局", label: "扩展预览" }
    : { buttonText: "放大预览", label: "标准布局" };
}

function normalizeParsePreviewRotation(value) {
  const numeric = Number(value) || 0;
  const normalized = ((numeric % 360) + 360) % 360;
  return [0, 90, 180, 270].includes(normalized) ? normalized : 0;
}

function rotatePreviewPoint(point) {
  const x = Math.max(0, Math.min(1, Number(point?.x) || 0));
  const y = Math.max(0, Math.min(1, Number(point?.y) || 0));
  switch (normalizeParsePreviewRotation(appState.parsePreviewRotation)) {
    case 90:
      return { x: 1 - y, y: x };
    case 180:
      return { x: 1 - x, y: 1 - y };
    case 270:
      return { x: y, y: 1 - x };
    default:
      return { x, y };
  }
}

function unrotatePreviewPoint(point) {
  const x = Math.max(0, Math.min(1, Number(point?.x) || 0));
  const y = Math.max(0, Math.min(1, Number(point?.y) || 0));
  switch (normalizeParsePreviewRotation(appState.parsePreviewRotation)) {
    case 90:
      return { x: y, y: 1 - x };
    case 180:
      return { x: 1 - x, y: 1 - y };
    case 270:
      return { x: 1 - y, y: x };
    default:
      return { x, y };
  }
}

function clampParsePreviewZoom(value) {
  const numeric = Number(value) || 100;
  return Math.max(50, Math.min(300, Math.round(numeric / 10) * 10));
}

function formatParsePreviewZoom() {
  return `${clampParsePreviewZoom(appState.parsePreviewZoom)}%`;
}

async function getPdfJsLib() {
  if (!parsePreviewRuntime.pdfJsPromise) {
    parsePreviewRuntime.pdfJsPromise = import("./vendor/pdf.mjs")
      .then((module) => {
        module.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.mjs", window.location.href).href;
        return module;
      })
      .catch((error) => {
        parsePreviewRuntime.pdfJsPromise = null;
        throw error;
      });
  }
  return parsePreviewRuntime.pdfJsPromise;
}

function getParsePreviewDocumentKey(item, previewUrl) {
  return `${String(item?.id || "")}::${String(previewUrl || "")}`;
}

function getSelectedPreviewAnchorPageIndex(item) {
  const selectedSeamId = String(appState.parseSelectedSeamId || "").trim();
  if (selectedSeamId) {
    const seam = (item?.seams || []).find((entry) => String(entry?.weld_id || "") === selectedSeamId);
    if (Number.isFinite(Number(seam?.anchor_bbox?.page_index))) {
      return Math.max(0, Number(seam.anchor_bbox.page_index));
    }
  }
  const selectedCandidateId = String(appState.parseSelectedCandidateId || "").trim();
  if (selectedCandidateId) {
    const candidate = (item?.candidates || []).find((entry) => String(entry?.candidate_id || "") === selectedCandidateId);
    if (Number.isFinite(Number(candidate?.anchor_bbox?.page_index))) {
      return Math.max(0, Number(candidate.anchor_bbox.page_index));
    }
  }
  return Math.max(0, Number(appState.parsePreviewPageIndex) || 0);
}

function getPreviewAnchorPageIndex(anchor) {
  const pageIndex = Number(anchor?.page_index);
  return Number.isFinite(pageIndex) ? Math.max(0, pageIndex) : 0;
}

function isAnchorVisibleOnPreviewPage(anchor) {
  return getPreviewAnchorPageIndex(anchor) === Math.max(0, Number(appState.parsePreviewPageIndex) || 0);
}

async function clearParsePreviewDocument() {
  if (parsePreviewRuntime.renderTask) {
    try {
      parsePreviewRuntime.renderTask.cancel();
    } catch (_error) {
      // Ignore canceled render tasks.
    }
    parsePreviewRuntime.renderTask = null;
  }
  if (parsePreviewRuntime.loadingTask) {
    try {
      await parsePreviewRuntime.loadingTask.destroy();
    } catch (_error) {
      // Ignore loading task cleanup failures.
    }
    parsePreviewRuntime.loadingTask = null;
  }
  if (parsePreviewRuntime.documentProxy) {
    try {
      await parsePreviewRuntime.documentProxy.destroy();
    } catch (_error) {
      // Ignore document cleanup failures.
    }
  }
  parsePreviewRuntime.documentKey = "";
  parsePreviewRuntime.documentProxy = null;
  appState.parsePreviewPageCount = 0;
  if (parsePreviewDocument) {
    parsePreviewDocument.classList.add("hidden");
    parsePreviewDocument.style.width = "";
    parsePreviewDocument.style.height = "";
  }
  if (parsePreviewSurface) {
    parsePreviewSurface.classList.add("hidden");
    parsePreviewSurface.width = 0;
    parsePreviewSurface.height = 0;
    parsePreviewSurface.style.width = "";
    parsePreviewSurface.style.height = "";
  }
  if (parsePreviewHotspots) {
    parsePreviewHotspots.style.width = "";
    parsePreviewHotspots.style.height = "";
    parsePreviewHotspots.innerHTML = "";
  }
}

async function ensureParsePdfDocument(item, previewUrl) {
  const key = getParsePreviewDocumentKey(item, previewUrl);
  if (parsePreviewRuntime.documentProxy && parsePreviewRuntime.documentKey === key) {
    return parsePreviewRuntime.documentProxy;
  }

  await clearParsePreviewDocument();
  const pdfjs = await getPdfJsLib();
  const loadingTask = pdfjs.getDocument({
    url: previewUrl,
    isEvalSupported: false
  });
  parsePreviewRuntime.loadingTask = loadingTask;
  const documentProxy = await loadingTask.promise;
  parsePreviewRuntime.loadingTask = null;
  parsePreviewRuntime.documentKey = key;
  parsePreviewRuntime.documentProxy = documentProxy;
  appState.parsePreviewPageCount = Number(documentProxy.numPages) || 0;
  return documentProxy;
}

async function renderParsePdfPreview(item, previewUrl) {
  if (!parsePreviewDocument || !parsePreviewSurface || !parsePreviewHotspots) return;
  const requestToken = ++parsePreviewRuntime.requestToken;
  const documentProxy = await ensureParsePdfDocument(item, previewUrl);
  if (requestToken !== parsePreviewRuntime.requestToken) return;

  const pageCount = Math.max(1, Number(documentProxy.numPages) || 1);
  const targetPageIndex = Math.max(0, Math.min(pageCount - 1, getSelectedPreviewAnchorPageIndex(item)));
  appState.parsePreviewPageIndex = targetPageIndex;
  appState.parsePreviewPageCount = pageCount;

  const page = await documentProxy.getPage(targetPageIndex + 1);
  if (requestToken !== parsePreviewRuntime.requestToken) return;

  const rotation = normalizeParsePreviewRotation(appState.parsePreviewRotation);
  const scale = Math.max(0.4, clampParsePreviewZoom(appState.parsePreviewZoom) / 100);
  const viewport = page.getViewport({ scale, rotation });
  const outputScale = window.devicePixelRatio || 1;
  const canvas = parsePreviewSurface;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("canvas context unavailable");

  canvas.classList.remove("hidden");
  canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
  canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  parsePreviewDocument.style.width = `${viewport.width}px`;
  parsePreviewDocument.style.height = `${viewport.height}px`;
  parsePreviewHotspots.style.width = `${viewport.width}px`;
  parsePreviewHotspots.style.height = `${viewport.height}px`;
  context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
  context.clearRect(0, 0, viewport.width, viewport.height);

  if (parsePreviewRuntime.renderTask) {
    try {
      parsePreviewRuntime.renderTask.cancel();
    } catch (_error) {
      // Ignore canceled render tasks.
    }
  }

  const renderTask = page.render({
    canvasContext: context,
    viewport
  });
  parsePreviewRuntime.renderTask = renderTask;
  try {
    await renderTask.promise;
  } catch (error) {
    if (error?.name === "RenderingCancelledException") {
      return;
    }
    throw error;
  }
  if (requestToken !== parsePreviewRuntime.requestToken) return;
  parsePreviewRuntime.renderTask = null;
  parsePreviewDocument.classList.remove("hidden");
  if (parsePreviewCanvasEmpty) {
    parsePreviewCanvasEmpty.classList.add("hidden");
  }
}

function isTypingTarget(target) {
  const node = target instanceof HTMLElement ? target : null;
  if (!node) return false;
  if (node.isContentEditable) return true;
  const tagName = String(node.tagName || "").toUpperCase();
  return ["INPUT", "TEXTAREA", "SELECT"].includes(tagName);
}

function getNextParseManualSeamId(item) {
  const existing = new Set((Array.isArray(item?.seams) ? item.seams : []).map((seam) => String(seam?.weld_id || "").trim()));
  let index = 1;
  while (existing.has(`W-MANUAL-${String(index).padStart(3, "0")}`)) {
    index += 1;
  }
  return `W-MANUAL-${String(index).padStart(3, "0")}`;
}

function decodeBase64ToBytes(value) {
  const encoded = String(value || "").trim();
  if (!encoded) return new Uint8Array();
  const binary = window.atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function updateParseQueueItem(itemId, updater) {
  let changed = false;
  appState.parseQueue = appState.parseQueue.map((item) => {
    if (item.id !== itemId) return item;
    changed = true;
    return typeof updater === "function" ? updater(item) : { ...item, ...updater };
  });
  return changed;
}

async function ensureParsePreviewAsset(item) {
  const targetId = String(item?.id || "").trim();
  if (!targetId) return;
  const target = appState.parseQueue.find((row) => row.id === targetId);
  if (
    !target ||
    target.fileType !== "pdf" ||
    target.virtual ||
    !isTauriRuntime() ||
    !target.path ||
    target.previewUrl ||
    target.previewLoadState === "loading"
  ) {
    return;
  }

  updateParseQueueItem(targetId, {
    previewLoadState: "loading",
    previewError: ""
  });
  renderParseSelectedFilePanel();

  try {
    const payload = await invokeTauriCommand("read_drawing_preview", {
      path: target.path
    });
    const decoded = JSON.parse(payload);
    const bytes = decodeBase64ToBytes(decoded?.base64);
    if (!bytes.length) {
      throw new Error("empty preview payload");
    }
    const mimeType = String(decoded?.mime_type || "application/pdf");
    const previewUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    let applied = false;
    appState.parseQueue = appState.parseQueue.map((entry) => {
      if (entry.id !== targetId) return entry;
      applied = true;
      revokeParsePreviewUrl(entry);
      return {
        ...entry,
        previewUrl,
        previewMimeType: mimeType,
        previewLoadState: "ready",
        previewError: ""
      };
    });
    if (!applied) {
      URL.revokeObjectURL(previewUrl);
    }
  } catch (error) {
    updateParseQueueItem(targetId, {
      previewLoadState: "failed",
      previewError: String(error)
    });
    addEvent(`图纸预览加载失败: ${basenameFromPath(target.path) || targetId}`);
  }

  renderParseSelectedFilePanel();
}

function revokeParsePreviewUrl(item) {
  const url = String(item?.previewUrl || "");
  if (!url || !url.startsWith("blob:")) return;
  try {
    URL.revokeObjectURL(url);
  } catch (_error) {
    // Ignore object URL cleanup failures.
  }
}

function releaseParsePreviewUrls(queue = []) {
  (Array.isArray(queue) ? queue : []).forEach((item) => revokeParsePreviewUrl(item));
}

function getFallbackHotspotPosition(index, total = 1, kind = "seam") {
  const safeTotal = Math.max(1, Number(total) || 1);
  const column = index % Math.min(4, safeTotal);
  const row = Math.floor(index / 4);
  const offset = kind === "candidate" ? 0.04 : 0;
  return {
    x: Math.min(0.88, 0.18 + column * 0.18 + offset),
    y: Math.min(0.84, 0.24 + row * 0.16 + offset),
    w: 0.12,
    h: 0.08,
    page_index: 0
  };
}

function resolveHotspotAnchor(anchor, fallbackIndex, fallbackTotal, kind = "seam") {
  return normalizePreviewAnchor(anchor) || getFallbackHotspotPosition(fallbackIndex, fallbackTotal, kind);
}

function getAnchorStyle(anchor, fallbackIndex, fallbackTotal, kind = "seam") {
  const target = rotatePreviewPoint(resolveHotspotAnchor(anchor, fallbackIndex, fallbackTotal, kind));
  return {
    left: `${Math.max(0, Math.min(100, target.x * 100))}%`,
    top: `${Math.max(0, Math.min(100, target.y * 100))}%`
  };
}

function getHotspotPlacementClass(anchor, fallbackIndex, fallbackTotal, kind = "seam") {
  const target = rotatePreviewPoint(resolveHotspotAnchor(anchor, fallbackIndex, fallbackTotal, kind));
  const horizontal = target.x > 0.76 ? "left" : "right";
  const vertical = target.y < 0.18 ? "below" : "above";
  return `is-place-${vertical}-${horizontal}`;
}

function getParseSelectedAnchorSeed(kind, itemId) {
  const selectedItem = getSelectedParseQueueItem();
  if (!selectedItem || !itemId) return null;
  if (kind === "seam") {
    const seam = (selectedItem.seams || []).find((entry) => String(entry.weld_id || "") === String(itemId));
    return normalizePreviewAnchor(seam?.anchor_bbox);
  }
  if (kind === "candidate") {
    const candidate = (selectedItem.candidates || []).find((entry) => String(entry.candidate_id || "") === String(itemId));
    return normalizePreviewAnchor(candidate?.anchor_bbox);
  }
  return null;
}

function setParseItemAnchorById(kind, itemId, anchor, options = {}) {
  const { silent = false, render = true, announce = true } = options;
  const normalizedAnchor = normalizePreviewAnchor(anchor);
  if (!normalizedAnchor) return false;
  const selectedItem = getSelectedParseQueueItem();
  if (!selectedItem) return false;
  const targetId = String(itemId || "").trim();
  if (!targetId) return false;
  let changed = false;

  appState.parseQueue = appState.parseQueue.map((item) => {
    if (item.id !== selectedItem.id) return item;
    if (kind === "seam") {
      return {
        ...item,
        seams: (item.seams || []).map((seam) => {
          if (String(seam.weld_id || "") !== targetId) return seam;
          changed = true;
          return { ...seam, anchor_bbox: normalizedAnchor };
        })
      };
    }
    if (kind === "candidate") {
      return {
        ...item,
        candidates: (item.candidates || []).map((candidate) => {
          if (String(candidate.candidate_id || "") !== targetId) return candidate;
          changed = true;
          return { ...candidate, anchor_bbox: normalizedAnchor };
        })
      };
    }
    return item;
  });

  if (!changed) return false;
  if (render) renderParseSelectedFilePanel();
  if (!silent && announce) {
    addEvent(kind === "seam" ? `已标注焊缝位置: ${targetId}` : `已标注候选位置: ${targetId}`);
  }
  return true;
}

function normalizeParseSeamReviewStatus(status, confidence = 0) {
  const value = String(status || "").trim().toLowerCase();
  if (["confirmed", "changed", "pending", "uncertain"].includes(value)) {
    return value;
  }
  return Number(confidence) < 0.75 ? "uncertain" : "pending";
}

function normalizeParseSeamItem(item = {}) {
  const confidence = Number(item.confidence_score) || 0;
  return {
    ...item,
    weld_id: String(item.weld_id || ""),
    review_status: normalizeParseSeamReviewStatus(item.review_status, confidence),
    anchor_bbox: normalizePreviewAnchor(item.anchor_bbox)
  };
}

function getParseSeamReviewMeta(seam) {
  const reviewStatus = normalizeParseSeamReviewStatus(seam?.review_status, seam?.confidence_score);
  if (reviewStatus === "uncertain") {
    return { label: "可疑", type: "danger", hotspotClass: "is-warn" };
  }
  if (reviewStatus === "confirmed") {
    return { label: "已确认", type: "ok", hotspotClass: "" };
  }
  if (reviewStatus === "changed") {
    return { label: "已变更", type: "warn", hotspotClass: "is-warn" };
  }
  return { label: "待确认", type: "warn", hotspotClass: "" };
}

function countFlaggedParseSeams(item) {
  return (Array.isArray(item?.seams) ? item.seams : []).filter(
    (seam) => normalizeParseSeamReviewStatus(seam?.review_status, seam?.confidence_score) === "uncertain"
  ).length;
}

function normalizeParseCandidateReviewStatus(status, confidence = 0) {
  const value = String(status || "").trim().toLowerCase();
  if (["pending", "accepted", "rejected", "uncertain", "merged"].includes(value)) {
    return value;
  }
  return Number(confidence) < 0.75 ? "uncertain" : "pending";
}

function normalizeParseCandidateItem(item = {}) {
  const confidence = Number(item.confidence_score) || 0;
  return {
    ...item,
    candidate_id: String(item.candidate_id || ""),
    draw_ref: String(item.draw_ref || ""),
    candidate_type: String(item.candidate_type || item.joint_geometry || "unknown"),
    joint_geometry: String(item.joint_geometry || item.candidate_type || "unknown"),
    material_guess_a: String(item.material_guess_a || ""),
    material_guess_b: String(item.material_guess_b || item.material_guess_a || ""),
    position_guess: String(item.position_guess || ""),
    weld_symbol_guess: String(item.weld_symbol_guess || ""),
    review_status: normalizeParseCandidateReviewStatus(item.review_status, confidence),
    anchor_bbox: normalizePreviewAnchor(item.anchor_bbox),
    evidence: Array.isArray(item.evidence) ? item.evidence : []
  };
}

function normalizePreviewAnchor(anchor) {
  if (!anchor || typeof anchor !== "object") return null;
  const x = Number(anchor.x);
  const y = Number(anchor.y);
  const w = Number(anchor.w);
  const h = Number(anchor.h);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x,
    y,
    w: Number.isFinite(w) ? w : 0.08,
    h: Number.isFinite(h) ? h : 0.06,
    page_index: Number.isFinite(Number(anchor.page_index)) ? Number(anchor.page_index) : 0
  };
}

function getParseCandidateReviewMeta(candidate) {
  const reviewStatus = normalizeParseCandidateReviewStatus(candidate?.review_status, candidate?.confidence_score);
  if (reviewStatus === "accepted") return { label: "已接受", type: "ok", hotspotClass: "is-candidate-accepted" };
  if (reviewStatus === "rejected") return { label: "已忽略", type: "danger", hotspotClass: "is-error" };
  if (reviewStatus === "uncertain") return { label: "可疑", type: "danger", hotspotClass: "is-candidate" };
  if (reviewStatus === "merged") return { label: "已合并", type: "ok", hotspotClass: "is-candidate-accepted" };
  return { label: "待确认", type: "warn", hotspotClass: "is-candidate" };
}

function formatParseCandidateGuess(candidate) {
  const materials = [candidate?.material_guess_a, candidate?.material_guess_b].filter(Boolean).join(" / ") || "-";
  const thicknessA = Number(candidate?.thickness_guess_a_mm);
  const thicknessB = Number(candidate?.thickness_guess_b_mm);
  const thickness = Number.isFinite(thicknessA)
    ? Number.isFinite(thicknessB) && thicknessB !== thicknessA
      ? `${thicknessA.toFixed(1)} / ${thicknessB.toFixed(1)}`
      : thicknessA.toFixed(1)
    : "-";
  return `${materials} · ${thickness}mm · ${candidate?.weld_symbol_guess || "-"} · ${candidate?.position_guess || "-"}`;
}

function getSelectedParseQueueItem() {
  const selectedId = String(appState.parseSelectedQueueId || "").trim();
  if (selectedId) {
    const found = appState.parseQueue.find((item) => item.id === selectedId);
    if (found) return found;
  }
  return appState.parseQueue[0] || null;
}

function syncSelectedParseQueue() {
  if (!appState.parseQueue.length) {
    appState.parseSelectedQueueId = "";
    appState.parseSelectedCandidateId = "";
    return null;
  }
  const selected = getSelectedParseQueueItem();
  appState.parseSelectedQueueId = selected?.id || "";
  return selected;
}

function getParseQueueIndex(queueId) {
  return appState.parseQueue.findIndex((item) => item.id === String(queueId || "").trim());
}

function setSelectedParseQueue(queueId, options = {}) {
  const { silent = false } = options;
  const target = appState.parseQueue.find((item) => item.id === String(queueId || "").trim());
  if (!target) return false;
  stopParseHotspotDrag({ announce: false });
  closeParseQuickEditModal({ silent: true });
  appState.parsePreviewAddSeamMode = false;
  appState.parseShortcutPanelVisible = false;
  appState.parsePreviewPageIndex = 0;
  appState.parseSelectedQueueId = target.id;
  syncSelectedParseSeam(target);
  syncSelectedParseCandidate(target);
  renderParseWorkspace();
  if (!silent) {
    addEvent(`已选中图纸 ${target.fileName || target.path}`);
  }
  return true;
}

function getParseErrorsForItem(item) {
  if (!item) return [];
  if (item.status !== "failed") return [];
  return [
    {
      code: item.errorCode || "PARSE_FAILED",
      message: item.errorMessage || "解析失败",
      path: item.path || item.fileName
    }
  ];
}

function formatParseSourceLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "desktop") return "桌面端";
  if (normalized === "browser") return "浏览器";
  if (normalized === "drop") return "拖拽";
  if (normalized === "sample") return "示例";
  return normalized || "-";
}

function normalizeParseReviewStatusMeta(status) {
  const value = String(status || "").trim().toLowerCase();
  if (value === "accepted") return { label: "已接受", type: "ok" };
  if (value === "rejected") return { label: "已忽略", type: "danger" };
  return { label: "待确认", type: "warn" };
}

function setSelectedParseSeam(seamId, options = {}) {
  const { silent = false } = options;
  const selectedItem = getSelectedParseQueueItem();
  const seams = Array.isArray(selectedItem?.seams) ? selectedItem.seams : [];
  const target = seams.find((item) => String(item.weld_id || "") === String(seamId || "").trim());
  appState.parseSelectedSeamId = target?.weld_id || "";
  appState.parseSelectedCandidateId = "";
  if (target?.anchor_bbox) {
    appState.parsePreviewPageIndex = getPreviewAnchorPageIndex(target.anchor_bbox);
  }
  renderParseSelectedFilePanel();
  if (target && !silent) {
    addEvent(`已定位焊缝 ${target.weld_id}`);
  }
  return Boolean(target);
}

function setSelectedParseSeamReviewStatus(reviewStatus, options = {}) {
  const { silent = false } = options;
  const selectedItem = getSelectedParseQueueItem();
  const selectedSeamId = String(appState.parseSelectedSeamId || "").trim();
  if (!selectedItem || !selectedSeamId) return false;
  let changed = false;
  appState.parseQueue = appState.parseQueue.map((item) => {
    if (item.id !== selectedItem.id) return item;
    return {
      ...item,
      seams: (item.seams || []).map((seam) => {
        if (String(seam.weld_id || "") !== selectedSeamId) return seam;
        changed = true;
        return {
          ...seam,
          review_status: normalizeParseSeamReviewStatus(reviewStatus, seam.confidence_score)
        };
      })
    };
  });
  if (!changed) return false;
  renderParseWorkspace();
  if (!silent) {
    const seam = getSelectedParseQueueItem()?.seams?.find((item) => String(item.weld_id || "") === selectedSeamId);
    const seamMeta = getParseSeamReviewMeta(seam);
    addEvent(`焊缝复核状态已更新: ${selectedSeamId} / ${seamMeta.label}`);
  }
  return true;
}

function setSelectedParseCandidate(candidateId, options = {}) {
  const { silent = false } = options;
  const selectedItem = getSelectedParseQueueItem();
  const candidates = Array.isArray(selectedItem?.candidates) ? selectedItem.candidates : [];
  const target = candidates.find((item) => String(item.candidate_id || "") === String(candidateId || "").trim());
  appState.parseSelectedCandidateId = target?.candidate_id || "";
  appState.parseSelectedSeamId = "";
  if (target?.anchor_bbox) {
    appState.parsePreviewPageIndex = getPreviewAnchorPageIndex(target.anchor_bbox);
  }
  renderParseSelectedFilePanel();
  if (target && !silent) {
    addEvent(`已定位候选焊缝 ${target.candidate_id}`);
  }
  return Boolean(target);
}

function syncSelectedParseCandidate(item) {
  const candidates = Array.isArray(item?.candidates) ? item.candidates : [];
  if (!candidates.length) {
    appState.parseSelectedCandidateId = "";
    return "";
  }
  const current = String(appState.parseSelectedCandidateId || "").trim();
  if (current && candidates.some((candidate) => String(candidate.candidate_id || "") === current)) {
    return current;
  }
  if (String(appState.parseSelectedSeamId || "").trim()) {
    appState.parseSelectedCandidateId = "";
    return "";
  }
  appState.parseSelectedCandidateId = String(candidates[0].candidate_id || "");
  return appState.parseSelectedCandidateId;
}

function setParseCandidateReviewStatus(candidateId, reviewStatus, options = {}) {
  const { silent = false } = options;
  const selectedItem = getSelectedParseQueueItem();
  const normalizedId = String(candidateId || "").trim();
  if (!selectedItem || !normalizedId) return false;
  let changed = false;
  appState.parseQueue = appState.parseQueue.map((item) => {
    if (item.id !== selectedItem.id) return item;
    return {
      ...item,
      candidates: (item.candidates || []).map((candidate) => {
        if (String(candidate.candidate_id || "") !== normalizedId) return candidate;
        changed = true;
        return {
          ...candidate,
          review_status: normalizeParseCandidateReviewStatus(reviewStatus, candidate.confidence_score)
        };
      })
    };
  });
  if (!changed) return false;
  appState.parseSelectedCandidateId = normalizedId;
  renderParseWorkspace();
  if (!silent) {
    const candidate = getSelectedParseQueueItem()?.candidates?.find((item) => String(item.candidate_id || "") === normalizedId);
    const meta = getParseCandidateReviewMeta(candidate);
    addEvent(`候选焊缝状态已更新: ${normalizedId} / ${meta.label}`);
  }
  return true;
}

function getParseQuickEditTarget() {
  const state = uiState.parseQuickEdit;
  const selectedItem = getSelectedParseQueueItem();
  if (!state || !selectedItem) return null;
  const kind = String(state.kind || "").trim();
  const itemId = String(state.itemId || "").trim();
  if (kind === "seam") {
    const target = (selectedItem.seams || []).find((item) => String(item?.weld_id || "") === itemId);
    return target ? { kind, itemId, item: target, queueItem: selectedItem } : null;
  }
  if (kind === "candidate") {
    const target = (selectedItem.candidates || []).find((item) => String(item?.candidate_id || "") === itemId);
    return target ? { kind, itemId, item: target, queueItem: selectedItem } : null;
  }
  return null;
}

function closeParseQuickEditModal(options = {}) {
  const { silent = false } = options;
  if (!uiState.parseQuickEdit && parseQuickModal?.classList.contains("hidden")) return false;
  uiState.parseQuickEdit = null;
  if (parseQuickModal) parseQuickModal.classList.add("hidden");
  if (parseQuickBody) parseQuickBody.innerHTML = "";
  if (!silent) {
    addEvent("已关闭焊缝快速查看");
  }
  return true;
}

function buildParseQuickReadOnlyField(label, value) {
  return `
    <div class="parse-quick-field">
      <label>${label}</label>
      <div class="parse-quick-readonly">${escapeHtml(value || "-")}</div>
    </div>
  `;
}

function buildParseQuickInputField(label, name, value, options = {}) {
  const { type = "text", step = "", min = "", max = "", placeholder = "" } = options;
  const stepAttr = step !== "" ? ` step="${escapeHtml(step)}"` : "";
  const minAttr = min !== "" ? ` min="${escapeHtml(min)}"` : "";
  const maxAttr = max !== "" ? ` max="${escapeHtml(max)}"` : "";
  const placeholderAttr = placeholder ? ` placeholder="${escapeHtml(placeholder)}"` : "";
  return `
    <div class="parse-quick-field">
      <label for="parse-quick-${escapeHtml(name)}">${label}</label>
      <input id="parse-quick-${escapeHtml(name)}" data-parse-quick-field="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(
        value ?? ""
      )}"${stepAttr}${minAttr}${maxAttr}${placeholderAttr} />
    </div>
  `;
}

function buildParseQuickSelectField(label, name, value, options) {
  const currentValue = String(value || "");
  const optionHtml = (Array.isArray(options) ? options : [])
    .map((option) => {
      const optionValue = String(option.value || "");
      const selected = optionValue === currentValue ? " selected" : "";
      return `<option value="${escapeHtml(optionValue)}"${selected}>${escapeHtml(option.label || optionValue)}</option>`;
    })
    .join("");
  return `
    <div class="parse-quick-field">
      <label for="parse-quick-${escapeHtml(name)}">${label}</label>
      <select id="parse-quick-${escapeHtml(name)}" data-parse-quick-field="${escapeHtml(name)}">${optionHtml}</select>
    </div>
  `;
}

function renderParseQuickEditModal() {
  if (!parseQuickModal || !parseQuickBody || !parseQuickTitle || !parseQuickMeta) return;
  const target = getParseQuickEditTarget();
  if (!target) {
    closeParseQuickEditModal({ silent: true });
    return;
  }

  const { kind, item, queueItem } = target;
  const isSeam = kind === "seam";
  parseQuickTitle.textContent = isSeam ? `焊缝 ${item.weld_id || "-"}` : `候选 ${item.candidate_id || "-"}`;
  parseQuickMeta.textContent = `${queueItem.fileName || queueItem.path || "-"} · ${isSeam ? "显式/手动焊缝" : "候选焊缝"} · 双击图上标注可快速浏览和修改`;

  if (isSeam) {
    parseQuickBody.innerHTML = `
      <div class="parse-quick-grid">
        ${buildParseQuickReadOnlyField("焊缝号", item.weld_id)}
        ${buildParseQuickReadOnlyField("来源", item.source_kind || "explicit")}
        ${buildParseQuickReadOnlyField("图纸来源", item.draw_ref || "-")}
        ${buildParseQuickInputField("材质", "material_spec", item.material_spec || "", { placeholder: "例如 P-No.1 / P-No.8" })}
        ${buildParseQuickInputField("厚度(mm)", "thickness_mm", item.thickness_mm ?? "", { type: "number", step: "0.1", min: "0" })}
        ${buildParseQuickInputField("位置", "position_code", item.position_code || "", { placeholder: "例如 1G / 2G / 6G" })}
        ${buildParseQuickInputField("焊缝符号", "weld_symbol", item.weld_symbol || "", { placeholder: "BW / FW" })}
        ${buildParseQuickInputField("置信度", "confidence_score", item.confidence_score ?? "", { type: "number", step: "0.01", min: "0", max: "1" })}
        ${buildParseQuickSelectField("复核状态", "review_status", item.review_status || "pending", [
          { value: "pending", label: "待确认" },
          { value: "confirmed", label: "已确认" },
          { value: "changed", label: "已变更" },
          { value: "uncertain", label: "可疑" }
        ])}
      </div>
    `;
  } else {
    const evidenceHtml = Array.isArray(item.evidence) && item.evidence.length
      ? item.evidence
          .map(
            (evidence) => `
              <li>
                <strong>${escapeHtml(evidence.summary || evidence.type || "-")}</strong><br />
                <span>${escapeHtml(evidence.source_ref || "-")} / ${Number.isFinite(Number(evidence.score)) ? Number(evidence.score).toFixed(2) : "-"}</span>
              </li>
            `
          )
          .join("")
      : "<li>当前没有证据摘要</li>";
    parseQuickBody.innerHTML = `
      <div class="parse-quick-grid">
        ${buildParseQuickReadOnlyField("候选ID", item.candidate_id)}
        ${buildParseQuickReadOnlyField("接头类型", item.candidate_type || item.joint_geometry || "-")}
        ${buildParseQuickReadOnlyField("图纸来源", item.draw_ref || "-")}
        ${buildParseQuickInputField("建议焊缝号", "accepted_weld_id", item.accepted_weld_id || "", { placeholder: "例如 W-101" })}
        ${buildParseQuickInputField("母材A", "material_guess_a", item.material_guess_a || "", { placeholder: "P-No.1" })}
        ${buildParseQuickInputField("母材B", "material_guess_b", item.material_guess_b || "", { placeholder: "P-No.8" })}
        ${buildParseQuickInputField("厚度A(mm)", "thickness_guess_a_mm", item.thickness_guess_a_mm ?? "", { type: "number", step: "0.1", min: "0" })}
        ${buildParseQuickInputField("厚度B(mm)", "thickness_guess_b_mm", item.thickness_guess_b_mm ?? "", { type: "number", step: "0.1", min: "0" })}
        ${buildParseQuickInputField("位置", "position_guess", item.position_guess || "", { placeholder: "1G / 2G / 6G" })}
        ${buildParseQuickInputField("焊缝符号", "weld_symbol_guess", item.weld_symbol_guess || "", { placeholder: "BW / FW" })}
        ${buildParseQuickInputField("置信度", "confidence_score", item.confidence_score ?? "", { type: "number", step: "0.01", min: "0", max: "1" })}
        ${buildParseQuickSelectField("复核状态", "review_status", item.review_status || "pending", [
          { value: "pending", label: "待确认" },
          { value: "accepted", label: "已接受" },
          { value: "rejected", label: "已忽略" },
          { value: "uncertain", label: "可疑" },
          { value: "merged", label: "已合并" }
        ])}
      </div>
      <section class="parse-quick-panel">
        <h4>识别证据</h4>
        <ul class="parse-quick-evidence">${evidenceHtml}</ul>
      </section>
    `;
  }

  parseQuickModal.classList.remove("hidden");
}

function openParseQuickEditModal(kind, itemId, options = {}) {
  const { silent = false } = options;
  const normalizedKind = String(kind || "").trim();
  const normalizedId = String(itemId || "").trim();
  if (!normalizedKind || !normalizedId) return false;
  if (normalizedKind === "seam") {
    if (!setSelectedParseSeam(normalizedId, { silent: true })) return false;
  } else if (normalizedKind === "candidate") {
    if (!setSelectedParseCandidate(normalizedId, { silent: true })) return false;
  } else {
    return false;
  }
  uiState.parseQuickEdit = { kind: normalizedKind, itemId: normalizedId };
  renderParseQuickEditModal();
  if (!silent) {
    addEvent(`已打开${normalizedKind === "seam" ? "焊缝" : "候选焊缝"}快速查看: ${normalizedId}`);
  }
  return true;
}

function saveParseQuickEditModal() {
  const target = getParseQuickEditTarget();
  if (!target || !parseQuickBody) return false;
  const values = {};
  parseQuickBody.querySelectorAll("[data-parse-quick-field]").forEach((node) => {
    values[node.dataset.parseQuickField] = typeof node.value === "string" ? node.value.trim() : "";
  });

  let changed = false;
  appState.parseQueue = appState.parseQueue.map((queueItem) => {
    if (queueItem.id !== target.queueItem.id) return queueItem;
    if (target.kind === "seam") {
      return {
        ...queueItem,
        seams: (queueItem.seams || []).map((seam) => {
          if (String(seam?.weld_id || "") !== target.itemId) return seam;
          changed = true;
          return normalizeParseSeamItem({
            ...seam,
            material_spec: values.material_spec || seam.material_spec || "",
            thickness_mm: Math.max(0, Number(values.thickness_mm) || 0),
            position_code: values.position_code || seam.position_code || "",
            weld_symbol: values.weld_symbol || seam.weld_symbol || "",
            confidence_score: Math.max(0, Math.min(1, Number(values.confidence_score) || 0)),
            review_status: normalizeParseSeamReviewStatus(values.review_status, Number(values.confidence_score))
          });
        })
      };
    }
    return {
      ...queueItem,
      candidates: (queueItem.candidates || []).map((candidate) => {
        if (String(candidate?.candidate_id || "") !== target.itemId) return candidate;
        changed = true;
        return normalizeParseCandidateItem({
          ...candidate,
          accepted_weld_id: values.accepted_weld_id || "",
          material_guess_a: values.material_guess_a || candidate.material_guess_a || "",
          material_guess_b: values.material_guess_b || candidate.material_guess_b || "",
          thickness_guess_a_mm: Math.max(0, Number(values.thickness_guess_a_mm) || 0),
          thickness_guess_b_mm: Math.max(0, Number(values.thickness_guess_b_mm) || 0),
          position_guess: values.position_guess || candidate.position_guess || "",
          weld_symbol_guess: values.weld_symbol_guess || candidate.weld_symbol_guess || "",
          confidence_score: Math.max(0, Math.min(1, Number(values.confidence_score) || 0)),
          review_status: normalizeParseCandidateReviewStatus(values.review_status, Number(values.confidence_score))
        });
      })
    };
  });

  if (!changed) return false;
  rebuildParseResultFromQueue(appState.parseResult?.traceId || "");
  renderParseWorkspace();
  closeParseQuickEditModal({ silent: true });
  addEvent(`已保存${target.kind === "seam" ? "焊缝" : "候选焊缝"}快速修改: ${target.itemId}`);
  return true;
}

function setSelectedParseItemAnchor(anchor) {
  const selectedSeamId = String(appState.parseSelectedSeamId || "").trim();
  const selectedCandidateId = String(appState.parseSelectedCandidateId || "").trim();
  if (selectedSeamId) {
    return setParseItemAnchorById("seam", selectedSeamId, anchor);
  }
  if (selectedCandidateId) {
    return setParseItemAnchorById("candidate", selectedCandidateId, anchor);
  }
  return false;
}

function buildDragAnchorFromPointer(event, kind, itemId) {
  if (!parsePreviewHotspots) return null;
  const rect = parsePreviewHotspots.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const seed = getParseSelectedAnchorSeed(kind, itemId);
  const point = unrotatePreviewPoint({
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
  });
  return {
    x: point.x,
    y: point.y,
    w: Number(seed?.w) || (kind === "seam" ? 0.12 : 0.1),
    h: Number(seed?.h) || (kind === "seam" ? 0.08 : 0.07),
    page_index: Number.isFinite(Number(seed?.page_index))
      ? Number(seed.page_index)
      : Math.max(0, Number(appState.parsePreviewPageIndex) || 0)
  };
}

function stopParseHotspotDrag(options = {}) {
  const { announce = true } = options;
  const drag = appState.parsePreviewDrag;
  if (!drag) return;
  appState.parsePreviewDrag = null;
  if (drag.moved) {
    appState.parsePreviewSuppressClickUntil = Date.now() + 250;
  }
  renderParseSelectedFilePanel();
  if (announce && drag.moved) {
    addEvent(drag.kind === "seam" ? `已拖动焊缝标注: ${drag.itemId}` : `已拖动候选标注: ${drag.itemId}`);
  }
}

function createManualParseSeamAtAnchor(anchor, options = {}) {
  const { silent = false } = options;
  const normalizedAnchor = normalizePreviewAnchor(anchor);
  const selectedItem = getSelectedParseQueueItem();
  if (!normalizedAnchor || !selectedItem) return false;
  const weldId = getNextParseManualSeamId(selectedItem);
  const drawRef = selectedItem.fileName || basenameFromPath(selectedItem.path || "") || "manual";
  appState.parseQueue = appState.parseQueue.map((item) => {
    if (item.id !== selectedItem.id) return item;
    return {
      ...item,
      seams: [
        ...(item.seams || []),
        normalizeParseSeamItem({
          weld_id: weldId,
          draw_ref: drawRef,
          weld_symbol: "FW",
          material_spec: "待确认",
          thickness_mm: 0,
          position_code: "待确认",
          confidence_score: 0.35,
          review_status: "uncertain",
          anchor_bbox: normalizedAnchor,
          source_kind: "manual"
        })
      ]
    };
  });
  rebuildParseResultFromQueue(appState.parseResult?.traceId || "");
  appState.parseSelectedSeamId = weldId;
  appState.parseSelectedCandidateId = "";
  renderParseSelectedFilePanel();
  if (!silent) {
    addEvent(`已新增手动焊缝: ${weldId}`);
  }
  return true;
}

function isManualParseSeam(seam) {
  return String(seam?.source_kind || "").trim().toLowerCase() === "manual";
}

function deleteSelectedManualParseSeam(options = {}) {
  const { silent = false } = options;
  const selectedItem = getSelectedParseQueueItem();
  const selectedSeamId = String(appState.parseSelectedSeamId || "").trim();
  if (!selectedItem || !selectedSeamId) return false;
  const targetSeam = (selectedItem.seams || []).find((seam) => String(seam?.weld_id || "") === selectedSeamId);
  if (!isManualParseSeam(targetSeam)) return false;

  let removed = false;
  appState.parseQueue = appState.parseQueue.map((item) => {
    if (item.id !== selectedItem.id) return item;
    const nextSeams = (item.seams || []).filter((seam) => {
      const match = String(seam?.weld_id || "") === selectedSeamId;
      if (match) removed = true;
      return !match;
    });
    return removed ? { ...item, seams: nextSeams } : item;
  });

  if (!removed) return false;
  rebuildParseResultFromQueue(appState.parseResult?.traceId || "");
  appState.parseSelectedSeamId = "";
  appState.parseSelectedCandidateId = "";
  renderParseWorkspace();
  if (!silent) {
    addEvent(`已删除手动焊缝: ${selectedSeamId}`);
  }
  return true;
}

function setParsePreviewAddSeamMode(enabled, options = {}) {
  const { silent = false } = options;
  const nextValue = Boolean(enabled);
  if (appState.parsePreviewAddSeamMode === nextValue) return false;
  appState.parsePreviewAddSeamMode = nextValue;
  renderParseSelectedFilePanel();
  if (!silent) {
    addEvent(nextValue ? "已进入新增焊缝模式，点击图纸空白处即可放置" : "已退出新增焊缝模式");
  }
  return true;
}

function toggleParsePreviewAddSeamMode(options = {}) {
  return setParsePreviewAddSeamMode(!appState.parsePreviewAddSeamMode, options);
}

function setParseShortcutPanelVisible(visible, options = {}) {
  const { silent = false } = options;
  const nextValue = Boolean(visible);
  if (appState.parseShortcutPanelVisible === nextValue) return false;
  appState.parseShortcutPanelVisible = nextValue;
  renderParseSelectedFilePanel();
  if (!silent) {
    addEvent(nextValue ? "已打开快捷键面板" : "已关闭快捷键面板");
  }
  return true;
}

function toggleParseShortcutPanel(options = {}) {
  return setParseShortcutPanelVisible(!appState.parseShortcutPanelVisible, options);
}

function rotateParsePreview(delta, options = {}) {
  const { silent = false } = options;
  const selectedItem = getSelectedParseQueueItem();
  if (!selectedItem || selectedItem.fileType !== "pdf") return false;
  appState.parsePreviewRotation = normalizeParsePreviewRotation(appState.parsePreviewRotation + Number(delta || 0));
  renderParseSelectedFilePanel();
  if (!silent) {
    addEvent(`图纸已旋转到 ${appState.parsePreviewRotation}°`);
  }
  return true;
}

function syncSelectedParseSeam(item) {
  const seams = Array.isArray(item?.seams) ? item.seams : [];
  if (!seams.length) {
    appState.parseSelectedSeamId = "";
    return "";
  }
  const current = String(appState.parseSelectedSeamId || "").trim();
  if (current && seams.some((seam) => String(seam.weld_id || "") === current)) {
    return current;
  }
  if (String(appState.parseSelectedCandidateId || "").trim()) {
    appState.parseSelectedSeamId = "";
    return "";
  }
  appState.parseSelectedSeamId = String(seams[0].weld_id || "");
  return appState.parseSelectedSeamId;
}

function setParseReviewStatus(queueId, reviewStatus, options = {}) {
  const { silent = false } = options;
  const normalizedId = String(queueId || "").trim();
  const normalizedStatus = String(reviewStatus || "pending").trim().toLowerCase();
  let changed = false;
  appState.parseQueue = appState.parseQueue.map((item) => {
    if (item.id !== normalizedId) return item;
    changed = true;
    return { ...item, reviewStatus: normalizedStatus };
  });
  if (!changed) return false;
  renderParseWorkspace();
  if (!silent) {
    const label = normalizeParseReviewStatusMeta(normalizedStatus).label;
    const target = appState.parseQueue.find((item) => item.id === normalizedId);
    addEvent(`图纸复核状态已更新: ${target?.fileName || normalizedId} / ${label}`);
  }
  return true;
}

function buildParseQueueItemsFromHistory(target) {
  return (target?.files || []).map((item) => ({
    path: item.path || item.fileName,
    fileName: item.fileName || basenameFromPath(item.path || ""),
    fileType: item.fileType || inferParseFileType(item.path || item.fileName || ""),
    sizeBytes: item.sizeBytes,
    source: item.source || "history",
    virtual: item.virtual || !isTauriRuntime()
  }));
}

function acceptAllSuccessfulParseFiles() {
  let changed = 0;
  appState.parseQueue = appState.parseQueue.map((item) => {
    if (item.status !== "success") return item;
    if (item.reviewStatus === "accepted") return item;
    changed += 1;
    return { ...item, reviewStatus: "accepted" };
  });
  if (!changed) return 0;
  renderParseWorkspace();
  return changed;
}

function normalizeParseStatusMeta(status) {
  const value = String(status || "").trim().toLowerCase();
  if (value === "success") return { label: "成功", type: "ok" };
  if (value === "partial") return { label: "部分成功", type: "warn" };
  if (value === "failed") return { label: "失败", type: "danger" };
  if (value === "parsing") return { label: "解析中", type: "warn" };
  return { label: "待解析", type: "warn" };
}

function setParseProgress(progress, label) {
  const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0));
  appState.parseProgress = safeProgress;
  if (parseProgressBar) parseProgressBar.style.width = `${safeProgress}%`;
  if (parseProgressLabel && typeof label === "string") {
    parseProgressLabel.textContent = label;
  }
}

function clearParseProgressTimer() {
  if (uiState.parseProgressTimer) {
    window.clearInterval(uiState.parseProgressTimer);
    uiState.parseProgressTimer = 0;
  }
}

function startParseProgressTimer(activeIds) {
  clearParseProgressTimer();
  const ids = new Set(Array.isArray(activeIds) ? activeIds : []);
  if (!ids.size) return;
  uiState.parseProgressTimer = window.setInterval(() => {
    const nextProgress = Math.min(88, appState.parseProgress + 6 + Math.random() * 8);
    appState.parseQueue = appState.parseQueue.map((item) => {
      if (!ids.has(item.id)) return item;
      return { ...item, progress: Math.max(item.progress, Math.floor(nextProgress)), status: "parsing" };
    });
    setParseProgress(nextProgress, `解析中 ${Math.floor(nextProgress)}%`);
    renderParseQueue();
  }, 240);
}

function renderParseLogs() {
  if (!parseLogPanel) return;
  if (!appState.parseLogs.length) {
    parseLogPanel.innerHTML = "<p>等待解析日志...</p>";
    return;
  }
  parseLogPanel.innerHTML = appState.parseLogs
    .map((item) => `<p>[${item.time}] ${item.text}</p>`)
    .join("");
  parseLogPanel.scrollTop = parseLogPanel.scrollHeight;
}

function appendLog(text, level = "info") {
  appState.parseLogs.push({
    level,
    time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    text: String(text || "").trim() || "-"
  });
  if (appState.parseLogs.length > 80) {
    appState.parseLogs = appState.parseLogs.slice(-80);
  }
  renderParseLogs();
}

function syncParseOptionsForm() {
  if (parseDetectSymbolsInput) parseDetectSymbolsInput.checked = Boolean(appState.parseOptions.detectWeldSymbols);
  if (parseDetectSectionsInput) parseDetectSectionsInput.checked = Boolean(appState.parseOptions.detectSections);
  if (parseLanguageSelect) parseLanguageSelect.value = appState.parseOptions.language || DEFAULT_PARSE_OPTIONS.language;
}

function updateParseOptionsFromForm() {
  appState.parseOptions = {
    detectWeldSymbols: Boolean(parseDetectSymbolsInput?.checked),
    detectSections: Boolean(parseDetectSectionsInput?.checked),
    language: String(parseLanguageSelect?.value || DEFAULT_PARSE_OPTIONS.language)
  };
}

function getParseHistoryStorageKey(projectId = getCurrentProjectId()) {
  return `weldlayer.parse_history.${String(projectId || PROTOTYPE_PROJECT_ID).trim() || PROTOTYPE_PROJECT_ID}`;
}

function formatParseLanguageLabel(language) {
  const normalized = String(language || DEFAULT_PARSE_OPTIONS.language).trim();
  if (normalized === "zh-CN") return "中文";
  if (normalized === "en-US") return "English";
  return normalized || "-";
}

function formatParseOptionSummary(options = appState.parseOptions) {
  return `符号 ${options?.detectWeldSymbols ? "开" : "关"} / 分区 ${options?.detectSections ? "开" : "关"} / ${formatParseLanguageLabel(
    options?.language
  )}`;
}

function formatParseRunMode(mode) {
  const normalized = String(mode || "").trim().toLowerCase();
  if (normalized === "backend") return "后端解析";
  if (normalized === "mock") return "模拟解析";
  return normalized || "-";
}

function formatDateTimeLabel(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

function normalizeParseHistoryItem(input) {
  const files = Array.isArray(input?.files) ? input.files : [];
  const normalizedOptions = {
    detectWeldSymbols: Boolean(input?.options?.detectWeldSymbols),
    detectSections: Boolean(input?.options?.detectSections),
    language: String(input?.options?.language || DEFAULT_PARSE_OPTIONS.language)
  };
  return {
    id: String(input?.id || `parse-history-${Date.now()}`),
    traceId: String(input?.traceId || input?.trace_id || "-"),
    projectId: String(input?.projectId || input?.project_id || getCurrentProjectId()),
    projectName: String(input?.projectName || input?.project_name || getCurrentProjectName()),
    status: String(input?.status || "failed"),
    mode: String(input?.mode || "mock"),
    startedAt: String(input?.startedAt || input?.started_at || ""),
    completedAt: String(input?.completedAt || input?.completed_at || ""),
    fileCount: Number(input?.fileCount) || files.length,
    successCount: Number(input?.successCount) || 0,
    failedCount: Number(input?.failedCount) || 0,
    seamCount: Number(input?.seamCount) || 0,
    candidateCount: Number(input?.candidateCount) || 0,
    errorCount: Number(input?.errorCount) || 0,
    options: normalizedOptions,
    files: files.map((item) => ({
      path: String(item?.path || item?.fileName || ""),
      fileName: String(item?.fileName || basenameFromPath(item?.path || "") || ""),
      fileType: String(item?.fileType || inferParseFileType(item?.path || item?.fileName || "") || ""),
      source: String(item?.source || "history"),
      sizeBytes: Number(item?.sizeBytes) || 0,
      virtual: Boolean(item?.virtual)
    }))
  };
}

function loadParseHistoryForProject(projectId = getCurrentProjectId()) {
  try {
    const raw = window.localStorage.getItem(getParseHistoryStorageKey(projectId));
    const rows = raw ? JSON.parse(raw) : [];
    appState.parseHistory = Array.isArray(rows) ? rows.map((item) => normalizeParseHistoryItem(item)).slice(0, PARSE_HISTORY_LIMIT) : [];
  } catch (error) {
    appState.parseHistory = [];
    appendLog(`解析历史读取失败，已跳过: ${String(error)}`, "error");
  }
  appState.selectedParseHistoryId = appState.parseHistory[0]?.id || "";
  return appState.parseHistory;
}

function persistParseHistoryForProject(projectId = getCurrentProjectId()) {
  try {
    window.localStorage.setItem(
      getParseHistoryStorageKey(projectId),
      JSON.stringify(appState.parseHistory.slice(0, PARSE_HISTORY_LIMIT))
    );
  } catch (error) {
    appendLog(`解析历史保存失败: ${String(error)}`, "error");
  }
}

function getSelectedParseHistoryItem() {
  const selectedId = String(appState.selectedParseHistoryId || "").trim();
  if (selectedId) {
    const found = appState.parseHistory.find((item) => item.id === selectedId);
    if (found) return found;
  }
  return appState.parseHistory[0] || null;
}

function setSelectedParseHistory(historyId, options = {}) {
  const { silent = false } = options;
  const target = appState.parseHistory.find((item) => item.id === String(historyId || "").trim());
  if (!target) return false;
  appState.selectedParseHistoryId = target.id;
  renderParseHistory();
  if (!silent) {
    addEvent(`已选中解析历史 ${target.traceId}`);
  }
  return true;
}

function applyParseHistoryOptions(historyId, options = {}) {
  const { silent = false } = options;
  const target = appState.parseHistory.find((item) => item.id === String(historyId || "").trim());
  if (!target) return false;
  appState.parseOptions = { ...target.options };
  appState.selectedParseHistoryId = target.id;
  renderParseWorkspace();
  if (!silent) {
    addEvent(`已回填解析参数: ${target.traceId}`);
  }
  return true;
}

function restoreParseHistoryQueue(historyId) {
  const target = appState.parseHistory.find((item) => item.id === String(historyId || "").trim());
  if (!target) return false;
  resetParseWorkspace();
  appState.parseOptions = { ...target.options };
  enqueueParseFiles(buildParseQueueItemsFromHistory(target));
  appState.selectedParseHistoryId = target.id;
  renderParseWorkspace();
  addEvent(`已按解析历史恢复队列: ${target.traceId}`);
  return true;
}

async function rerunParseHistory(historyId) {
  const target = appState.parseHistory.find((item) => item.id === String(historyId || "").trim());
  if (!target) return null;
  resetParseWorkspace();
  appState.parseOptions = { ...target.options };
  const queued = enqueueParseFiles(buildParseQueueItemsFromHistory(target));
  appState.selectedParseHistoryId = target.id;
  renderParseWorkspace();
  if (!queued.added) {
    addEvent(`解析历史重跑失败: ${target.traceId} 没有可执行文件`);
    return null;
  }
  addEvent(`开始按历史任务重跑解析: ${target.traceId}`);
  return runParseQueue();
}

function buildParseHistoryEntry({ request, response, queue, mode, startedAt, completedAt }) {
  const files = Array.isArray(queue) ? queue : [];
  const normalizedResponse = response || {};
  const seamCount = Array.isArray(normalizedResponse.seams) ? normalizedResponse.seams.length : 0;
  const candidateCount = Array.isArray(normalizedResponse.candidates) ? normalizedResponse.candidates.length : 0;
  const errorCount = Array.isArray(normalizedResponse.errors) ? normalizedResponse.errors.length : 0;
  const status = String(normalizedResponse.status || (errorCount ? "failed" : "success"));
  const successCount = files.filter((item) => item.status === "success").length;
  const failedCount = files.filter((item) => item.status === "failed").length;
  return normalizeParseHistoryItem({
    id: `parse-history-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    traceId: request?.trace_id || "-",
    projectId: getCurrentProjectId(),
    projectName: getCurrentProjectName(),
    status,
    mode,
    startedAt,
    completedAt,
    fileCount: files.length,
    successCount,
    failedCount,
    seamCount,
    candidateCount,
    errorCount,
    options: { ...appState.parseOptions },
    files: files.map((item) => ({
      path: item.path,
      fileName: item.fileName,
      fileType: item.fileType,
      source: item.source,
      sizeBytes: item.sizeBytes,
      virtual: item.virtual
    }))
  });
}

function appendParseHistoryEntry(entry) {
  if (!entry) return null;
  appState.parseHistory = [entry, ...appState.parseHistory.filter((item) => item.id !== entry.id)].slice(0, PARSE_HISTORY_LIMIT);
  appState.selectedParseHistoryId = entry.id;
  persistParseHistoryForProject(entry.projectId);
  renderParseHistory();
  return entry;
}

function getFilteredParseQueueItems(queue = appState.parseQueue) {
  const statusFilter = String(appState.parseFilters?.status || "all").trim().toLowerCase();
  const reviewFilter = String(appState.parseFilters?.review || "all").trim().toLowerCase();
  return queue.filter((item) => {
    const matchesStatus = statusFilter === "all" || String(item.status || "ready").trim().toLowerCase() === statusFilter;
    const matchesReview = reviewFilter === "all" || String(item.reviewStatus || "pending").trim().toLowerCase() === reviewFilter;
    return matchesStatus && matchesReview;
  });
}

function collectParseSeamsFromQueue(queue = appState.parseQueue) {
  return queue.flatMap((item) => (Array.isArray(item.seams) ? item.seams : []));
}

function collectParseErrorsFromQueue(queue = appState.parseQueue) {
  return queue
    .filter((item) => item.status === "failed")
    .map((item) => ({
      code: item.errorCode || "PARSE_FAILED",
      message: item.errorMessage || "解析失败",
      path: item.path || item.fileName
    }));
}

function rebuildParseResultFromQueue(traceId = "") {
  const seams = collectParseSeamsFromQueue();
  const candidates = appState.parseQueue.flatMap((item) => (Array.isArray(item.candidates) ? item.candidates : []));
  const errors = collectParseErrorsFromQueue();
  const successCount = appState.parseQueue.filter((item) => item.status === "success").length;
  const failedCount = appState.parseQueue.filter((item) => item.status === "failed").length;
  if (!successCount && !failedCount) {
    appState.parseResult = null;
    return null;
  }
  let status = "failed";
  if (successCount > 0 && failedCount > 0) status = "partial";
  if (successCount > 0 && failedCount === 0) status = "success";
  appState.parseResult = {
    traceId: String(traceId || appState.parseResult?.traceId || ""),
    status,
    seams,
    candidates,
    errors,
    successCount,
    failedCount,
    completedAt: new Date().toISOString()
  };
  return appState.parseResult;
}

function renderParseQueue() {
  if (!parseQueueBody) return;
  if (!appState.parseQueue.length) {
    parseQueueBody.innerHTML = '<tr><td colspan="6">当前没有图纸排队，先选择 PDF / DWG。</td></tr>';
    return;
  }
  const filteredQueue = getFilteredParseQueueItems();
  if (!filteredQueue.length) {
    parseQueueBody.innerHTML = '<tr><td colspan="6">当前筛选条件下没有图纸，调整状态或复核筛选后再看。</td></tr>';
    return;
  }
  const selectedId = syncSelectedParseQueue()?.id || "";
  parseQueueBody.innerHTML = filteredQueue
    .map((item) => {
      const status = normalizeParseStatusMeta(item.status);
      const review = normalizeParseReviewStatusMeta(item.reviewStatus);
      const rowClass =
        item.status === "success" ? "parse-queue-row is-success" : item.status === "failed" ? "parse-queue-row is-failed" : "parse-queue-row";
      const selectedClass = item.id === selectedId ? " is-selected-row" : "";
      const canRetry = item.status === "failed" && !appState.parseBusy;
      const canRemove = !appState.parseBusy;
      return `
        <tr class="${rowClass}${selectedClass}" data-parse-select="${item.id}">
          <td class="parse-path-cell">
            <div class="parse-path-stack">
              <strong>${item.fileName || item.path}</strong>
              <span>${item.path || item.fileName}</span>
              <span>${statusTag(review.label, review.type)}</span>
            </div>
          </td>
          <td>${(item.fileType || "-").toUpperCase()}</td>
          <td>${statusTag(status.label, status.type)}</td>
          <td class="parse-progress-cell">${item.progress || 0}%</td>
          <td>${item.errorCode || "-"}</td>
          <td>
            <div class="parse-queue-actions">
              <button class="ghost small" data-parse-remove="${item.id}" ${canRemove ? "" : "disabled"}>移除</button>
              <button class="ghost small" data-parse-retry-item="${item.id}" ${canRetry ? "" : "disabled"}>重试</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderParsePreview() {
  if (!parsePreviewCaption || !parsePreviewEmpty || !parsePreviewContent || !parsePreviewBody || !parsePreviewCandidateBody || !parseErrorList) return;
  const result = appState.parseResult;
  if (!result) {
    parsePreviewCaption.textContent = "尚未生成解析结果";
    parsePreviewEmpty.classList.remove("hidden");
    parsePreviewContent.classList.add("hidden");
    parsePreviewBody.innerHTML = "";
    parsePreviewCandidateBody.innerHTML = "";
    parseErrorList.innerHTML = "";
    return;
  }

  const seams = Array.isArray(result.seams) ? result.seams : [];
  const candidates = Array.isArray(result.candidates) ? result.candidates : [];
  const errors = Array.isArray(result.errors) ? result.errors : [];
  parsePreviewCaption.textContent = `状态 ${String(result.status || "-").toUpperCase()} / 显式焊缝 ${seams.length} 条 / 候选焊缝 ${candidates.length} 条 / 错误 ${errors.length} 条`;
  parsePreviewEmpty.classList.add("hidden");
  parsePreviewContent.classList.remove("hidden");
  parsePreviewBody.innerHTML = seams.length
    ? seams
        .map((item) => {
          const confidence = Number(item.confidence_score);
          return `
            <tr>
              <td>${item.weld_id || "-"}</td>
              <td>${item.draw_ref || "-"}</td>
              <td>${item.weld_symbol || "-"}</td>
              <td>${item.material_spec || "-"}</td>
              <td>${(Number(item.thickness_mm) || 0).toFixed(1)}</td>
              <td>${item.position_code || "-"}</td>
              <td>${Number.isFinite(confidence) ? confidence.toFixed(2) : "-"}</td>
            </tr>
          `;
        })
        .join("")
    : '<tr><td colspan="7">本次解析未提取到焊缝。</td></tr>';
  parsePreviewCandidateBody.innerHTML = candidates.length
    ? candidates
        .map((item) => {
          const confidence = Number(item.confidence_score);
          const reviewMeta = getParseCandidateReviewMeta(item);
          return `
            <tr>
              <td>${item.candidate_id || "-"}</td>
              <td>${item.draw_ref || "-"}</td>
              <td>${item.candidate_type || "-"}</td>
              <td>${formatParseCandidateGuess(item)}</td>
              <td>${Number.isFinite(confidence) ? confidence.toFixed(2) : "-"}</td>
              <td>${statusTag(reviewMeta.label, reviewMeta.type)}</td>
            </tr>
          `;
        })
        .join("")
    : '<tr><td colspan="6">本次解析未生成候选焊缝。</td></tr>';
  parseErrorList.innerHTML = errors
    .map(
      (item) => `
        <div class="parse-error-item">
          <strong>${item.code || "PARSE_FAILED"}</strong>
          <p>${item.message || "解析失败"}</p>
          <p>${item.path || "-"}</p>
        </div>
      `
    )
    .join("");
}

function renderParseSelectedFilePanel() {
  if (
    !parseSelectedTitle ||
    !parseSelectedMeta ||
    !parsePreviewCanvas ||
    !parsePreviewCanvasEmpty ||
    !parsePreviewScroll ||
    !parsePreviewDocument ||
    !parsePreviewSurface ||
    !parsePreviewHelp ||
    !parsePreviewHotspots ||
    !parseFileStatus ||
    !parseFileSeamCount ||
    !parseFileErrorCount ||
    !parseFileCandidateCount ||
    !parseFileSource ||
    !parseFileSeamBody ||
    !parseFileCandidateBody ||
    !parseFileErrorList
  ) {
    return;
  }

  const item = syncSelectedParseQueue();
  if (!item) {
    parseSelectedTitle.textContent = "尚未选择图纸";
    parseSelectedMeta.textContent = "点击文件队列中的图纸查看详情和焊缝定位。";
    parsePreviewCanvas.classList.remove("is-annotate-mode");
    if (parseDetailGrid) parseDetailGrid.classList.toggle("is-preview-expanded", appState.parsePreviewExpanded);
    if (parsePreviewModeBtn) {
      parsePreviewModeBtn.textContent = "切换到标注模式";
      parsePreviewModeBtn.disabled = true;
    }
    if (parseShortcutsBtn) {
      parseShortcutsBtn.disabled = true;
      parseShortcutsBtn.classList.remove("is-active-tool");
    }
    if (parseAddSeamBtn) {
      parseAddSeamBtn.textContent = "新增焊缝";
      parseAddSeamBtn.disabled = true;
      parseAddSeamBtn.classList.remove("is-active-tool");
    }
    if (parseDeleteSeamBtn) parseDeleteSeamBtn.disabled = true;
    if (parsePreviewExpandBtn) {
      parsePreviewExpandBtn.textContent = getParsePreviewExpandMeta().buttonText;
      parsePreviewExpandBtn.disabled = true;
    }
    if (parseSelectPrevBtn) parseSelectPrevBtn.disabled = true;
    if (parseSelectNextBtn) parseSelectNextBtn.disabled = true;
    if (parseAcceptSelectedBtn) parseAcceptSelectedBtn.disabled = true;
    if (parseResetSelectedBtn) parseResetSelectedBtn.disabled = true;
    if (parseFlagSeamBtn) parseFlagSeamBtn.disabled = true;
    if (parseUnflagSeamBtn) parseUnflagSeamBtn.disabled = true;
    if (parseLoadSelectedBtn) parseLoadSelectedBtn.disabled = true;
    if (parsePreviewRotateLeftBtn) parsePreviewRotateLeftBtn.disabled = true;
    if (parsePreviewRotateRightBtn) parsePreviewRotateRightBtn.disabled = true;
    if (parsePreviewZoomOutBtn) parsePreviewZoomOutBtn.disabled = true;
    if (parsePreviewZoomResetBtn) {
      parsePreviewZoomResetBtn.disabled = true;
      parsePreviewZoomResetBtn.textContent = formatParsePreviewZoom();
    }
    if (parsePreviewZoomInBtn) parsePreviewZoomInBtn.disabled = true;
    if (parseShortcutPanel) parseShortcutPanel.classList.add("hidden");
    void clearParsePreviewDocument();
    parsePreviewCanvasEmpty.classList.remove("hidden");
    parsePreviewCanvasEmpty.textContent = "当前未选中图纸，或该图纸还没有解析结果。";
    parsePreviewHelp.textContent = "当前未选中图纸。进入标注模式后，可拖动标注或新增手动焊缝。";
    if (parsePreviewShortcuts) {
      parsePreviewShortcuts.textContent = "快捷键：R/Shift+R 旋转，+/- 缩放，0 重置，M 标注模式，N 新增焊缝，Del 删除手动焊缝。";
    }
    parsePreviewHotspots.innerHTML = "";
    parseFileStatus.textContent = "-";
    parseFileSeamCount.textContent = "0";
    parseFileErrorCount.textContent = "0";
    parseFileCandidateCount.textContent = "0";
    parseFileSource.textContent = "-";
    parseFileSeamBody.innerHTML = '<tr><td colspan="7">当前没有可显示的文件级焊缝。</td></tr>';
    parseFileCandidateBody.innerHTML = '<tr><td colspan="6">当前没有可显示的候选焊缝。</td></tr>';
    parseFileErrorList.innerHTML = "";
    return;
  }

  const statusMeta = normalizeParseStatusMeta(item.status);
  const reviewMeta = normalizeParseReviewStatusMeta(item.reviewStatus);
  const seams = Array.isArray(item.seams) ? item.seams : [];
  const candidates = Array.isArray(item.candidates) ? item.candidates : [];
  const errors = getParseErrorsForItem(item);
  const index = getParseQueueIndex(item.id);
  const selectedSeamId = syncSelectedParseSeam(item);
  const selectedCandidateId = syncSelectedParseCandidate(item);
  const suspiciousCount = countFlaggedParseSeams(item);
  const previewLoadState = String(item.previewLoadState || "idle");
  const previewError = String(item.previewError || "");
  const previewUrl = resolveParsePreviewUrl(item);
  const hasPdfPreview = item.fileType === "pdf" && previewUrl;
  const previewModeMeta = getParsePreviewModeMeta();
  const previewExpandMeta = getParsePreviewExpandMeta();
  const selectedSeam = seams.find((seam) => String(seam?.weld_id || "") === selectedSeamId) || null;
  const selectedManualSeam = isManualParseSeam(selectedSeam);
  const pageCount = Math.max(1, Number(appState.parsePreviewPageCount) || (item.fileType === "pdf" ? 1 : 1));
  const pageLabel = `${Math.max(1, Math.min(pageCount, Number(appState.parsePreviewPageIndex) + 1 || 1))}/${pageCount}`;
  parseSelectedTitle.textContent = item.fileName || item.path || "未命名图纸";
  parseSelectedMeta.textContent = `${item.path || item.fileName} · ${(item.fileType || "-").toUpperCase()} · ${formatBytes(
    item.sizeBytes
  )} · ${index + 1}/${appState.parseQueue.length} · 复核 ${reviewMeta.label} · 可疑焊缝 ${suspiciousCount} · 候选 ${candidates.length}`;
  parseFileStatus.textContent = `${statusMeta.label} / ${reviewMeta.label}`;
  parseFileSeamCount.textContent = String(seams.length);
  parseFileErrorCount.textContent = String(errors.length);
  parseFileCandidateCount.textContent = String(candidates.length);
  parseFileSource.textContent = formatParseSourceLabel(item.source);
  if (parseDetailGrid) parseDetailGrid.classList.toggle("is-preview-expanded", appState.parsePreviewExpanded);
  parsePreviewCanvas.classList.toggle("is-annotate-mode", appState.parsePreviewMode === "annotate");
  if (parsePreviewModeBtn) {
    parsePreviewModeBtn.textContent = previewModeMeta.buttonText;
    parsePreviewModeBtn.disabled = false;
  }
  if (parseShortcutsBtn) {
    parseShortcutsBtn.disabled = false;
    parseShortcutsBtn.classList.toggle("is-active-tool", appState.parseShortcutPanelVisible);
  }
  if (parseAddSeamBtn) {
    parseAddSeamBtn.textContent = appState.parsePreviewAddSeamMode ? "点击图纸放置焊缝" : "新增焊缝";
    parseAddSeamBtn.disabled = appState.parsePreviewMode !== "annotate";
    parseAddSeamBtn.classList.toggle("is-active-tool", appState.parsePreviewAddSeamMode);
  }
  if (parseDeleteSeamBtn) {
    parseDeleteSeamBtn.disabled = !selectedManualSeam;
  }
  if (parsePreviewExpandBtn) {
    parsePreviewExpandBtn.textContent = previewExpandMeta.buttonText;
    parsePreviewExpandBtn.disabled = false;
  }
  if (parseSelectPrevBtn) parseSelectPrevBtn.disabled = index <= 0;
  if (parseSelectNextBtn) parseSelectNextBtn.disabled = index < 0 || index >= appState.parseQueue.length - 1;
  if (parseAcceptSelectedBtn) parseAcceptSelectedBtn.disabled = false;
  if (parseResetSelectedBtn) parseResetSelectedBtn.disabled = false;
  if (parseFlagSeamBtn) parseFlagSeamBtn.disabled = !selectedSeam;
  if (parseUnflagSeamBtn) parseUnflagSeamBtn.disabled = !selectedSeam;
  if (parseLoadSelectedBtn) parseLoadSelectedBtn.disabled = false;
  if (parsePreviewRotateLeftBtn) parsePreviewRotateLeftBtn.disabled = item.fileType !== "pdf";
  if (parsePreviewRotateRightBtn) parsePreviewRotateRightBtn.disabled = item.fileType !== "pdf";
  if (parsePreviewZoomResetBtn) parsePreviewZoomResetBtn.textContent = formatParsePreviewZoom();
  if (parsePreviewZoomOutBtn) parsePreviewZoomOutBtn.disabled = !hasPdfPreview && item.fileType !== "pdf";
  if (parsePreviewZoomResetBtn) parsePreviewZoomResetBtn.disabled = !hasPdfPreview && item.fileType !== "pdf";
  if (parsePreviewZoomInBtn) parsePreviewZoomInBtn.disabled = !hasPdfPreview && item.fileType !== "pdf";
  if (parseShortcutPanel) parseShortcutPanel.classList.toggle("hidden", !appState.parseShortcutPanelVisible);
  if (item.fileType === "pdf" && !hasPdfPreview && !item.virtual && isTauriRuntime() && item.path && previewLoadState === "idle") {
    void ensureParsePreviewAsset(item);
  }
  if (hasPdfPreview) {
    void renderParsePdfPreview(item, previewUrl).catch((error) => {
      const message = String(error || "无法渲染 PDF 预览");
      updateParseQueueItem(item.id, (entry) => ({
        ...entry,
        previewLoadState: "failed",
        previewError: message
      }));
      if (parsePreviewCanvasEmpty) {
        parsePreviewCanvasEmpty.classList.remove("hidden");
        parsePreviewCanvasEmpty.textContent = `图纸预览渲染失败：${message}`;
      }
      if (parsePreviewDocument) {
        parsePreviewDocument.classList.add("hidden");
      }
    });
    parsePreviewHelp.textContent =
      appState.parsePreviewMode === "annotate"
        ? selectedSeamId || selectedCandidateId
          ? `${previewModeMeta.helpText} 当前第 ${pageLabel} 页，缩放 ${formatParsePreviewZoom()}，旋转 ${normalizeParsePreviewRotation(appState.parsePreviewRotation)}°。`
          : `${previewModeMeta.helpText} 请先在右侧表格或热点中选中目标。当前第 ${pageLabel} 页，旋转 ${normalizeParsePreviewRotation(appState.parsePreviewRotation)}°。`
        : `${previewModeMeta.helpText} 当前第 ${pageLabel} 页，缩放 ${formatParsePreviewZoom()}，旋转 ${normalizeParsePreviewRotation(appState.parsePreviewRotation)}°。`;
  } else {
    void clearParsePreviewDocument();
    parsePreviewHelp.textContent =
      item.fileType === "dwg"
        ? "当前 DWG 还没有可视化预览能力，仍使用占位画布。后续需要 sidecar 生成预览图。"
        : previewLoadState === "loading"
          ? "正在加载真实图纸预览。完成后会把焊缝热点叠加到 PDF 上。"
          : previewLoadState === "failed"
            ? `图纸预览加载失败：${previewError || "无法读取 PDF"}`
        : `${previewModeMeta.helpText} 当前仅显示占位画布。`;
  }
  if (parsePreviewShortcuts) {
    parsePreviewShortcuts.textContent =
      "快捷键：R/Shift+R 旋转，+/- 缩放，0 重置，M 标注模式，N 新增焊缝，Del 删除手动焊缝，? 打开快捷键。";
  }
  const visibleSeams = seams.filter((seam) => isAnchorVisibleOnPreviewPage(seam.anchor_bbox));
  const visibleCandidates = candidates.filter((candidate) => isAnchorVisibleOnPreviewPage(candidate.anchor_bbox));
  const seamHotspots = visibleSeams.map((seam, seamIndex) => {
      const confidence = Number(seam.confidence_score) || 0;
      const seamReviewMeta = getParseSeamReviewMeta(seam);
      const activeClass = String(seam.weld_id || "") === selectedSeamId ? " is-active" : "";
      const draggingClass =
        appState.parsePreviewDrag?.kind === "seam" && String(appState.parsePreviewDrag?.itemId || "") === String(seam.weld_id || "")
          ? " is-dragging"
          : "";
      const hotspotClass = seamReviewMeta.hotspotClass ? `parse-hotspot ${seamReviewMeta.hotspotClass}` : "parse-hotspot";
      const anchorStyle = getAnchorStyle(seam.anchor_bbox, seamIndex, visibleSeams.length, "seam");
      const placementClass = getHotspotPlacementClass(seam.anchor_bbox, seamIndex, visibleSeams.length, "seam");
      return `
        <div class="${hotspotClass} ${placementClass}${activeClass}${draggingClass}" style="left:${anchorStyle.left};top:${anchorStyle.top};" data-parse-seam-select="${seam.weld_id || ""}" data-parse-hotspot-kind="seam" data-parse-hotspot-id="${seam.weld_id || ""}">
          <strong>${seam.weld_id || `W-${seamIndex + 1}`}</strong>
          <span>${seam.weld_symbol || "-"} / ${Number.isFinite(confidence) ? confidence.toFixed(2) : "-"} / ${seamReviewMeta.label}</span>
        </div>
      `;
    });
  const candidateHotspots = visibleCandidates.map((candidate, candidateIndex) => {
    const confidence = Number(candidate.confidence_score) || 0;
    const candidateMeta = getParseCandidateReviewMeta(candidate);
    const activeClass = String(candidate.candidate_id || "") === selectedCandidateId ? " is-active" : "";
    const draggingClass =
      appState.parsePreviewDrag?.kind === "candidate" && String(appState.parsePreviewDrag?.itemId || "") === String(candidate.candidate_id || "")
        ? " is-dragging"
        : "";
    const anchorStyle = getAnchorStyle(candidate.anchor_bbox, candidateIndex, visibleCandidates.length, "candidate");
    const placementClass = getHotspotPlacementClass(candidate.anchor_bbox, candidateIndex, visibleCandidates.length, "candidate");
    return `
      <div class="parse-hotspot ${candidateMeta.hotspotClass} ${placementClass}${activeClass}${draggingClass}" style="left:${anchorStyle.left};top:${anchorStyle.top};" data-parse-candidate-select="${candidate.candidate_id || ""}" data-parse-hotspot-kind="candidate" data-parse-hotspot-id="${candidate.candidate_id || ""}">
        <strong>${candidate.candidate_id || `C-${candidateIndex + 1}`}</strong>
        <span>${candidate.candidate_type || "-"} / ${Number.isFinite(confidence) ? confidence.toFixed(2) : "-"} / ${candidateMeta.label}</span>
      </div>
    `;
  });
  parsePreviewHotspots.innerHTML = [...seamHotspots, ...candidateHotspots].join("");

  if (errors.length) {
    parsePreviewCanvasEmpty.classList.remove("hidden");
    parsePreviewCanvasEmpty.textContent = `${statusMeta.label}：${errors[0].message || "解析失败"}`;
  } else if (item.fileType === "pdf" && !hasPdfPreview) {
    parsePreviewCanvasEmpty.classList.remove("hidden");
    parsePreviewCanvasEmpty.textContent =
      previewLoadState === "loading"
        ? "正在加载真实图纸预览..."
        : previewLoadState === "failed"
          ? `图纸预览加载失败：${previewError || "无法读取 PDF"}`
          : "正在准备图纸预览...";
  } else if (!seams.length && !candidates.length) {
    parsePreviewCanvasEmpty.classList.remove("hidden");
    parsePreviewCanvasEmpty.textContent =
      item.status === "success" ? "该图纸解析完成，但未提取到焊缝。" : "该图纸尚未生成焊缝结果。";
  } else if (!hasPdfPreview && item.fileType !== "pdf") {
    parsePreviewCanvasEmpty.classList.remove("hidden");
    parsePreviewCanvasEmpty.textContent = "当前使用占位画布。后续需要为该文件类型生成真实预览。";
  } else {
    parsePreviewCanvasEmpty.classList.add("hidden");
  }

  parseFileSeamBody.innerHTML = seams.length
    ? seams
        .map((seam) => {
          const confidence = Number(seam.confidence_score) || 0;
          const seamReviewMeta = getParseSeamReviewMeta(seam);
          const rowClass = [
            String(seam.weld_id || "") === selectedSeamId ? "is-selected-row" : "",
            seamReviewMeta.type === "danger" ? "is-parse-seam-uncertain" : ""
          ]
            .filter(Boolean)
            .join(" ");
          const active = rowClass ? ` class="${rowClass}"` : "";
          return `
            <tr${active} data-parse-seam-row="${seam.weld_id || ""}">
              <td>${seam.weld_id || "-"}</td>
              <td>${seam.weld_symbol || "-"}</td>
              <td>${seam.material_spec || "-"}</td>
              <td>${(Number(seam.thickness_mm) || 0).toFixed(1)}</td>
              <td>${seam.position_code || "-"}</td>
              <td>${Number.isFinite(confidence) ? confidence.toFixed(2) : "-"}</td>
              <td>${statusTag(seamReviewMeta.label, seamReviewMeta.type)}</td>
            </tr>
          `;
        })
        .join("")
    : '<tr><td colspan="7">当前图纸没有可显示的焊缝结果。</td></tr>';
  parseFileCandidateBody.innerHTML = candidates.length
    ? candidates
        .map((candidate) => {
          const confidence = Number(candidate.confidence_score) || 0;
          const reviewMeta = getParseCandidateReviewMeta(candidate);
          const active = String(candidate.candidate_id || "") === selectedCandidateId ? ' class="is-selected-row"' : "";
          const evidenceSummary = Array.isArray(candidate.evidence) && candidate.evidence.length
            ? candidate.evidence.map((item) => item.summary || item.type || "-").slice(0, 2).join("；")
            : "无证据摘要";
          return `
            <tr${active} data-parse-candidate-row="${candidate.candidate_id || ""}" title="${evidenceSummary}">
              <td>${candidate.candidate_id || "-"}</td>
              <td>${candidate.candidate_type || "-"}</td>
              <td>${formatParseCandidateGuess(candidate)}</td>
              <td>${Number.isFinite(confidence) ? confidence.toFixed(2) : "-"}</td>
              <td>${statusTag(reviewMeta.label, reviewMeta.type)}</td>
              <td>
                <div class="parse-queue-actions">
                  <button class="ghost small" data-parse-candidate-accept="${candidate.candidate_id || ""}">接受</button>
                  <button class="ghost small" data-parse-candidate-reject="${candidate.candidate_id || ""}">忽略</button>
                  <button class="ghost small" data-parse-candidate-reset="${candidate.candidate_id || ""}">重置</button>
                </div>
              </td>
            </tr>
          `;
        })
        .join("")
    : '<tr><td colspan="6">当前图纸没有候选焊缝。</td></tr>';

  parseFileErrorList.innerHTML = errors
    .map(
      (error) => `
        <div class="parse-error-item">
          <strong>${error.code || "PARSE_FAILED"}</strong>
          <p>${error.message || "解析失败"}</p>
          <p>${error.path || "-"}</p>
        </div>
      `
    )
    .join("");
}

function renderParseHistory() {
  if (
    !parseHistoryBody ||
    !parseHistoryCaption ||
    !parseHistoryDetailEmpty ||
    !parseHistoryDetailContent ||
    !parseHistoryDetailTitle ||
    !parseHistoryDetailMeta ||
    !parseHistoryDetailPills ||
    !parseHistoryFileList
  ) {
    return;
  }

  if (!appState.parseHistory.length) {
    parseHistoryBody.innerHTML = '<tr><td colspan="6">当前项目还没有解析历史。</td></tr>';
    parseHistoryCaption.textContent = "按项目保存最近解析批次，可回填参数或恢复队列";
    parseHistoryDetailEmpty.classList.remove("hidden");
    parseHistoryDetailContent.classList.add("hidden");
    parseHistoryFileList.innerHTML = "";
    return;
  }

  const selected = getSelectedParseHistoryItem();
  parseHistoryCaption.textContent = `当前项目共 ${appState.parseHistory.length} 条解析历史，最近完成于 ${formatDateTimeLabel(
    appState.parseHistory[0]?.completedAt
  )}`;
  parseHistoryBody.innerHTML = appState.parseHistory
    .map((item) => {
      const statusMeta = normalizeParseStatusMeta(item.status);
      const selectedClass = item.id === selected?.id ? " is-selected-row" : "";
      return `
        <tr class="${selectedClass}" data-parse-history-select="${item.id}">
          <td>${formatDateTimeLabel(item.completedAt)}</td>
          <td>${item.traceId}</td>
          <td>${statusTag(statusMeta.label, statusMeta.type)}</td>
          <td>${item.fileCount}</td>
          <td>${item.seamCount}+候选${item.candidateCount || 0} / ${item.errorCount}</td>
          <td>
            <div class="parse-queue-actions">
              <button class="ghost small" data-parse-history-rerun="${item.id}">再次执行</button>
              <button class="ghost small" data-parse-history-restore="${item.id}">恢复队列</button>
              <button class="ghost small" data-parse-history-options="${item.id}">回填参数</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  if (!selected) {
    parseHistoryDetailEmpty.classList.remove("hidden");
    parseHistoryDetailContent.classList.add("hidden");
    parseHistoryFileList.innerHTML = "";
    return;
  }

  parseHistoryDetailEmpty.classList.add("hidden");
  parseHistoryDetailContent.classList.remove("hidden");
  parseHistoryDetailTitle.textContent = `${selected.traceId} / ${formatParseRunMode(selected.mode)}`;
  parseHistoryDetailMeta.textContent = `${selected.projectName} · 开始 ${formatDateTimeLabel(
    selected.startedAt
  )} · 完成 ${formatDateTimeLabel(selected.completedAt)}`;
  parseHistoryDetailPills.innerHTML = [
    `<span class="pill">${formatParseOptionSummary(selected.options)}</span>`,
    `<span class="pill">文件 ${selected.fileCount}</span>`,
    `<span class="pill">成功 ${selected.successCount}</span>`,
    `<span class="pill">失败 ${selected.failedCount}</span>`,
    `<span class="pill">焊缝 ${selected.seamCount}</span>`,
    `<span class="pill">候选 ${selected.candidateCount || 0}</span>`
  ].join("");
  parseHistoryFileList.innerHTML = selected.files.length
    ? selected.files
        .map(
          (item) => `
            <li>
              <div>
                <strong>${item.fileName || item.path || "-"}</strong>
                <span class="mono">${item.path || "-"}</span>
              </div>
              <span>${(item.fileType || "-").toUpperCase()} / ${formatParseSourceLabel(item.source)}</span>
            </li>
          `
        )
        .join("")
    : '<li><span>该次解析没有保留文件明细。</span></li>';
}

function syncParseActionState() {
  const queueCount = appState.parseQueue.length;
  const filteredQueueCount = getFilteredParseQueueItems().length;
  const failedCount = appState.parseQueue.filter((item) => item.status === "failed").length;
  const resultSeamCount = appState.parseResult?.seams?.length || 0;
  const resultCandidateCount = appState.parseResult?.candidates?.length || 0;
  const selectedItem = getSelectedParseQueueItem();
  const selectedIndex = selectedItem ? getParseQueueIndex(selectedItem.id) : -1;
  const selectedSeamCount = selectedItem?.seams?.length || 0;
  const selectedAcceptedCandidateCount = (selectedItem?.candidates || []).filter(
    (candidate) => normalizeParseCandidateReviewStatus(candidate.review_status, candidate.confidence_score) === "accepted"
  ).length;
  const selectedSeam = selectedItem?.seams?.find((item) => String(item.weld_id || "") === String(appState.parseSelectedSeamId || "").trim()) || null;
  const selectedSeamReview = getParseSeamReviewMeta(selectedSeam);
  const acceptedQueue = appState.parseQueue.filter((item) => item.reviewStatus === "accepted");
  const acceptedSeamCount = acceptedQueue.reduce((total, item) => total + (item.seams?.length || 0), 0);
  const acceptedCandidateCount = appState.parseQueue.reduce(
    (total, item) =>
      total +
      (item.candidates || []).filter((candidate) => normalizeParseCandidateReviewStatus(candidate.review_status, candidate.confidence_score) === "accepted").length,
    0
  );
  if (parseRunBtn) parseRunBtn.disabled = !queueCount || appState.parseBusy;
  if (parseRetryBtn) parseRetryBtn.disabled = !failedCount || appState.parseBusy;
  if (parseAcceptAllBtn) {
    const pendingSuccessfulCount = appState.parseQueue.filter(
      (item) => item.status === "success" && item.reviewStatus !== "accepted"
    ).length;
    parseAcceptAllBtn.disabled = !pendingSuccessfulCount || appState.parseBusy;
  }
  if (parseLoadSeamsBtn) parseLoadSeamsBtn.disabled = !resultSeamCount || appState.parseBusy;
  if (parseLoadAcceptedBtn) parseLoadAcceptedBtn.disabled = !(acceptedSeamCount || acceptedCandidateCount) || appState.parseBusy;
  if (parseLoadSelectedBtn) parseLoadSelectedBtn.disabled = !(selectedSeamCount || selectedAcceptedCandidateCount) || appState.parseBusy;
  if (parseSelectPrevBtn) parseSelectPrevBtn.disabled = queueCount <= 1 || selectedIndex <= 0 || appState.parseBusy;
  if (parseSelectNextBtn) parseSelectNextBtn.disabled = queueCount <= 1 || selectedIndex < 0 || selectedIndex >= queueCount - 1 || appState.parseBusy;
  if (parseAcceptSelectedBtn) parseAcceptSelectedBtn.disabled = !selectedItem || selectedItem.status !== "success" || appState.parseBusy;
  if (parseResetSelectedBtn) parseResetSelectedBtn.disabled = !selectedItem || appState.parseBusy;
  if (parseFlagSeamBtn) parseFlagSeamBtn.disabled = !selectedSeam || appState.parseBusy || selectedSeamReview.type === "danger";
  if (parseUnflagSeamBtn) parseUnflagSeamBtn.disabled = !selectedSeam || appState.parseBusy || selectedSeamReview.type !== "danger";
  if (parsePickFilesBtn) parsePickFilesBtn.disabled = appState.parseBusy;
  if (parseAddSampleBtn) parseAddSampleBtn.disabled = appState.parseBusy;
  if (parseClearQueueBtn) parseClearQueueBtn.disabled = !queueCount || appState.parseBusy;
  if (parseFilterStatus) parseFilterStatus.value = appState.parseFilters.status || "all";
  if (parseFilterReview) parseFilterReview.value = appState.parseFilters.review || "all";
  if (parseQueueCaption) {
    const successCount = appState.parseQueue.filter((item) => item.status === "success").length;
    parseQueueCaption.textContent = `显示 ${filteredQueueCount}/${queueCount} 份 / 成功 ${successCount} / 失败 ${failedCount} / 已接受 ${acceptedQueue.length}`;
  }
  if (parseStatusLabel) {
    if (appState.parseBusy) {
      parseStatusLabel.textContent = "解析中";
    } else if (appState.parseResult?.status) {
      parseStatusLabel.textContent = `已完成 ${String(appState.parseResult.status).toUpperCase()}`;
    } else {
      parseStatusLabel.textContent = queueCount ? "待解析" : "未开始";
    }
  }
  if (parseSummaryLabel) {
    const errorCount = appState.parseResult?.errors?.length || 0;
    parseSummaryLabel.textContent = `队列 ${queueCount} 份图纸，显式焊缝 ${resultSeamCount} 条，候选 ${resultCandidateCount} 条，错误 ${errorCount} 条，已接受文件焊缝 ${acceptedSeamCount} 条，已接受候选 ${acceptedCandidateCount} 条`;
  }
}

function renderParseWorkspace() {
  renderParseQueue();
  renderParsePreview();
  renderParseSelectedFilePanel();
  renderParseHistory();
  renderParseLogs();
  syncParseOptionsForm();
  syncParseActionState();
}

function resetParseWorkspace(options = {}) {
  const { preserveQueue = false, preserveResult = false } = options;
  clearParseProgressTimer();
  appState.parseBusy = false;
  appState.parseProgress = 0;
  appState.parseOptions = { ...DEFAULT_PARSE_OPTIONS };
  appState.parseFilters = { status: "all", review: "all" };
  appState.parseSelectedQueueId = "";
  appState.parseSelectedSeamId = "";
  appState.parseSelectedCandidateId = "";
  if (!preserveQueue) {
    releaseParsePreviewUrls(appState.parseQueue);
    appState.parseQueue = [];
  } else {
    appState.parseQueue = appState.parseQueue.map((item) => ({
      ...item,
      status: "ready",
      progress: 0,
      errorCode: "",
      errorMessage: "",
      seams: [],
      candidates: []
    }));
  }
  if (!preserveResult) {
    appState.parseResult = null;
  }
  appState.parseLogs = [
    {
      level: "info",
      time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      text: `解析工作区已准备就绪，当前项目 ${getCurrentProjectId()}`
    }
  ];
  setParseProgress(0, "等待加入解析队列");
  renderParseWorkspace();
}

function enqueueParseFiles(items) {
  const sourceItems = Array.isArray(items) ? items : [];
  if (!sourceItems.length) return { added: 0, duplicates: 0, rejected: 0 };
  const existingKeys = new Set(appState.parseQueue.map((item) => buildParseQueueKey(item)));
  const nextItems = [];
  let duplicates = 0;
  let rejected = 0;

  sourceItems.forEach((raw) => {
    const item = buildParseQueueItem(raw);
    if (!item.fileType) {
      rejected += 1;
      appendLog(`已拒绝不支持的文件: ${item.path || item.fileName}`, "error");
      return;
    }
    const key = buildParseQueueKey(item);
    if (existingKeys.has(key)) {
      duplicates += 1;
      return;
    }
    existingKeys.add(key);
    nextItems.push(item);
  });

  if (nextItems.length) {
    appState.parseQueue = [...appState.parseQueue, ...nextItems];
    if (!appState.parseSelectedQueueId) {
      appState.parseSelectedQueueId = nextItems[0].id;
    }
    renderParseWorkspace();
    appendLog(`已加入解析队列 ${nextItems.length} 份图纸`);
  }
  return { added: nextItems.length, duplicates, rejected };
}

function buildParseTraceId() {
  return `PARSE-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
}

function buildParseRequestPayload(queue) {
  const files = queue.map((item) => ({
    path: item.path,
    file_type: item.fileType
  }));
  return {
    trace_id: buildParseTraceId(),
    project_id: getCurrentProjectId(),
    files,
    options: {
      detect_weld_symbols: Boolean(appState.parseOptions.detectWeldSymbols),
      detect_sections: Boolean(appState.parseOptions.detectSections),
      language: appState.parseOptions.language || DEFAULT_PARSE_OPTIONS.language
    }
  };
}

function applyParseResponseToQueue(targetIds, response) {
  const targetSet = new Set(Array.isArray(targetIds) ? targetIds : []);
  const errorByPath = new Map();
  (response?.errors || []).forEach((item) => {
    const directKey = String(item.path || "").trim().toLowerCase();
    const baseKey = basenameFromPath(item.path || "").toLowerCase();
    if (directKey) errorByPath.set(directKey, item);
    if (baseKey) errorByPath.set(baseKey, item);
  });
  const seamsByRef = new Map();
  (response?.seams || []).forEach((item) => {
    const refKey = basenameFromPath(item.draw_ref || item.path || "").toLowerCase();
    if (!seamsByRef.has(refKey)) seamsByRef.set(refKey, []);
    seamsByRef.get(refKey).push(item);
  });
  const candidatesByRef = new Map();
  (response?.candidates || []).forEach((item) => {
    const refKey = basenameFromPath(item.draw_ref || item.path || "").toLowerCase();
    if (!candidatesByRef.has(refKey)) candidatesByRef.set(refKey, []);
    candidatesByRef.get(refKey).push(normalizeParseCandidateItem(item));
  });

  appState.parseQueue = appState.parseQueue.map((item) => {
    if (!targetSet.has(item.id)) return item;
    const directKey = String(item.path || "").trim().toLowerCase();
    const baseKey = basenameFromPath(item.path || item.fileName).toLowerCase();
    const error = errorByPath.get(directKey) || errorByPath.get(baseKey);
    const seams = seamsByRef.get(baseKey) || [];
    const candidates = candidatesByRef.get(baseKey) || [];
    if (error) {
      return {
        ...item,
        status: "failed",
        progress: 100,
        errorCode: String(error.code || "PARSE_FAILED"),
        errorMessage: String(error.message || "解析失败"),
        reviewStatus: "pending",
        seams: [],
        candidates: []
      };
    }
    return {
      ...item,
      status: "success",
      progress: 100,
      errorCode: "",
      errorMessage: "",
      reviewStatus: "pending",
      seams: seams.map((seam) => normalizeParseSeamItem(seam)),
      candidates
    };
  });
  return rebuildParseResultFromQueue(response?.trace_id || "");
}

async function runMockParse(queue, request) {
  await new Promise((resolve) => window.setTimeout(resolve, 900));
  const seams = [];
  const candidates = [];
  const errors = [];
  const logs = [
    {
      level: "info",
      message: `mock parser received ${queue.length} files for ${request.project_id}`
    }
  ];

  queue.forEach((item, index) => {
    if (!item.fileType) {
      errors.push({
        code: "PARSE_UNSUPPORTED_FILE_TYPE",
        message: "unsupported file type",
        path: item.path || item.fileName
      });
      return;
    }
    const confidence = item.fileType === "dwg" ? 0.66 + index * 0.04 : 0.8 + index * 0.03;
    if (item.fileType === "pdf") {
      seams.push({
        weld_id: `W-AUTO-${String(index + 1).padStart(3, "0")}`,
        draw_ref: item.fileName || basenameFromPath(item.path),
        weld_symbol: "FW",
        material_spec: "P-No.1",
        thickness_mm: 10 + index * 4,
        position_code: "2G",
        confidence_score: Math.min(0.96, confidence),
        review_status: confidence >= 0.85 ? "pending" : "uncertain"
      });
    }
    candidates.push({
      candidate_id: `WC-${String(index + 1).padStart(4, "0")}`,
      draw_ref: item.fileName || basenameFromPath(item.path),
      sheet_no: `S-${String(index + 1).padStart(2, "0")}`,
      page_index: 0,
      source_kind: item.fileType === "dwg" ? "vector" : "hybrid",
      anchor_bbox: {
        x: 120 + index * 40,
        y: 180 + index * 30,
        w: 120,
        h: 72
      },
      candidate_type: item.fileType === "dwg" ? "branch_joint" : "butt_joint",
      joint_geometry: item.fileType === "dwg" ? "pipe_branch" : "plate_butt",
      material_guess_a: item.fileType === "dwg" ? "P-No.1" : "P-No.1",
      material_guess_b: item.fileType === "dwg" ? "P-No.8" : "P-No.1",
      thickness_guess_a_mm: 10 + index * 4,
      thickness_guess_b_mm: item.fileType === "dwg" ? 8 + index * 3 : 10 + index * 4,
      position_guess: item.fileType === "dwg" ? "5G" : "2G",
      weld_symbol_guess: item.fileType === "dwg" ? "BW" : "FW",
      confidence_score: Math.min(item.fileType === "dwg" ? 0.82 : 0.9, confidence + (item.fileType === "dwg" ? 0.08 : 0.04)),
      review_status: item.fileType === "dwg" ? "uncertain" : "pending",
      evidence: [
        {
          type: item.fileType === "dwg" ? "geometry_branch" : "geometry_butt_joint",
          score: 0.42,
          source_ref: item.fileName || basenameFromPath(item.path),
          summary: item.fileType === "dwg" ? "检测到支管相贯连接" : "检测到对接边界"
        },
        {
          type: "material_label_nearby",
          score: 0.17,
          source_ref: "ocr/material",
          summary: `邻近材料标注 ${item.fileType === "dwg" ? "P-No.1 / P-No.8" : "P-No.1"}`
        }
      ]
    });
    logs.push({
      level: "info",
      message: `mock parsed ${item.fileName || item.path}`
    });
  });

  let status = "success";
  if (errors.length && seams.length) status = "partial";
  if (errors.length && !seams.length) status = "failed";
  return {
    trace_id: request.trace_id,
    status,
    seams,
    candidates,
    errors,
    logs
  };
}

function mapExtractedSeamToReviewRow(item, index) {
  const materialSpec = String(item.material_spec || "P-No.1");
  const [matA, matB] = materialSpec.includes("/") ? materialSpec.split("/").map((value) => value.trim()) : [materialSpec, materialSpec];
  const confidence = Number(item.confidence_score) || 0;
  const reviewStatus = normalizeParseSeamReviewStatus(item.review_status, confidence);
  const sourceType = String(item.source_kind || "").trim().toLowerCase() === "manual" ? "manual" : "explicit";
  return {
    id: String(item.weld_id || `W-PARSE-${index + 1}`),
    matA: matA || "P-No.1",
    matB: matB || matA || "P-No.1",
    thkA: Number(item.thickness_mm) || 0,
    thkB: Number(item.thickness_mm) || 0,
    pos: String(item.position_code || "1G"),
    symbol: String(item.weld_symbol || "BW"),
    conf: confidence,
    status: reviewStatus === "uncertain" ? "uncertain" : reviewStatus === "confirmed" ? "confirmed" : "pending",
    sourceType,
    sourceDrawRef: String(item.draw_ref || ""),
    sourceCandidateId: ""
  };
}

function mapCandidateToReviewRow(item, index) {
  const confidence = Number(item.confidence_score) || 0;
  const reviewStatus = normalizeParseCandidateReviewStatus(item.review_status, confidence);
  return {
    id: String(item.accepted_weld_id || item.candidate_id || `W-CAND-${index + 1}`),
    matA: String(item.material_guess_a || "P-No.1"),
    matB: String(item.material_guess_b || item.material_guess_a || "P-No.1"),
    thkA: Number(item.thickness_guess_a_mm) || 0,
    thkB: Number(item.thickness_guess_b_mm) || Number(item.thickness_guess_a_mm) || 0,
    pos: String(item.position_guess || "1G"),
    symbol: String(item.weld_symbol_guess || "BW"),
    conf: confidence,
    status: reviewStatus === "accepted" ? "pending" : reviewStatus === "uncertain" ? "uncertain" : "pending",
    sourceType: "candidate",
    sourceDrawRef: String(item.draw_ref || ""),
    sourceCandidateId: String(item.candidate_id || "")
  };
}

function loadParseResultIntoSeams(options = {}) {
  const { selectedOnly = false, acceptedOnly = false } = options;
  const result = appState.parseResult;
  const selectedItem = getSelectedParseQueueItem();
  const explicitSeams = selectedOnly
    ? selectedItem?.seams || []
    : acceptedOnly
      ? appState.parseQueue
          .filter((item) => item.reviewStatus === "accepted")
          .flatMap((item) => item.seams || [])
      : Array.isArray(result?.seams)
        ? result.seams
        : [];
  const acceptedCandidates = selectedOnly
    ? (selectedItem?.candidates || []).filter((item) => normalizeParseCandidateReviewStatus(item.review_status, item.confidence_score) === "accepted")
    : acceptedOnly
      ? appState.parseQueue
          .filter((item) => item.reviewStatus === "accepted")
          .flatMap((item) => (item.candidates || []).filter((candidate) => normalizeParseCandidateReviewStatus(candidate.review_status, candidate.confidence_score) === "accepted"))
      : appState.parseQueue.flatMap((item) =>
          (item.candidates || []).filter((candidate) => normalizeParseCandidateReviewStatus(candidate.review_status, candidate.confidence_score) === "accepted")
        );
  if (!explicitSeams.length && !acceptedCandidates.length) {
    addEvent(
      selectedOnly
        ? "当前图纸没有可载入的显式焊缝或已接受候选"
        : acceptedOnly
          ? "当前没有已接受图纸中的显式焊缝或已接受候选"
          : "当前没有可载入的解析焊缝结果"
    );
    return false;
  }
  clearSeamImportPreview();
  appState.seamRows = [
    ...explicitSeams.map((item, index) => mapExtractedSeamToReviewRow(item, index)),
    ...acceptedCandidates.map((item, index) => mapCandidateToReviewRow(item, explicitSeams.length + index))
  ];
  renderSeamTable();
  setMasterDirty("seam", true);
  setView("seam");
  addEvent(
    selectedOnly
      ? `当前图纸解析结果已载入焊缝确认，显式 ${explicitSeams.length} 条，候选 ${acceptedCandidates.length} 条`
      : acceptedOnly
        ? `已接受图纸解析结果已载入焊缝确认，显式 ${explicitSeams.length} 条，候选 ${acceptedCandidates.length} 条`
      : `解析结果已载入焊缝确认，显式 ${explicitSeams.length} 条，候选 ${acceptedCandidates.length} 条`
  );
  return true;
}

async function pickDrawingFilesFromDesktop() {
  if (!isTauriRuntime()) return [];
  const payload = await invokeTauriCommand("pick_drawing_files", {});
  const rows = JSON.parse(payload);
  return Array.isArray(rows)
    ? rows.map((item) =>
        buildParseQueueItem({
          path: item.path,
          fileName: item.file_name,
          fileType: item.file_type,
          sizeBytes: item.size_bytes,
          source: "desktop",
          virtual: false
        })
      )
    : [];
}

async function runParseQueue(options = {}) {
  const { retryFailedOnly = false, targetIds = [] } = options;
  if (appState.parseBusy) return null;
  updateParseOptionsFromForm();

  let queue = [];
  if (Array.isArray(targetIds) && targetIds.length) {
    const targetSet = new Set(targetIds);
    queue = appState.parseQueue.filter((item) => targetSet.has(item.id));
  } else if (retryFailedOnly) {
    queue = appState.parseQueue.filter((item) => item.status === "failed");
  } else {
    queue = appState.parseQueue;
  }

  if (!queue.length) {
    appendLog(retryFailedOnly ? "当前没有可重试的失败任务" : "请先加入要解析的图纸");
    return null;
  }

  appState.parseBusy = true;
  const activeIds = queue.map((item) => item.id);
  if (activeIds.length === 1) {
    appState.parseSelectedQueueId = activeIds[0];
  }
  appState.parseQueue = appState.parseQueue.map((item) =>
    activeIds.includes(item.id)
      ? {
          ...item,
          status: "parsing",
          progress: 5,
          errorCode: "",
          errorMessage: "",
          reviewStatus: "pending",
          previewLoadState: item.previewUrl ? item.previewLoadState : "idle",
          previewError: "",
          seams: [],
          candidates: []
        }
      : item
  );
  setParseProgress(5, retryFailedOnly ? "准备重试失败任务" : "准备解析图纸");
  renderParseWorkspace();
  startParseProgressTimer(activeIds);
  appendLog(`${retryFailedOnly ? "开始重试" : "开始解析"} ${queue.length} 份图纸`);

  const request = buildParseRequestPayload(queue);
  const startedAt = new Date().toISOString();
  const parseMode = isTauriRuntime() && queue.every((item) => !item.virtual && item.path) ? "backend" : "mock";
  try {
    let response = null;
    if (parseMode === "backend") {
      const payload = await invokeTauriCommand("run_parse", {
        requestJson: JSON.stringify(request)
      });
      response = JSON.parse(payload);
    } else {
      response = await runMockParse(queue, request);
    }
    (response?.logs || []).forEach((item) => appendLog(item.message || "-", item.level || "info"));
    const result = applyParseResponseToQueue(activeIds, response);
    clearParseProgressTimer();
    setParseProgress(100, `解析完成 ${String(response?.status || "success").toUpperCase()}`);
    appState.parseBusy = false;
    appendParseHistoryEntry(
      buildParseHistoryEntry({
        request,
        response,
        queue: appState.parseQueue.filter((item) => activeIds.includes(item.id)),
        mode: parseMode,
        startedAt,
        completedAt: new Date().toISOString()
      })
    );
    renderParseWorkspace();
    appendLog(`解析完成：焊缝 ${result?.seams?.length || 0} 条，错误 ${result?.errors?.length || 0} 条`);
    return response;
  } catch (error) {
    clearParseProgressTimer();
    appState.parseBusy = false;
    appState.parseQueue = appState.parseQueue.map((item) =>
      activeIds.includes(item.id)
        ? {
            ...item,
            status: "failed",
            progress: 100,
            errorCode: "PARSE_RUNTIME",
            errorMessage: String(error),
            reviewStatus: "pending",
            seams: [],
            candidates: []
          }
        : item
    );
    rebuildParseResultFromQueue(request.trace_id);
    setParseProgress(100, "解析失败");
    appendParseHistoryEntry(
      buildParseHistoryEntry({
        request,
        response: {
          trace_id: request.trace_id,
          status: "failed",
          seams: [],
          errors: activeIds.map((itemId) => {
            const target = appState.parseQueue.find((row) => row.id === itemId);
            return {
              code: target?.errorCode || "PARSE_RUNTIME",
              message: target?.errorMessage || String(error),
              path: target?.path || target?.fileName || itemId
            };
          })
        },
        queue: appState.parseQueue.filter((item) => activeIds.includes(item.id)),
        mode: parseMode,
        startedAt,
        completedAt: new Date().toISOString()
      })
    );
    renderParseWorkspace();
    appendLog(`解析失败: ${String(error)}`, "error");
    return null;
  }
}

function simulateParse() {
  return runParseQueue();
}
function setStatusSnapshot() {
  document.querySelector("#status-standard").textContent = appState.standard;
  const hasError = appState.conflicts.some((item) => item.severity === "error");
  document.querySelector("#status-match").textContent = hasError ? "partial" : "match";
  document.querySelector("#status-license").textContent = appState.licenseStatus;
}

function getCurrentProjectId() {
  return String(appState.currentProject?.id || PROTOTYPE_PROJECT_ID);
}

function getCurrentProjectName() {
  return String(appState.currentProject?.name || "Prototype UI Project");
}

function normalizeProjectRecord(item) {
  return {
    id: String(item?.project_id || item?.id || PROTOTYPE_PROJECT_ID),
    name: String(item?.project_name || item?.name || "未命名项目"),
    company: String(item?.company_name || item?.company || ""),
    drawingType: String(item?.drawing_type || item?.drawingType || "PDF + DWG"),
    standard: fromStandardCode(item?.standard_code || item?.standard || "asme_ix"),
    archivedAt: Number(item?.archived_at) || 0,
    updatedAt: Number(item?.updated_at) || Math.floor(Date.now() / 1000)
  };
}

function syncProjectFormValues() {
  if (!projectForm) return;
  const project = appState.currentProject || DEFAULT_PROJECT;
  projectForm.elements.project_name.value = project.name;
  projectForm.elements.project_code.value = project.id;
  projectForm.elements.company.value = project.company;
  projectForm.elements.drawing_type.value = project.drawingType;
  projectForm.elements.standard_code.value = project.standard;
  if (projectFormMode) {
    projectFormMode.textContent = project.archivedAt ? "查看已归档项目" : "编辑当前项目";
  }
}

function renderProjectRecentList() {
  if (!projectRecentBody) return;
  const rows = [...(appState.projects || [])].sort((left, right) => right.updatedAt - left.updatedAt);
  if (!rows.length) {
    projectRecentBody.innerHTML = '<tr><td colspan="8">暂无项目记录</td></tr>';
    if (projectRecentCaption) {
      projectRecentCaption.textContent = "当前还没有已保存项目，可先通过右侧表单创建。";
    }
    return;
  }

  const archivedCount = rows.filter((item) => item.archivedAt).length;
  if (projectRecentCaption) {
    projectRecentCaption.textContent = `共 ${rows.length} 个项目，已归档 ${archivedCount} 个。`;
  }
  projectRecentBody.innerHTML = rows
    .map((item) => {
      const isCurrent = item.id === getCurrentProjectId();
      const archived = Boolean(item.archivedAt);
      return `
        <tr${isCurrent ? ' class="is-selected-row"' : ""}>
          <td>${formatCreatedAt(item.updatedAt)}</td>
          <td>${item.id}</td>
          <td>${item.name}</td>
          <td>${item.company || "-"}</td>
          <td>${item.drawingType || "-"}</td>
          <td>${item.standard}</td>
          <td>${archived ? statusTag("已归档", "warn") : statusTag("活动", "ok")}</td>
          <td>
            <div class="button-row">
              <button class="ghost small" data-project-open="${item.id}">打开</button>
              <button class="ghost small" data-project-archive="${item.id}" data-archived="${archived ? "0" : "1"}">${archived ? "恢复" : "归档"}</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderProjectHome() {
  const project = appState.currentProject || DEFAULT_PROJECT;
  if (projectCurrentId) projectCurrentId.textContent = project.id;
  if (projectCurrentName) projectCurrentName.textContent = project.name;
  if (projectCurrentSummary) {
    const archivedText = project.archivedAt ? "已归档，可打开查看但默认不参与新匹配。" : "活动项目，可继续导入、匹配和导出。";
    projectCurrentSummary.textContent = `企业：${project.company || "-"}；标准：${project.standard}；图纸类型：${project.drawingType || "-"}；${archivedText}`;
  }
  if (projectCurrentPills) {
    projectCurrentPills.innerHTML = `
      <span class="pill">${project.drawingType || "-"}</span>
      <span class="pill">${project.standard}</span>
      <span class="pill">${project.archivedAt ? "已归档" : "活动项目"}</span>
    `;
  }
  if (projectArchiveCurrentBtn) {
    projectArchiveCurrentBtn.textContent = project.archivedAt ? "恢复当前项目" : "归档当前项目";
  }
  if (projectLastScore) {
    const latestReport = appState.matchReports.find((item) => item.projectId === project.id);
    projectLastScore.textContent = latestReport ? latestReport.decision : "-";
  }
  syncProjectFormValues();
  renderProjectRecentList();
}

function toStandardCode(code) {
  return code === "CN_GB" ? "cn_gb" : "asme_ix";
}

function parseThicknessRange(rawRange) {
  const [minRaw, maxRaw] = String(rawRange || "")
    .split("-")
    .map((item) => Number(item));
  const min = Number.isFinite(minRaw) ? minRaw : 0;
  const max = Number.isFinite(maxRaw) ? maxRaw : Math.max(200, min);
  return { min, max };
}

function splitScope(raw, delimiter = "/") {
  return String(raw || "")
    .split(delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toReviewStatus(status) {
  if (status === "confirmed") return "confirmed";
  if (status === "changed") return "changed";
  if (status === "uncertain") return "uncertain";
  return "pending";
}

function fromReviewStatus(status) {
  const value = String(status || "").toLowerCase();
  if (value === "confirmed") return "confirmed";
  if (value === "changed") return "changed";
  if (value === "uncertain") return "uncertain";
  return "pending";
}

function seamRowToPayload(row) {
  return {
    weld_id: row.id,
    material_group_a: row.matA,
    material_group_b: row.matB,
    thickness_a_mm: Number(row.thkA),
    thickness_b_mm: Number(row.thkB),
    position_code: row.pos,
    process_hint: "GTAW",
    review_status: toReviewStatus(row.status)
  };
}

function seamPayloadToRow(item) {
  return {
    id: String(item.weld_id || ""),
    matA: String(item.material_group_a || ""),
    matB: String(item.material_group_b || ""),
    thkA: Number(item.thickness_a_mm) || 0,
    thkB: Number(item.thickness_b_mm) || 0,
    pos: String(item.position_code || ""),
    symbol: "BW",
    conf: 0.8,
    status: fromReviewStatus(item.review_status)
  };
}

function buildMatchRequestPayload(useStoredMasterData = false) {
  const standardCode = toStandardCode(appState.standard);
  return {
    trace_id: appState.traceId,
    project_id: getCurrentProjectId(),
    standard_code: standardCode,
    inventory_policy: "warn",
    top_k: 3,
    weld_seams: appState.seamRows.map((row) => seamRowToPayload(row)),
    pqr_candidates: useStoredMasterData ? [] : appState.pqrRows.map((row) => pqrRowToCandidate(row)),
    welder_candidates: useStoredMasterData
      ? []
      : appState.welderRows.map((row) => welderRowToCandidate(row, standardCode)),
    required_consumables: [
      { material_code: "ER70S-6", required_qty: 8.0 },
      { material_code: "ER308L", required_qty: 5.0 }
    ],
    consumable_batches: useStoredMasterData ? [] : appState.batchRows
  };
}

function fromStandardCode(code) {
  return String(code || "").toLowerCase() === "cn_gb" ? "CN_GB" : "ASME_IX";
}

function pqrRowToCandidate(row) {
  const range = parseThicknessRange(row.range);
  return {
    pqr_id: row.id,
    standard_code: toStandardCode(row.standard),
    process_code: String(row.process).split("+")[0],
    material_group_scope: ["P-No.1", "P-No.8", "P-No.11"],
    thickness_min_mm: range.min,
    thickness_max_mm: range.max,
    position_scope: splitScope(row.pos),
    dissimilar_support: Boolean(row.dissimilar),
    thickness_mismatch_support: Boolean(row.thicknessMismatch),
    thickness_delta_max_mm: Number(row.maxDelta) || 0,
    valid_to: row.valid,
    status: row.status === "active" ? "active" : "inactive"
  };
}

function welderRowToCandidate(row, standardCode = toStandardCode(appState.standard)) {
  return {
    welder_id: row.id,
    cert_no: row.cert,
    standard_code: standardCode,
    process_code: String(row.process).split("+")[0],
    material_group_scope: splitScope(row.group),
    position_scope: splitScope(row.pos),
    dissimilar_qualified: Boolean(row.dissimilarQualified),
    thickness_mismatch_qualified: Boolean(row.thicknessMismatchQualified),
    thickness_delta_max_mm: Number(row.thicknessDeltaMax) || 0,
    expiry_date: row.exp,
    status: row.status === "active" ? "active" : "inactive"
  };
}

function pqrCandidateToRow(item) {
  return {
    id: item.pqr_id,
    standard: fromStandardCode(item.standard_code),
    process: item.process_code,
    range: `${Number(item.thickness_min_mm) || 0}-${Number(item.thickness_max_mm) || 0}`,
    pos: Array.isArray(item.position_scope) ? item.position_scope.join("/") : "",
    dissimilar: Boolean(item.dissimilar_support),
    thicknessMismatch: Boolean(item.thickness_mismatch_support),
    maxDelta: Number(item.thickness_delta_max_mm) || 0,
    valid: item.valid_to || "",
    status: item.status || "active"
  };
}

function welderCandidateToRow(item) {
  return {
    id: item.welder_id,
    cert: item.cert_no,
    process: item.process_code,
    pos: Array.isArray(item.position_scope) ? item.position_scope.join("/") : "",
    group: Array.isArray(item.material_group_scope) ? item.material_group_scope.join("/") : "",
    dissimilarQualified: Boolean(item.dissimilar_qualified),
    thicknessMismatchQualified: Boolean(item.thickness_mismatch_qualified),
    thicknessDeltaMax: Number(item.thickness_delta_max_mm) || 0,
    exp: item.expiry_date || "",
    status: item.status || "active"
  };
}

async function listCommandItems(commandName) {
  const payload = await invokeTauriCommand(commandName, {
    dbPath: PROTOTYPE_DB_PATH,
    projectId: getCurrentProjectId(),
    limit: MASTER_DATA_SYNC_LIMIT
  });
  return JSON.parse(payload);
}

async function reloadProjectsFromBackend(includeArchived = true) {
  const payload = await invokeTauriCommand("list_projects", {
    dbPath: PROTOTYPE_DB_PATH,
    limit: 50,
    includeArchived
  });
  const rows = JSON.parse(payload);
  appState.projects = rows.map((item) => normalizeProjectRecord(item));
  renderProjectHome();
  return appState.projects;
}

async function saveProjectRecord(project) {
  const normalized = normalizeProjectRecord({
    project_id: project.id,
    project_name: project.name,
    company_name: project.company,
    drawing_type: project.drawingType,
    standard_code: project.standard,
    archived_at: project.archivedAt,
    updated_at: project.updatedAt
  });
  if (typeof window.__TAURI_INTERNALS__?.invoke === "function") {
    await invokeTauriCommand("upsert_project", {
      dbPath: PROTOTYPE_DB_PATH,
      projectId: normalized.id,
      projectName: normalized.name,
      companyName: normalized.company,
      drawingType: normalized.drawingType,
      standardCode: normalized.standard
    });
    await reloadProjectsFromBackend(true);
    return appState.projects.find((item) => item.id === normalized.id) || normalized;
  }

  normalized.updatedAt = Math.floor(Date.now() / 1000);
  normalized.archivedAt = 0;
  const existingIndex = appState.projects.findIndex((item) => item.id === normalized.id);
  if (existingIndex >= 0) {
    appState.projects.splice(existingIndex, 1, normalized);
  } else {
    appState.projects.unshift(normalized);
  }
  renderProjectHome();
  return normalized;
}

async function setCurrentProjectContext(project, options = {}) {
  const { reloadContext = true } = options;
  const previousProjectId = getCurrentProjectId();
  appState.currentProject = normalizeProjectRecord(project);
  appState.standard = appState.currentProject.standard;
  if (previousProjectId !== appState.currentProject.id || !appState.parseLogs.length) {
    resetParseWorkspace();
  }
  loadParseHistoryForProject(appState.currentProject.id);
  renderProjectHome();
  renderParseWorkspace();
  setStatusSnapshot();
  if (!reloadContext) return;
  await bootstrapMasterDataFromBackend();
  await refreshExecutionHistory(true);
}

async function openProjectById(projectId) {
  const local = appState.projects.find((item) => item.id === String(projectId || "").trim());
  if (local) {
    await setCurrentProjectContext(local);
    return true;
  }
  if (typeof window.__TAURI_INTERNALS__?.invoke !== "function") return false;
  const payload = await invokeTauriCommand("get_project", {
    dbPath: PROTOTYPE_DB_PATH,
    projectId: projectId
  });
  const item = JSON.parse(payload);
  if (!item) return false;
  await setCurrentProjectContext(normalizeProjectRecord(item));
  await reloadProjectsFromBackend(true);
  return true;
}

async function archiveProjectRecord(projectId, archived) {
  const normalizedId = String(projectId || "").trim();
  if (!normalizedId) return false;
  if (typeof window.__TAURI_INTERNALS__?.invoke === "function") {
    await invokeTauriCommand("archive_project", {
      dbPath: PROTOTYPE_DB_PATH,
      projectId: normalizedId,
      archived
    });
    await reloadProjectsFromBackend(true);
  } else {
    appState.projects = appState.projects.map((item) => item.id === normalizedId
      ? { ...item, archivedAt: archived ? Math.floor(Date.now() / 1000) : 0, updatedAt: Math.floor(Date.now() / 1000) }
      : item);
  }

  if (getCurrentProjectId() === normalizedId) {
    const target = appState.projects.find((item) => item.id === normalizedId)
      || { ...appState.currentProject, archivedAt: archived ? Math.floor(Date.now() / 1000) : 0 };
    await setCurrentProjectContext(target, { reloadContext: false });
  } else {
    renderProjectHome();
  }
  return true;
}

async function bootstrapProjectContext() {
  if (typeof window.__TAURI_INTERNALS__?.invoke !== "function") {
    loadParseHistoryForProject(getCurrentProjectId());
    renderProjectHome();
    renderParseWorkspace();
    return;
  }
  try {
    const rows = await reloadProjectsFromBackend(true);
    const activeProjects = rows.filter((item) => !item.archivedAt);
    const preferred = activeProjects.find((item) => item.id === getCurrentProjectId()) || activeProjects[0];
    if (preferred) {
      await setCurrentProjectContext(preferred, { reloadContext: false });
    } else {
      renderProjectHome();
    }
  } catch (error) {
    addEvent(`项目列表加载失败，继续使用本地默认项目: ${String(error)}`);
    renderProjectHome();
  }
  await bootstrapMasterDataFromBackend();
  await refreshExecutionHistory(true);
}

async function syncRowsToBackend(rows, commandSet) {
  const remoteRows = await listCommandItems(commandSet.list);
  const remoteIds = new Set(remoteRows.map((item) => String(item[commandSet.idField] || "")));
  const localIds = new Set(rows.map((row) => String(commandSet.localId(row) || "")));

  for (const remote of remoteRows) {
    const id = String(remote[commandSet.idField] || "");
    if (id && !localIds.has(id)) {
      await invokeTauriCommand(commandSet.delete, {
        dbPath: PROTOTYPE_DB_PATH,
        projectId: getCurrentProjectId(),
        [commandSet.deleteIdArg]: id
      });
    }
  }

  for (const row of rows) {
    await invokeTauriCommand(commandSet.upsert, {
      dbPath: PROTOTYPE_DB_PATH,
      projectId: getCurrentProjectId(),
      [commandSet.upsertArg]: JSON.stringify(commandSet.toPayload(row))
    });
  }

  return { localCount: rows.length, remoteCount: remoteIds.size };
}

async function syncMasterDataToBackend() {
  await syncRowsToBackend(appState.seamRows, {
    list: "list_seams",
    upsert: "upsert_seam",
    delete: "delete_seam",
    upsertArg: "seamJson",
    deleteIdArg: "weldId",
    idField: "weld_id",
    localId: (row) => row.id,
    toPayload: (row) => seamRowToPayload(row)
  });

  await syncRowsToBackend(appState.pqrRows, {
    list: "list_pqrs",
    upsert: "upsert_pqr",
    delete: "delete_pqr",
    upsertArg: "pqrJson",
    deleteIdArg: "pqrId",
    idField: "pqr_id",
    localId: (row) => row.id,
    toPayload: (row) => pqrRowToCandidate(row)
  });

  await syncRowsToBackend(appState.welderRows, {
    list: "list_welders",
    upsert: "upsert_welder",
    delete: "delete_welder",
    upsertArg: "welderJson",
    deleteIdArg: "welderId",
    idField: "welder_id",
    localId: (row) => row.id,
    toPayload: (row) => welderRowToCandidate(row)
  });

  await syncRowsToBackend(appState.batchRows, {
    list: "list_batches",
    upsert: "upsert_batch",
    delete: "delete_batch",
    upsertArg: "batchJson",
    deleteIdArg: "batchNo",
    idField: "batch_no",
    localId: (row) => row.batch_no,
    toPayload: (row) => row
  });

  setMasterDirty("seam", false);
  setMasterDirty("pqr", false);
  setMasterDirty("welder", false);
  setMasterDirty("batch", false);
}

async function reloadSeamRowsFromBackend() {
  const rows = await listCommandItems("list_seams");
  appState.seamRows = rows.map((item) => seamPayloadToRow(item));
  renderSeamTable();
  clearSeamImportPreview();
  setMasterDirty("seam", false);
}

async function reloadPqrRowsFromBackend() {
  const rows = await listCommandItems("list_pqrs");
  appState.pqrRows = rows.map((item) => pqrCandidateToRow(item));
  renderPqr();
  setMasterDirty("pqr", false);
}

async function reloadWelderRowsFromBackend() {
  const rows = await listCommandItems("list_welders");
  appState.welderRows = rows.map((item) => welderCandidateToRow(item));
  renderWelder();
  setMasterDirty("welder", false);
}

async function reloadBatchRowsFromBackend() {
  const rows = await listCommandItems("list_batches");
  appState.batchRows = rows.map((item) => normalizeBatchRow(item));
  renderBatch();
  setMasterDirty("batch", false);
}

async function reloadMatchReportsFromBackend() {
  const payload = await invokeTauriCommand("list_match_reports", {
    dbPath: PROTOTYPE_DB_PATH,
    projectId: getCurrentProjectId(),
    limit: EXECUTION_HISTORY_LIMIT
  });
  const rows = JSON.parse(payload);
  appState.matchReports = rows.map((item) => ({
    traceId: String(item.trace_id || ""),
    projectId: String(item.project_id || ""),
    decision: String(item.decision || "partial"),
    rulePackageVersion: String(item.rule_package_version || "-"),
    requestJson: String(item.request_json || ""),
    responseJson: String(item.response_json || ""),
    request: parseJsonSafely(item.request_json),
    response: parseJsonSafely(item.response_json),
    createdAt: Number(item.created_at) || 0
  }));
  syncSelectedMatchTrace();
  renderMatchReports();
  renderSelectedMatchDetail();
}

async function reloadAuditLogsFromBackend() {
  const payload = await invokeTauriCommand("list_audit_logs", {
    dbPath: PROTOTYPE_DB_PATH,
    projectId: getCurrentProjectId(),
    limit: EXECUTION_HISTORY_LIMIT
  });
  const rows = JSON.parse(payload);
  appState.auditLogs = rows.map((item) => ({
    traceId: String(item.trace_id || ""),
    action: String(item.action || "-"),
    result: String(item.result || "-"),
    payloadJson: String(item.payload_json || ""),
    payload: parseJsonSafely(item.payload_json),
    createdAt: Number(item.created_at) || 0
  }));
  renderAuditLogs();
  renderSelectedMatchDetail();
}

async function reloadMatchBaselinesFromBackend() {
  const payload = await invokeTauriCommand("list_match_baselines", {
    dbPath: PROTOTYPE_DB_PATH,
    projectId: getCurrentProjectId(),
    limit: EXECUTION_HISTORY_LIMIT
  });
  const rows = JSON.parse(payload);
  appState.matchBaselines = rows.map((item) => ({
    traceId: String(item.trace_id || ""),
    projectId: String(item.project_id || getCurrentProjectId()),
    label: String(item.baseline_label || ""),
    decision: String(item.decision || "partial"),
    rulePackageVersion: String(item.rule_package_version || "-"),
    summaryJson: String(item.summary_json || "{}"),
    summary: item.summary || parseJsonSafely(item.summary_json),
    createdAt: Number(item.created_at) || 0,
    reviewStatus: String(item.review_status || "unknown"),
    reviewReasons: Array.isArray(item.review_reasons) ? item.review_reasons.map((value) => String(value)) : [],
    latestChangeAt: Number(item.latest_change_at) || 0,
    changeCounts: item.change_counts || { seam: 0, pqr: 0, welder: 0, batch: 0 }
  }));
  renderMatchBaselines();
  syncFreezeBaselineButtonState();
  await refreshBaselineComparisonForSelectedTrace();
  await refreshBaselineImpactForSelectedTrace();
}

async function refreshExecutionHistory(silent = false) {
  if (typeof window.__TAURI_INTERNALS__?.invoke !== "function") {
    return;
  }
  try {
    await Promise.all([reloadMatchReportsFromBackend(), reloadAuditLogsFromBackend(), reloadMatchBaselinesFromBackend()]);
    renderProjectHome();
    if (!silent) addEvent("匹配历史已刷新");
  } catch (error) {
    if (!silent) addEvent(`匹配历史加载失败: ${String(error)}`);
  }
}

async function bootstrapMasterDataFromBackend() {
  if (typeof window.__TAURI_INTERNALS__?.invoke !== "function") {
    return;
  }
  try {
    await Promise.all([
      reloadSeamRowsFromBackend(),
      reloadPqrRowsFromBackend(),
      reloadWelderRowsFromBackend(),
      reloadBatchRowsFromBackend()
    ]);
    addEvent("主数据已从后端加载");
  } catch (error) {
    addEvent(`启动时加载主数据已跳过: ${String(error)}`);
  }
}

async function invokeTauriCommand(command, args) {
  const invoke = window.__TAURI_INTERNALS__?.invoke;
  if (typeof invoke !== "function") {
    throw new Error("tauri runtime invoke is unavailable");
  }
  return invoke(command, args);
}

function applyMatchResponse(response) {
  const decision = String(response?.decision || "fail");
  const recommended = response?.recommended || null;

  document.querySelector("#decision-label").textContent = decision;
  document.querySelector("#status-match").textContent = decision;
  document.querySelector("#best-pqr").textContent = recommended?.pqr_id || "-";
  document.querySelector("#best-welder").textContent = recommended?.welder_id || "-";
  document.querySelector("#best-score").textContent = Number(recommended?.score?.final_score || 0).toFixed(2);

  appState.alternatives = (response?.alternatives || []).map((item) => ({
    pqr: item.pqr_id,
    welder: item.welder_id,
    score: Number(item?.score?.final_score || 0)
  }));

  appState.conflicts = (response?.hard_conflicts || []).map((item) => ({
    entity: item.entity_type,
    field: item.field_key,
    actual: item.actual_value,
    expected: item.expected_value,
    clause: item.clause_ref,
    severity: String(item.severity || "warning")
  }));

  appState.inventoryAlerts = (response?.inventory_alerts || []).map((item) => ({
    materialCode: String(item.material_code || ""),
    batchNo: String(item.batch_no || ""),
    requiredQty: Number(item.required_qty || 0),
    availableQty: Number(item.available_qty || 0),
    expiryDate: String(item.expiry_date || ""),
    clauseRef: String(item.clause_ref || ""),
    severity: String(item.severity || "warning"),
    suggestion: String(item.suggestion || "")
  }));

  renderAlternatives();
  renderInventoryAlerts();
  const activeSeverity = document.querySelector(".filter-btn.active")?.dataset?.severity || "all";
  renderConflicts(activeSeverity);
  setStatusSnapshot();
}

function runMatchFallback() {
  const score = 0.7 + Math.random() * 0.22;
  const pick = appState.alternatives[Math.floor(Math.random() * appState.alternatives.length)];
  document.querySelector("#best-pqr").textContent = pick.pqr;
  document.querySelector("#best-welder").textContent = pick.welder;
  document.querySelector("#best-score").textContent = score.toFixed(2);
  const decision = appState.conflicts.some((item) => item.severity === "error") ? "partial" : "match";
  document.querySelector("#decision-label").textContent = decision;
  document.querySelector("#status-match").textContent = decision;
  appState.inventoryAlerts = [];
  renderInventoryAlerts();
  addEvent(`已使用回退模拟: ${pick.pqr} + ${pick.welder}`);
}

async function runMatch(options = {}) {
  const {
    freezeAfter = false,
    preserveSelectionOnFailure = false
  } = options;
  if (!ensureAllMasterRowsValid()) {
    addEvent("匹配已取消: 主数据校验未通过");
    return { attempted: false, response: null };
  }
  const previousTraceId = String(appState.selectedMatchTraceId || "").trim();
  try {
    await syncMasterDataToBackend();
    const requestPayload = buildMatchRequestPayload(true);
    const responseJson = await invokeTauriCommand("run_match", {
      dbPath: PROTOTYPE_DB_PATH,
      projectName: getCurrentProjectName(),
      requestJson: JSON.stringify(requestPayload)
    });
    const response = JSON.parse(responseJson);
    applyMatchResponse(response);
    await refreshExecutionHistory(true);
    if (response.trace_id) {
      setSelectedMatchTrace(response.trace_id);
    }
    if (freezeAfter && response.trace_id) {
      await freezeSelectedMatchAsBaseline();
    }
    addEvent(`后端匹配完成: ${response.trace_id || appState.traceId}`);
    return { attempted: true, response };
  } catch (error) {
    runMatchFallback();
    if (preserveSelectionOnFailure && previousTraceId) {
      setSelectedMatchTrace(previousTraceId);
    }
    addEvent(`后端匹配不可用，已使用回退模拟 (${String(error)})`);
    return { attempted: true, response: null };
  }
}

function addEvent(text) {
  const ul = document.querySelector("#event-stream");
  const li = document.createElement("li");
  li.textContent = `[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] ${text}`;
  ul.prepend(li);
  if (ul.children.length > 8) ul.removeChild(ul.lastElementChild);
}

function bumpTraceId() {
  const parts = appState.traceId.split("-");
  const current = Number(parts[parts.length - 1]) || 0;
  const next = String(current + 1).padStart(5, "0");
  appState.traceId = `${parts.slice(0, -1).join("-")}-${next}`;
  document.querySelector("#trace-id").textContent = appState.traceId;
}

function initHandlers() {
  menuButtons.forEach((btn) => btn.addEventListener("click", () => setView(btn.dataset.view)));

  const allSortButtons = [...document.querySelectorAll(".head-sort-btn")];
  const allFilterButtons = [...document.querySelectorAll(".head-filter-btn")];
  const renderTableByName = (table) => {
    if (table === "pqr") renderPqr();
    if (table === "welder") renderWelder();
  };

  const closeFilterPopover = () => {
    columnFilterPopover.classList.add("hidden");
    uiState.activeFilterContext = null;
  };

  const openFilterPopover = (btn) => {
    const table = btn.dataset.table;
    const filterType = btn.dataset.filterType || "none";
    const filterKey = btn.dataset.filterKey || "";
    const filterLabel = btn.dataset.filterLabel || "No filters";
    const col = btn.dataset.col || "";
    uiState.activeFilterContext = { table, filterType, filterKey, col };

    const colName = btn.closest(".head-cell")?.querySelector("span")?.textContent?.trim() || col;
    columnFilterTitle.textContent = colName;

    if (filterType === "bool") {
      const checked = Boolean(getFilterStateByTable(table)[filterKey]);
      columnFilterBody.innerHTML = `
        <label class="column-filter-check">
          <input id="column-filter-check" type="checkbox" ${checked ? "checked" : ""} />
          ${filterLabel}
        </label>
      `;
    } else {
      columnFilterBody.textContent = "No filters";
    }

    const rect = btn.getBoundingClientRect();
    const popWidth = 180;
    const left = Math.min(window.innerWidth - popWidth - 12, Math.max(12, rect.left + rect.width / 2 - popWidth / 2));
    const top = Math.min(window.innerHeight - 170, rect.bottom + 8);
    columnFilterPopover.style.left = `${left}px`;
    columnFilterPopover.style.top = `${top}px`;
    columnFilterPopover.classList.remove("hidden");
  };

  allSortButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const state = getFilterStateByTable(btn.dataset.table);
      if (state.sortCol === btn.dataset.col) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortCol = btn.dataset.col;
        state.sortDir = "asc";
      }
      syncMasterTableHeaderState();
      renderTableByName(btn.dataset.table);
    });
  });

  allFilterButtons.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      openFilterPopover(btn);
    });
  });

  columnFilterResetBtn.addEventListener("click", () => {
    const context = uiState.activeFilterContext;
    if (!context) return;
    if (context.filterType === "bool") {
      const check = document.querySelector("#column-filter-check");
      if (check) check.checked = false;
    }
  });

  columnFilterOkBtn.addEventListener("click", () => {
    const context = uiState.activeFilterContext;
    if (!context) return;
    if (context.filterType === "bool") {
      const check = document.querySelector("#column-filter-check");
      getFilterStateByTable(context.table)[context.filterKey] = Boolean(check?.checked);
      syncMasterTableHeaderState();
      renderTableByName(context.table);
    }
    closeFilterPopover();
  });

  document.addEventListener("click", (event) => {
    if (columnFilterPopover.classList.contains("hidden")) return;
    if (columnFilterPopover.contains(event.target)) return;
    if (event.target.closest(".head-filter-btn")) return;
    closeFilterPopover();
  });

  syncMasterTableHeaderState();

  const pqrToolbarButtons = ensureMasterToolbarButtons("pqr", "pqr", "新增PQR");
  if (pqrToolbarButtons.add) {
    pqrToolbarButtons.add.addEventListener("click", () => {
      appState.pqrRows.push({
        id: getNextPqrId(),
        standard: appState.standard,
        process: "GTAW",
        range: "0-0",
        pos: "1G",
        dissimilar: false,
        thicknessMismatch: false,
        maxDelta: 0,
        valid: "",
        status: "active"
      });
      renderPqr();
      setMasterDirty("pqr", true);
      addEvent("新增PQR行");
    });
  }
  if (pqrToolbarButtons.sync) {
    pqrToolbarButtons.sync.addEventListener("click", async () => {
      if (!ensureMasterRowsValid("pqr")) return;
      try {
        await syncRowsToBackend(appState.pqrRows, {
          list: "list_pqrs",
          upsert: "upsert_pqr",
          delete: "delete_pqr",
          upsertArg: "pqrJson",
          deleteIdArg: "pqrId",
          idField: "pqr_id",
          localId: (row) => row.id,
          toPayload: (row) => pqrRowToCandidate(row)
        });
        setMasterDirty("pqr", false);
        addEvent("PQR数据已同步到后端");
      } catch (error) {
        addEvent(`PQR同步失败: ${String(error)}`);
      }
    });
  }
  if (pqrToolbarButtons.load) {
    pqrToolbarButtons.load.addEventListener("click", async () => {
      try {
        await reloadPqrRowsFromBackend();
        addEvent("PQR数据已从后端加载");
      } catch (error) {
        addEvent(`PQR加载失败: ${String(error)}`);
      }
    });
  }

  if (pqrBody) {
    pqrBody.addEventListener(
      "blur",
      (event) => {
        const target = event.target;
        const key = target?.dataset?.pqrEdit;
        if (!key) return;
        const [rowId, field] = key.split(":");
        const row = appState.pqrRows.find((item) => item.id === rowId);
        if (!row) return;
        const value = target.textContent.trim();

        if (field === "standard") {
          const normalized = normalizeTextInput(String(value || "").toUpperCase().replace(/\s+/g, "_"));
          if (!normalized.ok || (normalized.value !== "ASME_IX" && normalized.value !== "CN_GB")) {
            renderPqr();
            addEvent(`PQR ${row.id} 已拒绝: 标准必须是 ASME_IX 或 CN_GB`);
            return;
          }
          row[field] = normalized.value;
        } else if (field === "range") {
          const normalized = normalizeThicknessRangeInput(value);
          if (!normalized.ok) {
            renderPqr();
            addEvent(`PQR ${row.id} 已拒绝: 厚度范围应为 min-max`);
            return;
          }
          row[field] = normalized.value;
        } else if (field === "maxDelta") {
          const normalized = normalizeNumberInput(value, 0);
          if (!normalized.ok) {
            renderPqr();
            addEvent(`PQR ${row.id} 已拒绝: 最大厚度差必须 >= 0`);
            return;
          }
          row[field] = normalized.value;
        } else if (field === "valid") {
          const normalized = normalizeDateInput(value, true);
          if (!normalized.ok) {
            renderPqr();
            addEvent(`PQR ${row.id} 已拒绝: 有效期格式应为 YYYY-MM-DD`);
            return;
          }
          row[field] = normalized.value;
        } else {
          const normalized = normalizeTextInput(value);
          if (!normalized.ok) {
            renderPqr();
            addEvent(`PQR ${row.id} 已拒绝: ${field} 不能为空`);
            return;
          }
          row[field] = normalized.value;
        }
        renderPqr();
        setMasterDirty("pqr", true);
        addEvent(`PQR ${row.id} 已更新字段: ${field}`);
      },
      true
    );

    pqrBody.addEventListener("click", (event) => {
      const toggleBtn = event.target.closest("[data-pqr-toggle]");
      if (toggleBtn) {
        const [rowId, field] = String(toggleBtn.dataset.pqrToggle || "").split(":");
        const row = appState.pqrRows.find((item) => item.id === rowId);
        if (!row) return;
        if (field === "status") {
          row.status = row.status === "active" ? "inactive" : "active";
        } else {
          row[field] = !row[field];
        }
        renderPqr();
        setMasterDirty("pqr", true);
        addEvent(`PQR ${row.id} 已切换字段: ${field}`);
        return;
      }

      const deleteBtn = event.target.closest("[data-pqr-delete]");
      if (!deleteBtn) return;
      const rowId = String(deleteBtn.dataset.pqrDelete || "");
      const idx = appState.pqrRows.findIndex((item) => item.id === rowId);
      if (idx < 0) return;
      const [removed] = appState.pqrRows.splice(idx, 1);
      renderPqr();
      setMasterDirty("pqr", true);
      addEvent(`PQR已删除: ${removed?.id || rowId}`);
    });
  }

  const welderToolbarButtons = ensureMasterToolbarButtons("welder", "welder", "新增焊工");
  if (welderToolbarButtons.add) {
    welderToolbarButtons.add.addEventListener("click", () => {
      appState.welderRows.push({
        id: getNextWelderId(),
        cert: getNextCertNo(),
        process: "GTAW",
        pos: "1G",
        group: "P-No.1",
        dissimilarQualified: false,
        thicknessMismatchQualified: false,
        thicknessDeltaMax: 0,
        exp: "",
        status: "active"
      });
      renderWelder();
      setMasterDirty("welder", true);
      addEvent("新增焊工行");
    });
  }
  if (welderToolbarButtons.sync) {
    welderToolbarButtons.sync.addEventListener("click", async () => {
      if (!ensureMasterRowsValid("welder")) return;
      try {
        await syncRowsToBackend(appState.welderRows, {
          list: "list_welders",
          upsert: "upsert_welder",
          delete: "delete_welder",
          upsertArg: "welderJson",
          deleteIdArg: "welderId",
          idField: "welder_id",
          localId: (row) => row.id,
          toPayload: (row) => welderRowToCandidate(row)
        });
        setMasterDirty("welder", false);
        addEvent("焊工数据已同步到后端");
      } catch (error) {
        addEvent(`焊工同步失败: ${String(error)}`);
      }
    });
  }
  if (welderToolbarButtons.load) {
    welderToolbarButtons.load.addEventListener("click", async () => {
      try {
        await reloadWelderRowsFromBackend();
        addEvent("焊工数据已从后端加载");
      } catch (error) {
        addEvent(`焊工加载失败: ${String(error)}`);
      }
    });
  }

  if (welderBody) {
    welderBody.addEventListener(
      "blur",
      (event) => {
        const target = event.target;
        const key = target?.dataset?.welderEdit;
        if (!key) return;
        const [rowId, field] = key.split(":");
        const row = appState.welderRows.find((item) => item.id === rowId);
        if (!row) return;
        const value = target.textContent.trim();

        if (field === "thicknessDeltaMax") {
          const normalized = normalizeNumberInput(value, 0);
          if (!normalized.ok) {
            renderWelder();
            addEvent(`焊工 ${row.id} 已拒绝: 最大厚度差必须 >= 0`);
            return;
          }
          row[field] = normalized.value;
        } else if (field === "exp") {
          const normalized = normalizeDateInput(value, true);
          if (!normalized.ok) {
            renderWelder();
            addEvent(`焊工 ${row.id} 已拒绝: 到期日期格式应为 YYYY-MM-DD`);
            return;
          }
          row[field] = normalized.value;
        } else {
          const normalized = normalizeTextInput(value);
          if (!normalized.ok) {
            renderWelder();
            addEvent(`焊工 ${row.id} 已拒绝: ${field} 不能为空`);
            return;
          }
          row[field] = normalized.value;
        }
        renderWelder();
        setMasterDirty("welder", true);
        addEvent(`焊工 ${row.id} 已更新字段: ${field}`);
      },
      true
    );

    welderBody.addEventListener("click", (event) => {
      const toggleBtn = event.target.closest("[data-welder-toggle]");
      if (toggleBtn) {
        const [rowId, field] = String(toggleBtn.dataset.welderToggle || "").split(":");
        const row = appState.welderRows.find((item) => item.id === rowId);
        if (!row) return;
        if (field === "status") {
          row.status = row.status === "active" ? "inactive" : "active";
        } else {
          row[field] = !row[field];
        }
        renderWelder();
        setMasterDirty("welder", true);
        addEvent(`焊工 ${row.id} 已切换字段: ${field}`);
        return;
      }

      const deleteBtn = event.target.closest("[data-welder-delete]");
      if (!deleteBtn) return;
      const rowId = String(deleteBtn.dataset.welderDelete || "");
      const idx = appState.welderRows.findIndex((item) => item.id === rowId);
      if (idx < 0) return;
      const [removed] = appState.welderRows.splice(idx, 1);
      renderWelder();
      setMasterDirty("welder", true);
      addEvent(`焊工已删除: ${removed?.id || rowId}`);
    });
  }

  const batchAddBtn = document.querySelector("#btn-batch-add");
  if (batchAddBtn) {
    batchAddBtn.addEventListener("click", () => {
      appState.batchRows.push(
        normalizeBatchRow({
          batch_no: getNextBatchNo(),
          material_code: "ER70S-6",
          spec_standard: "AWS A5.18",
          qty_available: 0,
          safety_stock: 0,
          expiry_date: "",
          status: "active"
        })
      );
      renderBatch();
      setMasterDirty("batch", true);
      addEvent("新增批次行");
    });
  }

  if (batchBody) {
    batchBody.addEventListener(
      "blur",
      (event) => {
        const target = event.target;
        const key = target?.dataset?.batchEdit;
        if (!key) return;
        const [idxRaw, field] = key.split(":");
        const idx = Number(idxRaw);
        const row = appState.batchRows[idx];
        if (!row) return;
        const value = target.textContent.trim();

        if (field === "qty_available" || field === "safety_stock") {
          const normalized = normalizeNumberInput(value, 0);
          if (!normalized.ok) {
            renderBatch();
            addEvent(`批次 ${row.batch_no} 已拒绝: ${field} 必须 >= 0`);
            return;
          }
          row[field] = normalized.value;
        } else if (field === "expiry_date") {
          const normalized = normalizeDateInput(value, true);
          if (!normalized.ok) {
            renderBatch();
            addEvent(`批次 ${row.batch_no} 已拒绝: 到期日期格式应为 YYYY-MM-DD`);
            return;
          }
          row[field] = normalized.value;
        } else {
          const normalized = normalizeTextInput(value);
          if (!normalized.ok) {
            renderBatch();
            addEvent(`批次 ${row.batch_no} 已拒绝: ${field} 不能为空`);
            return;
          }
          row[field] = normalized.value;
        }
        renderBatch();
        setMasterDirty("batch", true);
        addEvent(`批次 ${row.batch_no} 已更新字段: ${field}`);
      },
      true
    );

    batchBody.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-batch-delete]");
      if (!btn) return;
      const idx = Number(btn.dataset.batchDelete);
      if (!Number.isInteger(idx) || idx < 0 || idx >= appState.batchRows.length) return;
      const [removed] = appState.batchRows.splice(idx, 1);
      renderBatch();
      setMasterDirty("batch", true);
      addEvent(`批次已删除: ${removed?.batch_no || idx}`);
    });
  }

  const batchSyncBtn = document.querySelector("#btn-batch-sync");
  if (batchSyncBtn) {
    batchSyncBtn.addEventListener("click", async () => {
      if (!ensureMasterRowsValid("batch")) return;
      try {
        await syncRowsToBackend(appState.batchRows, {
          list: "list_batches",
          upsert: "upsert_batch",
          delete: "delete_batch",
          upsertArg: "batchJson",
          deleteIdArg: "batchNo",
          idField: "batch_no",
          localId: (row) => row.batch_no,
          toPayload: (row) => normalizeBatchRow(row)
        });
        setMasterDirty("batch", false);
        addEvent("批次数据已同步到后端");
      } catch (error) {
        addEvent(`批次同步失败: ${String(error)}`);
      }
    });
  }

  const batchLoadBtn = document.querySelector("#btn-batch-load");
  if (batchLoadBtn) {
    batchLoadBtn.addEventListener("click", async () => {
      try {
        await reloadBatchRowsFromBackend();
        addEvent("批次数据已从后端加载");
      } catch (error) {
        addEvent(`批次加载失败: ${String(error)}`);
      }
    });
  }

  syncMasterToolbarState();

  if (projectForm) {
    projectForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const project = {
        id: String(form.get("project_code") || "").trim(),
        name: String(form.get("project_name") || "").trim(),
        company: String(form.get("company") || "").trim(),
        drawingType: String(form.get("drawing_type") || "").trim(),
        standard: String(form.get("standard_code") || "").trim()
      };
      if (!project.id || !project.name) {
        addEvent("项目保存失败：项目编号和项目名称不能为空");
        return;
      }
      const existing = appState.projects.find((item) => item.id === project.id);
      if (existing && existing.id !== getCurrentProjectId()) {
        addEvent(`项目编号已存在，请直接打开项目 ${project.id}`);
        return;
      }
      try {
        const saved = await saveProjectRecord(project);
        await setCurrentProjectContext(saved, { reloadContext: typeof window.__TAURI_INTERNALS__?.invoke === "function" });
        addEvent(`项目已保存: ${saved.id} / ${saved.name}`);
        setView("import");
      } catch (error) {
        addEvent(`项目保存失败: ${String(error)}`);
      }
    });
  }

  if (projectResetBtn) {
    projectResetBtn.addEventListener("click", () => {
      syncProjectFormValues();
      addEvent("项目表单已重置为当前项目");
    });
  }

  if (projectRefreshBtn) {
    projectRefreshBtn.addEventListener("click", async () => {
      if (typeof window.__TAURI_INTERNALS__?.invoke !== "function") {
        renderProjectHome();
        addEvent("当前为原型模式，项目列表已按本地状态刷新");
        return;
      }
      try {
        await reloadProjectsFromBackend(true);
        addEvent("项目列表已刷新");
      } catch (error) {
        addEvent(`项目列表刷新失败: ${String(error)}`);
      }
    });
  }

  if (projectOpenImportBtn) {
    projectOpenImportBtn.addEventListener("click", () => {
      setView("import");
    });
  }

  if (projectArchiveCurrentBtn) {
    projectArchiveCurrentBtn.addEventListener("click", async () => {
      const current = appState.currentProject;
      if (!current?.id) return;
      const nextArchived = !current.archivedAt;
      try {
        await archiveProjectRecord(current.id, nextArchived);
        addEvent(`${nextArchived ? "项目已归档" : "项目已恢复"}: ${current.id}`);
      } catch (error) {
        addEvent(`项目归档操作失败: ${String(error)}`);
      }
    });
  }

  if (projectRecentBody) {
    projectRecentBody.addEventListener("click", async (event) => {
      const openBtn = event.target.closest("[data-project-open]");
      if (openBtn) {
        try {
          const ok = await openProjectById(openBtn.dataset.projectOpen || "");
          if (ok) {
            addEvent(`已打开项目 ${openBtn.dataset.projectOpen || ""}`);
          }
        } catch (error) {
          addEvent(`打开项目失败: ${String(error)}`);
        }
        return;
      }
      const archiveBtn = event.target.closest("[data-project-archive]");
      if (!archiveBtn) return;
      try {
        const archived = String(archiveBtn.dataset.archived || "") === "1";
        await archiveProjectRecord(archiveBtn.dataset.projectArchive || "", archived);
        addEvent(`${archived ? "项目已归档" : "项目已恢复"}: ${archiveBtn.dataset.projectArchive || ""}`);
      } catch (error) {
        addEvent(`项目归档操作失败: ${String(error)}`);
      }
    });
  }

  if (parsePickFilesBtn) {
    parsePickFilesBtn.addEventListener("click", async () => {
      if (appState.parseBusy) return;
      if (isTauriRuntime()) {
        try {
          const items = await pickDrawingFilesFromDesktop();
          const summary = enqueueParseFiles(items);
          if (!summary.added && !summary.duplicates) {
            appendLog("未选择新的图纸文件");
          }
          if (summary.duplicates > 0) {
            appendLog(`已跳过重复图纸 ${summary.duplicates} 份`);
          }
          return;
        } catch (error) {
          appendLog(`原生文件选择失败，改用浏览器文件输入: ${String(error)}`, "error");
        }
      }
      parseFileInput?.click();
    });
  }

  if (parseFileInput) {
    parseFileInput.addEventListener("change", () => {
      const files = [...(parseFileInput.files || [])];
      if (!files.length) return;
      const items = files.map((file) =>
        buildParseQueueItem({
          path: file.name,
          fileName: file.name,
          fileType: inferParseFileType(file.name),
          sizeBytes: file.size,
          previewUrl: URL.createObjectURL(file),
          source: "browser",
          virtual: true
        })
      );
      const summary = enqueueParseFiles(items);
      if (summary.duplicates > 0) {
        appendLog(`已跳过重复图纸 ${summary.duplicates} 份`);
      }
      parseFileInput.value = "";
    });
  }

  if (parseAddSampleBtn) {
    parseAddSampleBtn.addEventListener("click", () => {
      const summary = enqueueParseFiles(
        SAMPLE_PARSE_FILES.map((item) => ({
          ...item,
          fileName: basenameFromPath(item.path),
          virtual: true
        }))
      );
      if (!summary.added) {
        appendLog("示例图纸已全部在队列中");
      }
    });
  }

  if (parseClearQueueBtn) {
    parseClearQueueBtn.addEventListener("click", () => {
      if (!appState.parseQueue.length) return;
      resetParseWorkspace();
      addEvent("图纸解析队列已清空");
    });
  }

  if (parseRunBtn) {
    parseRunBtn.addEventListener("click", async () => {
      const response = await runParseQueue();
      if (response) {
        addEvent(`图纸解析完成: ${response.trace_id || "-"} / ${String(response.status || "success").toUpperCase()}`);
      }
    });
  }

  if (parseRetryBtn) {
    parseRetryBtn.addEventListener("click", async () => {
      const response = await runParseQueue({ retryFailedOnly: true });
      if (response) {
        addEvent(`失败图纸已重试: ${response.trace_id || "-"}`);
      }
    });
  }

  if (parseAcceptAllBtn) {
    parseAcceptAllBtn.addEventListener("click", () => {
      const changed = acceptAllSuccessfulParseFiles();
      if (!changed) {
        addEvent("当前没有可接受的成功图纸");
        return;
      }
      addEvent(`已接受全部成功图纸，共 ${changed} 份`);
    });
  }

  if (parseLoadSeamsBtn) {
    parseLoadSeamsBtn.addEventListener("click", () => {
      loadParseResultIntoSeams();
    });
  }

  if (parseLoadAcceptedBtn) {
    parseLoadAcceptedBtn.addEventListener("click", () => {
      loadParseResultIntoSeams({ acceptedOnly: true });
    });
  }

  if (parseAcceptSelectedBtn) {
    parseAcceptSelectedBtn.addEventListener("click", () => {
      const selectedItem = getSelectedParseQueueItem();
      if (!selectedItem) return;
      setParseReviewStatus(selectedItem.id, "accepted");
    });
  }

  if (parseResetSelectedBtn) {
    parseResetSelectedBtn.addEventListener("click", () => {
      const selectedItem = getSelectedParseQueueItem();
      if (!selectedItem) return;
      setParseReviewStatus(selectedItem.id, "pending");
    });
  }

  if (parseLoadSelectedBtn) {
    parseLoadSelectedBtn.addEventListener("click", () => {
      loadParseResultIntoSeams({ selectedOnly: true });
    });
  }

  if (parseFlagSeamBtn) {
    parseFlagSeamBtn.addEventListener("click", () => {
      setSelectedParseSeamReviewStatus("uncertain");
    });
  }

  if (parseUnflagSeamBtn) {
    parseUnflagSeamBtn.addEventListener("click", () => {
      setSelectedParseSeamReviewStatus("pending");
    });
  }

  if (parseFilterStatus) {
    parseFilterStatus.addEventListener("change", () => {
      appState.parseFilters.status = String(parseFilterStatus.value || "all");
      renderParseWorkspace();
      addEvent(`解析队列筛选已更新: 状态 ${parseFilterStatus.options[parseFilterStatus.selectedIndex]?.text || "全部"}`);
    });
  }

  if (parseFilterReview) {
    parseFilterReview.addEventListener("change", () => {
      appState.parseFilters.review = String(parseFilterReview.value || "all");
      renderParseWorkspace();
      addEvent(`解析队列筛选已更新: 复核 ${parseFilterReview.options[parseFilterReview.selectedIndex]?.text || "全部"}`);
    });
  }

  if (parseFilterResetBtn) {
    parseFilterResetBtn.addEventListener("click", () => {
      appState.parseFilters = { status: "all", review: "all" };
      renderParseWorkspace();
      addEvent("解析队列筛选已清除");
    });
  }

  if (parseHistoryRefreshBtn) {
    parseHistoryRefreshBtn.addEventListener("click", () => {
      loadParseHistoryForProject(getCurrentProjectId());
      renderParseWorkspace();
      addEvent("解析任务历史已刷新");
    });
  }

  if (parseSelectPrevBtn) {
    parseSelectPrevBtn.addEventListener("click", () => {
      const current = getSelectedParseQueueItem();
      if (!current) return;
      const index = getParseQueueIndex(current.id);
      if (index <= 0) return;
      setSelectedParseQueue(appState.parseQueue[index - 1].id);
    });
  }

  if (parseSelectNextBtn) {
    parseSelectNextBtn.addEventListener("click", () => {
      const current = getSelectedParseQueueItem();
      if (!current) return;
      const index = getParseQueueIndex(current.id);
      if (index < 0 || index >= appState.parseQueue.length - 1) return;
      setSelectedParseQueue(appState.parseQueue[index + 1].id);
    });
  }

  if (parsePreviewModeBtn) {
    parsePreviewModeBtn.addEventListener("click", () => {
      stopParseHotspotDrag({ announce: false });
      setParsePreviewAddSeamMode(false, { silent: true });
      appState.parsePreviewMode = appState.parsePreviewMode === "annotate" ? "browse" : "annotate";
      renderParseSelectedFilePanel();
      addEvent(`图纸预览已切换到${getParsePreviewModeMeta().label}`);
    });
  }

  if (parseShortcutsBtn) {
    parseShortcutsBtn.addEventListener("click", () => {
      toggleParseShortcutPanel();
    });
  }

  if (parseShortcutsCloseBtn) {
    parseShortcutsCloseBtn.addEventListener("click", () => {
      setParseShortcutPanelVisible(false);
    });
  }

  if (parsePreviewRotateLeftBtn) {
    parsePreviewRotateLeftBtn.addEventListener("click", () => {
      rotateParsePreview(-90);
    });
  }

  if (parsePreviewRotateRightBtn) {
    parsePreviewRotateRightBtn.addEventListener("click", () => {
      rotateParsePreview(90);
    });
  }

  if (parsePreviewExpandBtn) {
    parsePreviewExpandBtn.addEventListener("click", () => {
      appState.parsePreviewExpanded = !appState.parsePreviewExpanded;
      renderParseSelectedFilePanel();
      addEvent(appState.parsePreviewExpanded ? "图纸预览已切换到扩展布局" : "图纸预览已恢复标准布局");
    });
  }

  if (parsePreviewZoomOutBtn) {
    parsePreviewZoomOutBtn.addEventListener("click", () => {
      appState.parsePreviewZoom = clampParsePreviewZoom(appState.parsePreviewZoom - 20);
      renderParseSelectedFilePanel();
      addEvent(`图纸缩放调整为 ${formatParsePreviewZoom()}`);
    });
  }

  if (parseAddSeamBtn) {
    parseAddSeamBtn.addEventListener("click", () => {
      if (appState.parsePreviewMode !== "annotate") {
        appState.parsePreviewMode = "annotate";
      }
      toggleParsePreviewAddSeamMode();
    });
  }

  if (parseDeleteSeamBtn) {
    parseDeleteSeamBtn.addEventListener("click", () => {
      if (!deleteSelectedManualParseSeam()) {
        addEvent("当前选中项不是手动焊缝，无法删除");
      }
    });
  }

  if (parsePreviewZoomResetBtn) {
    parsePreviewZoomResetBtn.addEventListener("click", () => {
      appState.parsePreviewZoom = 100;
      renderParseSelectedFilePanel();
      addEvent("图纸缩放已重置为 100%");
    });
  }

  if (parsePreviewZoomInBtn) {
    parsePreviewZoomInBtn.addEventListener("click", () => {
      appState.parsePreviewZoom = clampParsePreviewZoom(appState.parsePreviewZoom + 20);
      renderParseSelectedFilePanel();
      addEvent(`图纸缩放调整为 ${formatParsePreviewZoom()}`);
    });
  }

  if (parseOptionsForm) {
    parseOptionsForm.addEventListener("change", () => {
      updateParseOptionsFromForm();
      renderParseWorkspace();
      addEvent(
        `解析参数已更新: 符号 ${appState.parseOptions.detectWeldSymbols ? "开" : "关"} / 分区 ${
          appState.parseOptions.detectSections ? "开" : "关"
        } / ${appState.parseOptions.language}`
      );
    });
  }

  if (parseQueueBody) {
    parseQueueBody.addEventListener("click", async (event) => {
      const removeBtn = event.target.closest("[data-parse-remove]");
      if (removeBtn) {
        const queueId = String(removeBtn.dataset.parseRemove || "");
        const target = appState.parseQueue.find((item) => item.id === queueId);
        revokeParsePreviewUrl(target);
        appState.parseQueue = appState.parseQueue.filter((item) => item.id !== queueId);
        rebuildParseResultFromQueue(appState.parseResult?.traceId || "");
        renderParseWorkspace();
        addEvent(`已移除图纸: ${target?.fileName || target?.path || queueId}`);
        return;
      }

      const retryBtn = event.target.closest("[data-parse-retry-item]");
      if (retryBtn) {
        const queueId = String(retryBtn.dataset.parseRetryItem || "");
        const response = await runParseQueue({ targetIds: [queueId] });
        if (response) {
          addEvent(`图纸已单独重试: ${queueId}`);
        }
        return;
      }

      const row = event.target.closest("[data-parse-select]");
      if (!row) return;
      setSelectedParseQueue(row.dataset.parseSelect || "");
    });
  }

  if (parseHistoryBody) {
    parseHistoryBody.addEventListener("click", async (event) => {
      const rerunBtn = event.target.closest("[data-parse-history-rerun]");
      if (rerunBtn) {
        const response = await rerunParseHistory(rerunBtn.dataset.parseHistoryRerun || "");
        if (response) {
          addEvent(`解析历史已再次执行: ${response.trace_id || "-"}`);
        }
        return;
      }

      const restoreBtn = event.target.closest("[data-parse-history-restore]");
      if (restoreBtn) {
        restoreParseHistoryQueue(restoreBtn.dataset.parseHistoryRestore || "");
        return;
      }

      const optionsBtn = event.target.closest("[data-parse-history-options]");
      if (optionsBtn) {
        applyParseHistoryOptions(optionsBtn.dataset.parseHistoryOptions || "");
        return;
      }

      const row = event.target.closest("[data-parse-history-select]");
      if (!row) return;
      setSelectedParseHistory(row.dataset.parseHistorySelect || "");
    });
  }

  if (parsePreviewHotspots) {
    parsePreviewHotspots.addEventListener("pointerdown", (event) => {
      if (appState.parsePreviewMode !== "annotate") return;
      const hotspot = event.target.closest("[data-parse-hotspot-kind][data-parse-hotspot-id]");
      if (!hotspot) return;
      const kind = String(hotspot.dataset.parseHotspotKind || "");
      const itemId = String(hotspot.dataset.parseHotspotId || "");
      if (!kind || !itemId) return;
      if (kind === "seam") {
        appState.parseSelectedSeamId = itemId;
        appState.parseSelectedCandidateId = "";
      } else if (kind === "candidate") {
        appState.parseSelectedCandidateId = itemId;
        appState.parseSelectedSeamId = "";
      }
      appState.parsePreviewDrag = {
        kind,
        itemId,
        moved: false
      };
      renderParseSelectedFilePanel();
      event.preventDefault();
    });

    parsePreviewHotspots.addEventListener("click", (event) => {
      if (Date.now() < Number(appState.parsePreviewSuppressClickUntil || 0)) return;
      if (appState.parsePreviewDrag?.moved) return;
      const hotspot = event.target.closest("[data-parse-seam-select]");
      if (hotspot) {
        setSelectedParseSeam(hotspot.dataset.parseSeamSelect || "");
        return;
      }
      const candidateHotspot = event.target.closest("[data-parse-candidate-select]");
      if (candidateHotspot) {
        setSelectedParseCandidate(candidateHotspot.dataset.parseCandidateSelect || "");
        return;
      }
      if (appState.parsePreviewMode !== "annotate" || !appState.parsePreviewAddSeamMode) return;
      const anchor = buildDragAnchorFromPointer(event, "seam", "");
      if (!anchor) return;
      if (createManualParseSeamAtAnchor(anchor)) {
        setParsePreviewAddSeamMode(false, { silent: true });
      }
    });
    parsePreviewHotspots.addEventListener("dblclick", (event) => {
      const seamHotspot = event.target.closest("[data-parse-seam-select]");
      if (seamHotspot) {
        event.preventDefault();
        openParseQuickEditModal("seam", seamHotspot.dataset.parseSeamSelect || "");
        return;
      }
      const candidateHotspot = event.target.closest("[data-parse-candidate-select]");
      if (candidateHotspot) {
        event.preventDefault();
        openParseQuickEditModal("candidate", candidateHotspot.dataset.parseCandidateSelect || "");
        return;
      }
      if (appState.parsePreviewMode !== "annotate") return;
      const hasSelectedSeam = Boolean(String(appState.parseSelectedSeamId || "").trim());
      const hasSelectedCandidate = Boolean(String(appState.parseSelectedCandidateId || "").trim());
      if (!hasSelectedSeam && !hasSelectedCandidate) {
        addEvent("请先选中焊缝或候选，再在图纸上双击标注位置");
        return;
      }
      const rect = parsePreviewHotspots.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const point = unrotatePreviewPoint({
        x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
      });
      const anchor = {
        x: point.x,
        y: point.y,
        w: hasSelectedSeam ? 0.12 : 0.1,
        h: hasSelectedSeam ? 0.08 : 0.07,
        page_index: Math.max(0, Number(appState.parsePreviewPageIndex) || 0)
      };
      setSelectedParseItemAnchor(anchor);
    });
  }

  if (parseQuickCloseBtn) {
    parseQuickCloseBtn.addEventListener("click", () => {
      closeParseQuickEditModal();
    });
  }

  if (parseQuickCancelBtn) {
    parseQuickCancelBtn.addEventListener("click", () => {
      closeParseQuickEditModal();
    });
  }

  if (parseQuickSaveBtn) {
    parseQuickSaveBtn.addEventListener("click", () => {
      saveParseQuickEditModal();
    });
  }

  if (parseQuickBackdrop) {
    parseQuickBackdrop.addEventListener("click", () => {
      closeParseQuickEditModal();
    });
  }

  window.addEventListener("pointermove", (event) => {
    const drag = appState.parsePreviewDrag;
    if (!drag || appState.parsePreviewMode !== "annotate") return;
    const anchor = buildDragAnchorFromPointer(event, drag.kind, drag.itemId);
    if (!anchor) return;
    drag.moved = true;
    setParseItemAnchorById(drag.kind, drag.itemId, anchor, {
      silent: true,
      render: true,
      announce: false
    });
  });

  window.addEventListener("pointerup", () => {
    stopParseHotspotDrag({ announce: true });
  });

  window.addEventListener("pointercancel", () => {
    stopParseHotspotDrag({ announce: true });
  });

  window.addEventListener("keydown", (event) => {
    if (appState.view !== "import") return;
    if (isTypingTarget(event.target) && event.key !== "Escape") return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = String(event.key || "");
    const normalizedKey = key.toLowerCase();

    if (uiState.parseQuickEdit) {
      if (normalizedKey === "escape") {
        event.preventDefault();
        closeParseQuickEditModal();
      }
      return;
    }

    const selectedItem = getSelectedParseQueueItem();

    if (normalizedKey === "escape") {
      if (appState.parseShortcutPanelVisible) {
        event.preventDefault();
        setParseShortcutPanelVisible(false);
        return;
      }
      if (appState.parsePreviewAddSeamMode) {
        event.preventDefault();
        setParsePreviewAddSeamMode(false);
      }
      return;
    }

    if (!selectedItem) return;

    if (normalizedKey === "arrowleft") {
      const index = getParseQueueIndex(selectedItem.id);
      if (index > 0) {
        event.preventDefault();
        setSelectedParseQueue(appState.parseQueue[index - 1].id);
      }
      return;
    }

    if (normalizedKey === "arrowright") {
      const index = getParseQueueIndex(selectedItem.id);
      if (index >= 0 && index < appState.parseQueue.length - 1) {
        event.preventDefault();
        setSelectedParseQueue(appState.parseQueue[index + 1].id);
      }
      return;
    }

    if (normalizedKey === "r") {
      event.preventDefault();
      rotateParsePreview(event.shiftKey ? -90 : 90);
      return;
    }

    if (normalizedKey === "=" || normalizedKey === "+") {
      if (selectedItem.fileType !== "pdf") return;
      event.preventDefault();
      appState.parsePreviewZoom = clampParsePreviewZoom(appState.parsePreviewZoom + 20);
      renderParseSelectedFilePanel();
      addEvent(`图纸缩放调整为 ${formatParsePreviewZoom()}`);
      return;
    }

    if (normalizedKey === "-" || normalizedKey === "_") {
      if (selectedItem.fileType !== "pdf") return;
      event.preventDefault();
      appState.parsePreviewZoom = clampParsePreviewZoom(appState.parsePreviewZoom - 20);
      renderParseSelectedFilePanel();
      addEvent(`图纸缩放调整为 ${formatParsePreviewZoom()}`);
      return;
    }

    if (normalizedKey === "0") {
      if (selectedItem.fileType !== "pdf") return;
      event.preventDefault();
      appState.parsePreviewZoom = 100;
      renderParseSelectedFilePanel();
      addEvent("图纸缩放已重置为 100%");
      return;
    }

    if (normalizedKey === "m") {
      event.preventDefault();
      stopParseHotspotDrag({ announce: false });
      setParsePreviewAddSeamMode(false, { silent: true });
      appState.parsePreviewMode = appState.parsePreviewMode === "annotate" ? "browse" : "annotate";
      renderParseSelectedFilePanel();
      addEvent(`图纸预览已切换到${getParsePreviewModeMeta().label}`);
      return;
    }

    if (normalizedKey === "n") {
      event.preventDefault();
      if (appState.parsePreviewMode !== "annotate") {
        appState.parsePreviewMode = "annotate";
      }
      toggleParsePreviewAddSeamMode();
      return;
    }

    if (normalizedKey === "f") {
      event.preventDefault();
      appState.parsePreviewExpanded = !appState.parsePreviewExpanded;
      renderParseSelectedFilePanel();
      addEvent(appState.parsePreviewExpanded ? "图纸预览已切换到扩展布局" : "图纸预览已恢复标准布局");
      return;
    }

    if (key === "?" || (normalizedKey === "/" && event.shiftKey)) {
      event.preventDefault();
      toggleParseShortcutPanel();
      return;
    }

    if (normalizedKey === "delete" || normalizedKey === "backspace") {
      if (!appState.parseSelectedSeamId) return;
      if (!deleteSelectedManualParseSeam()) {
        addEvent("仅支持删除手动新增的焊缝");
      }
    }
  });

  if (parseFileSeamBody) {
    parseFileSeamBody.addEventListener("click", (event) => {
      const row = event.target.closest("[data-parse-seam-row]");
      if (!row) return;
      setSelectedParseSeam(row.dataset.parseSeamRow || "");
    });
    parseFileSeamBody.addEventListener("dblclick", (event) => {
      const row = event.target.closest("[data-parse-seam-row]");
      if (!row) return;
      openParseQuickEditModal("seam", row.dataset.parseSeamRow || "");
    });
  }

  if (parseFileCandidateBody) {
    parseFileCandidateBody.addEventListener("click", (event) => {
      const acceptBtn = event.target.closest("[data-parse-candidate-accept]");
      if (acceptBtn) {
        setParseCandidateReviewStatus(acceptBtn.dataset.parseCandidateAccept || "", "accepted");
        return;
      }
      const rejectBtn = event.target.closest("[data-parse-candidate-reject]");
      if (rejectBtn) {
        setParseCandidateReviewStatus(rejectBtn.dataset.parseCandidateReject || "", "rejected");
        return;
      }
      const resetBtn = event.target.closest("[data-parse-candidate-reset]");
      if (resetBtn) {
        setParseCandidateReviewStatus(resetBtn.dataset.parseCandidateReset || "", "pending");
        return;
      }
      const row = event.target.closest("[data-parse-candidate-row]");
      if (!row) return;
      setSelectedParseCandidate(row.dataset.parseCandidateRow || "");
    });
    parseFileCandidateBody.addEventListener("dblclick", (event) => {
      const row = event.target.closest("[data-parse-candidate-row]");
      if (!row) return;
      openParseQuickEditModal("candidate", row.dataset.parseCandidateRow || "");
    });
  }

  if (parseDropzone) {
    const dropPanel = parseDropzone.querySelector(".dropzone-panel");
    if (dropPanel) {
      dropPanel.addEventListener("click", () => {
        if (appState.parseBusy) return;
        parsePickFilesBtn?.click();
      });
    }
    ["dragenter", "dragover"].forEach((eventName) => {
      parseDropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropPanel?.classList.add("is-dragover");
      });
    });
    ["dragleave", "dragend", "drop"].forEach((eventName) => {
      parseDropzone.addEventListener(eventName, () => {
        dropPanel?.classList.remove("is-dragover");
      });
    });
    parseDropzone.addEventListener("drop", (event) => {
      event.preventDefault();
      if (appState.parseBusy) return;
      const files = [...(event.dataTransfer?.files || [])];
      if (!files.length) return;
      const items = files.map((file) =>
        buildParseQueueItem({
          path: file.name,
          fileName: file.name,
          fileType: inferParseFileType(file.name),
          sizeBytes: file.size,
          previewUrl: URL.createObjectURL(file),
          source: "drop",
          virtual: true
        })
      );
      const summary = enqueueParseFiles(items);
      if (summary.added) {
        addEvent(`已拖入图纸 ${summary.added} 份`);
      }
    });
  }

  const addSeamBtn = document.querySelector("#btn-add-seam");
  if (addSeamBtn) {
    addSeamBtn.addEventListener("click", () => {
      clearSeamImportPreview();
      appState.seamRows.push({
        id: getNextSeamId(),
        matA: "P-No.1",
        matB: "P-No.1",
        thkA: 10,
        thkB: 10,
        pos: "1G",
        symbol: "BW",
        conf: 0.8,
        status: "pending"
      });
      renderSeamTable();
      setMasterDirty("seam", true);
      addEvent("新增焊缝行");
    });
  }

  const seamImportBtn = document.querySelector("#btn-seam-import");
  if (seamImportBtn && seamImportInput) {
    seamImportBtn.addEventListener("click", () => {
      seamImportInput.value = "";
      seamImportInput.click();
    });
  }

  if (seamTemplateBtn) {
    seamTemplateBtn.addEventListener("click", () => {
      downloadSeamCsvTemplate();
      addEvent("已下载焊缝CSV模板");
    });
  }

  if (seamImportInput) {
    seamImportInput.addEventListener("change", async () => {
      const file = seamImportInput.files?.[0];
      if (!file) return;
      try {
        const content = await file.text();
        const result = parseSeamCsvText(content);
        uiState.pendingSeamImportResult = result;
        uiState.pendingSeamImportFileName = file.name || "";
        renderSeamImportPreview(result, uiState.pendingSeamImportFileName);
        if (result.invalidRows.length) {
          addEvent(`焊缝CSV解析完成：成功 ${result.validRows.length} 条，失败 ${result.invalidRows.length} 条（可勾选仅导入通过行）`);
        } else {
          addEvent(`焊缝CSV解析成功，待确认导入（${result.validRows.length}条）`);
        }
      } catch (error) {
        addEvent(`焊缝CSV导入失败: ${String(error)}`);
      } finally {
        seamImportInput.value = "";
      }
    });
  }

  if (seamImportExportErrorsBtn) {
    seamImportExportErrorsBtn.addEventListener("click", () => {
      const result = uiState.pendingSeamImportResult;
      const count = downloadSeamImportErrorRows(result, uiState.pendingSeamImportFileName);
      if (!count) {
        addEvent("当前没有可导出的错误行");
        return;
      }
      addEvent(`错误行CSV已导出，共 ${count} 条`);
    });
  }

  if (seamImportAllowPartial) {
    seamImportAllowPartial.addEventListener("change", () => {
      syncSeamImportApplyState();
    });
  }

  if (seamImportApplyBtn) {
    seamImportApplyBtn.addEventListener("click", () => {
      const result = uiState.pendingSeamImportResult;
      if (!result) {
        addEvent("没有可导入的预览数据");
        return;
      }
      const allowPartial = Boolean(seamImportAllowPartial?.checked);
      const invalidCount = result.invalidRows?.length || 0;
      if (invalidCount > 0 && !allowPartial) {
        addEvent("存在错误行，请修复后重试，或勾选“仅导入通过行”");
        return;
      }

      const rows = result.validRows;
      if (!Array.isArray(rows) || !rows.length) {
        addEvent("没有可导入的预览数据");
        return;
      }
      appState.seamRows = rows;
      renderSeamTable();
      setMasterDirty("seam", true);
      if (invalidCount > 0 && allowPartial) {
        addEvent(`焊缝CSV部分导入成功：导入 ${rows.length} 条，忽略 ${invalidCount} 条错误行`);
      } else {
        addEvent(`焊缝CSV导入成功，共 ${rows.length} 条`);
      }
      clearSeamImportPreview();
    });
  }

  if (seamImportCancelBtn) {
    seamImportCancelBtn.addEventListener("click", () => {
      clearSeamImportPreview();
      addEvent("已取消焊缝CSV导入");
    });
  }

  const seamSyncBtn = document.querySelector("#btn-seam-sync");
  if (seamSyncBtn) {
    seamSyncBtn.addEventListener("click", async () => {
      if (!ensureMasterRowsValid("seam")) return;
      try {
        await syncRowsToBackend(appState.seamRows, {
          list: "list_seams",
          upsert: "upsert_seam",
          delete: "delete_seam",
          upsertArg: "seamJson",
          deleteIdArg: "weldId",
          idField: "weld_id",
          localId: (row) => row.id,
          toPayload: (row) => seamRowToPayload(row)
        });
        setMasterDirty("seam", false);
        addEvent("焊缝数据已同步到后端");
      } catch (error) {
        addEvent(`焊缝数据同步失败: ${String(error)}`);
      }
    });
  }

  const seamLoadBtn = document.querySelector("#btn-seam-load");
  if (seamLoadBtn) {
    seamLoadBtn.addEventListener("click", async () => {
      try {
        await reloadSeamRowsFromBackend();
        addEvent("焊缝数据已从后端加载");
      } catch (error) {
        addEvent(`焊缝数据加载失败: ${String(error)}`);
      }
    });
  }

  document.querySelector("#btn-confirm-all").addEventListener("click", () => {
    clearSeamImportPreview();
    appState.seamRows = appState.seamRows.map((row) => ({ ...row, status: "confirmed" }));
    renderSeamTable();
    setMasterDirty("seam", true);
    addEvent("焊缝信息已批量确认");
  });

  document.querySelector("#btn-mark-uncertain").addEventListener("click", () => {
    clearSeamImportPreview();
    appState.seamRows = appState.seamRows.map((row) => (row.conf < 0.7 ? { ...row, status: "uncertain" } : row));
    renderSeamTable();
    setMasterDirty("seam", true);
    addEvent("低置信度焊缝已标记为存疑");
  });

  document.querySelector("#btn-mark-special").addEventListener("click", () => {
    clearSeamImportPreview();
    appState.seamRows = appState.seamRows.map((row) => {
      const special = getSpecialCase(row).key;
      if (special !== "normal" && row.status !== "confirmed") return { ...row, status: "uncertain" };
      return row;
    });
    renderSeamTable();
    setMasterDirty("seam", true);
    addEvent("特殊工况焊缝已标记为存疑");
  });

  seamBody.addEventListener(
    "blur",
    (event) => {
      const target = event.target;
      const key = target?.dataset?.edit;
      if (!key) return;
      const [idx, field] = key.split(":");
      const row = appState.seamRows[Number(idx)];
      if (!row) return;
      const value = target.textContent.trim();
      if (field === "thkA" || field === "thkB") {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          target.textContent = String(row[field]);
          return;
        }
        row[field] = parsed;
      } else {
        row[field] = value;
      }
      clearSeamImportPreview();
      row.status = row.status === "confirmed" ? "confirmed" : "pending";
      setMasterDirty("seam", true);
      renderSpecialSummary();
      addEvent(`焊缝 ${row.id} 字段 ${field} 已更新`);
    },
    true
  );

  seamBody.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-seam-delete]");
    if (!btn) return;
    const idx = Number(btn.dataset.seamDelete);
    if (!Number.isInteger(idx) || idx < 0 || idx >= appState.seamRows.length) return;
    const [removed] = appState.seamRows.splice(idx, 1);
    clearSeamImportPreview();
    renderSeamTable();
    setMasterDirty("seam", true);
    addEvent(`焊缝已删除: ${removed?.id || idx}`);
  });

  document.querySelector("#btn-run-match").addEventListener("click", async () => {
    const result = await runMatch();
    if (result?.attempted) {
      bumpTraceId();
    }
  });

  const refreshHistoryBtn = document.querySelector("#btn-refresh-history");
  if (refreshHistoryBtn) {
    refreshHistoryBtn.addEventListener("click", () => {
      refreshExecutionHistory();
    });
  }

  if (freezeBaselineBtn) {
    freezeBaselineBtn.addEventListener("click", () => {
      freezeSelectedMatchAsBaseline();
    });
  }

  if (rematchFreezeBaselineBtn) {
    rematchFreezeBaselineBtn.addEventListener("click", () => {
      rematchAndFreezeNewBaseline();
    });
  }

  if (exportAuditPackageBtn) {
    exportAuditPackageBtn.addEventListener("click", () => {
      exportSelectedAuditPackage();
    });
  }

  if (refreshBaselinesBtn) {
    refreshBaselinesBtn.addEventListener("click", async () => {
      if (typeof window.__TAURI_INTERNALS__?.invoke !== "function") {
        renderMatchBaselines();
        addEvent("当前为原型模式，基线列表已按本地状态刷新");
        return;
      }
      try {
        await reloadMatchBaselinesFromBackend();
        addEvent("项目基线已刷新");
      } catch (error) {
        addEvent(`项目基线加载失败: ${String(error)}`);
      }
    });
  }

  if (refreshBaselineImpactBtn) {
    refreshBaselineImpactBtn.addEventListener("click", async () => {
      await refreshBaselineImpactForSelectedTrace();
      addEvent("基线影响范围明细已刷新");
    });
  }

  if (exportReviewChecklistBtn) {
    exportReviewChecklistBtn.addEventListener("click", () => {
      const exported = exportBaselineReviewChecklist();
      if (!exported) {
        addEvent("请先选择需要分析的基线，再导出复核清单");
        return;
      }
      addEvent(`复核清单已导出: ${exported.filename}（${exported.rowCount} 行）`);
    });
  }

  if (baselineImpactSummary) {
    baselineImpactSummary.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-review-action]");
      if (!button) return;
      await runReviewAction(button.dataset.reviewAction, button.dataset.reviewTarget);
    });
  }

  if (baselineImpactGroups) {
    baselineImpactGroups.addEventListener("click", (event) => {
      const locateButton = event.target.closest("[data-locate-scope]");
      if (locateButton) {
        locateMasterItem(locateButton.dataset.locateScope, locateButton.dataset.locateId);
        return;
      }
      const focusButton = event.target.closest("[data-focus-scope]");
      if (!focusButton) return;
      const ids = String(focusButton.dataset.focusIds || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      setMasterFocus(focusButton.dataset.focusScope, ids, focusButton.dataset.focusLabel || "");
    });
  }

  if (clearMasterFocusBtn) {
    clearMasterFocusBtn.addEventListener("click", () => {
      clearMasterFocus();
    });
  }

  if (masterFocusPrevBtn) {
    masterFocusPrevBtn.addEventListener("click", () => {
      advanceMasterFocus(-1);
    });
  }

  if (masterFocusNextBtn) {
    masterFocusNextBtn.addEventListener("click", () => {
      advanceMasterFocus(1);
    });
  }

  if (matchBaselineBody) {
    matchBaselineBody.addEventListener("click", (event) => {
      const row = event.target.closest("[data-baseline-trace]");
      if (!row) return;
      setSelectedMatchTrace(row.dataset.baselineTrace || "");
    });
  }

  if (matchReportBody) {
    matchReportBody.addEventListener("click", (event) => {
      const row = event.target.closest("[data-match-trace]");
      if (!row) return;
      setSelectedMatchTrace(row.dataset.matchTrace || "");
    });
  }

  if (auditLogBody) {
    auditLogBody.addEventListener("click", (event) => {
      const row = event.target.closest("[data-audit-trace]");
      if (!row) return;
      setSelectedMatchTrace(row.dataset.auditTrace || "");
    });
  }

  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach((node) => node.classList.remove("active"));
      btn.classList.add("active");
      renderConflicts(btn.dataset.severity);
    });
  });

  document.querySelector("#template-form").addEventListener("submit", (event) => {
    event.preventDefault();
    appState.templateVersion[2] += 1;
    const version = appState.templateVersion.join(".");
    document.querySelector("#template-version-label").textContent = `当前版本: ${version}`;
    addEvent(`模板映射保存成功，版本 ${version}`);
  });

  document.querySelector("#btn-export-word").addEventListener("click", () => {
    document.querySelector("#export-feedback").textContent = `Word 导出成功: WPS_${Date.now()}.docx`;
    addEvent("Word 导出完成");
  });

  document.querySelector("#btn-export-pdf").addEventListener("click", () => {
    document.querySelector("#export-feedback").textContent = `PDF 导出成功: WPS_${Date.now()}.pdf`;
    addEvent("PDF 导出完成");
  });

  document.querySelector("#license-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const key = new FormData(event.currentTarget).get("license_key").toString().trim();
    const ok = /^WL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(key);
    const label = document.querySelector("#license-feedback");
    if (ok) {
      appState.licenseStatus = "Activated";
      label.textContent = "激活成功，有效期至 2027-03-01";
      label.style.color = "#2c9655";
      addEvent("许可证在线激活成功");
    } else {
      appState.licenseStatus = "InvalidKey";
      label.textContent = "激活失败，密钥格式不合法";
      label.style.color = "#d44a4a";
      addEvent("许可证激活失败: InvalidKey");
    }
    setStatusSnapshot();
  });
}

function startClock() {
  const clock = document.querySelector("#system-clock");
  const tick = () => {
    clock.textContent = new Date().toLocaleString("zh-CN", { hour12: false });
  };
  tick();
  setInterval(tick, 1000);
}

function init() {
  renderSeamTable();
  clearSeamImportPreview();
  renderPqr();
  renderWelder();
  renderBatch();
  renderAlternatives();
  renderInventoryAlerts();
  renderConflicts("all");
  renderMatchReports();
  renderAuditLogs();
  renderMatchBaselines();
  renderBaselineComparison();
  renderBaselineImpact();
  renderSelectedMatchDetail();
  syncFreezeBaselineButtonState();
  syncRematchFreezeButtonState();
  syncExportReviewChecklistButtonState();
  syncMasterFocusBanner();
  renderProjectHome();
  resetParseWorkspace();
  setStatusSnapshot();
  initHandlers();
  bootstrapProjectContext();
  startClock();
}

init();

