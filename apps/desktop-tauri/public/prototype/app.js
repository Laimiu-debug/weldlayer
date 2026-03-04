const THICKNESS_DIFF_THRESHOLD = 3;
const PROTOTYPE_DB_PATH = "weldlayer.db";
const PROTOTYPE_PROJECT_ID = "PRJ-PROTOTYPE-001";
const MASTER_DATA_SYNC_LIMIT = 1000;
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

const appState = {
  view: "project",
  standard: "ASME_IX",
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
  parseProgress: 0,
  templateVersion: [1, 0, 0],
  traceId: "TRC-20260304-00017",
  licenseStatus: "NotActivated",
  masterDirty: {
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
  title: "Inventory Batches",
  breadcrumb: "Resource Library / Inventory Batches",
  detailTitle: "Consumable Batch Master Data",
  detailText: "Manage batch stock, expiry dates, and availability with backend sync support."
};

const menuButtons = [...document.querySelectorAll(".menu-item")];
const views = [...document.querySelectorAll(".view")];
const seamBody = document.querySelector("#seam-table tbody");
const pqrBody = document.querySelector("#pqr-body");
const welderBody = document.querySelector("#welder-body");
const batchBody = document.querySelector("#batch-body");
const altList = document.querySelector("#alt-list");
const inventoryAlertList = document.querySelector("#inventory-alert-list");
const conflictBody = document.querySelector("#conflict-body");
const columnFilterPopover = document.querySelector("#column-filter-popover");
const columnFilterTitle = document.querySelector("#column-filter-title");
const columnFilterBody = document.querySelector("#column-filter-body");
const columnFilterResetBtn = document.querySelector("#column-filter-reset");
const columnFilterOkBtn = document.querySelector("#column-filter-ok");

const uiState = {
  activeFilterContext: null
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
  appState.seamRows.forEach((row, idx) => {
    const tr = document.createElement("tr");
    const special = getSpecialCase(row);
    const stateType = row.status === "confirmed" ? "ok" : row.status === "uncertain" ? "danger" : "warn";
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
  return [...filtered].sort(compareBySort("pqr", sortCol, sortDir));
}

function getFilteredSortedWelderRows() {
  const { dissimilarOnly, thicknessOnly, sortCol, sortDir } = appState.welderFilter;
  const filtered = appState.welderRows.filter((row) => {
    if (dissimilarOnly && !row.dissimilarQualified) return false;
    if (thicknessOnly && !row.thicknessMismatchQualified) return false;
    return true;
  });
  return [...filtered].sort(compareBySort("welder", sortCol, sortDir));
}

function renderPqr() {
  const rows = getFilteredSortedPqrRows();
  pqrBody.innerHTML = rows
    .map((row) => {
      const statusType = row.status === "active" ? "ok" : "warn";
      return `
        <tr>
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
            <button class="ghost" data-pqr-delete="${row.id}">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderWelder() {
  const rows = getFilteredSortedWelderRows();
  welderBody.innerHTML = rows
    .map((row) => {
      const statusType = row.status === "active" ? "ok" : "warn";
      return `
        <tr>
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
            <button class="ghost" data-welder-delete="${row.id}">Delete</button>
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
    <button class="primary" id="btn-${prefix}-sync">Sync to Backend</button>
    <button class="ghost" id="btn-${prefix}-load">Load from Backend</button>
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

function syncMasterToolbarState() {
  const set = (syncSelector, loadSelector, dirty) => {
    const syncBtn = document.querySelector(syncSelector);
    if (syncBtn) syncBtn.textContent = dirty ? "Sync to Backend *" : "Sync to Backend";
    const loadBtn = document.querySelector(loadSelector);
    if (loadBtn) loadBtn.textContent = dirty ? "Load from Backend (discard local)" : "Load from Backend";
  };
  set("#btn-pqr-sync", "#btn-pqr-load", appState.masterDirty.pqr);
  set("#btn-welder-sync", "#btn-welder-load", appState.masterDirty.welder);
  set("#btn-batch-sync", "#btn-batch-load", appState.masterDirty.batch);
}

function setMasterDirty(scope, dirty = true) {
  if (!Object.prototype.hasOwnProperty.call(appState.masterDirty, scope)) return;
  appState.masterDirty[scope] = Boolean(dirty);
  syncMasterToolbarState();
}

function renderBatch() {
  if (!batchBody) return;
  batchBody.innerHTML = appState.batchRows
    .map((row, idx) => {
      const statusType = row.status === "active" ? "ok" : "warn";
      return `
        <tr>
          <td>${row.batch_no}</td>
          <td contenteditable="true" data-batch-edit="${idx}:material_code">${row.material_code}</td>
          <td contenteditable="true" data-batch-edit="${idx}:spec_standard">${row.spec_standard}</td>
          <td contenteditable="true" data-batch-edit="${idx}:qty_available">${Number(row.qty_available).toFixed(1)}</td>
          <td contenteditable="true" data-batch-edit="${idx}:safety_stock">${Number(row.safety_stock).toFixed(1)}</td>
          <td contenteditable="true" data-batch-edit="${idx}:expiry_date">${row.expiry_date}</td>
          <td>${statusTag(row.status, statusType)}</td>
          <td><button class="ghost" data-batch-delete="${idx}">Delete</button></td>
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
    inventoryAlertList.innerHTML = `<li><span>No inventory alerts</span>${statusTag("ok", "ok")}</li>`;
    return;
  }
  inventoryAlertList.innerHTML = appState.inventoryAlerts
    .map((item) => {
      const severity = String(item.severity || "warning").toLowerCase();
      const cls = severity === "error" ? "danger" : severity === "info" ? "ok" : "warn";
      const batchNo = item.batchNo || "-";
      return `<li><span>${item.materialCode} / ${batchNo} need ${item.requiredQty.toFixed(1)}, available ${item.availableQty.toFixed(1)}</span>${statusTag(
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

function setView(viewKey) {
  appState.view = viewKey;
  menuButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.view === viewKey));
  views.forEach((panel) => panel.classList.toggle("is-visible", panel.dataset.viewPanel === viewKey));
  const meta = viewMeta[viewKey];
  document.querySelector("#view-title").textContent = meta.title;
  document.querySelector("#breadcrumb").textContent = meta.breadcrumb;
  document.querySelector("#detail-title").textContent = meta.detailTitle;
  document.querySelector("#detail-content").textContent = meta.detailText;
}

function appendLog(text) {
  const panel = document.querySelector("#parse-log");
  const p = document.createElement("p");
  p.textContent = `[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] ${text}`;
  panel.appendChild(p);
  panel.scrollTop = panel.scrollHeight;
}

function simulateParse() {
  appState.parseProgress = 0;
  const bar = document.querySelector("#parse-progress-bar");
  const label = document.querySelector("#parse-progress-label");
  appendLog("开始解析图纸批次");
  const timer = setInterval(() => {
    appState.parseProgress += 8 + Math.random() * 10;
    if (appState.parseProgress >= 100) {
      appState.parseProgress = 100;
      clearInterval(timer);
      bar.style.width = "100%";
      label.textContent = "解析完成: 焊缝信息表已生成";
      appendLog("解析完成，识别到 12 条焊缝");
      appState.seamRows = appState.seamRows.map((row) => {
        const next = { ...row };
        if (next.conf < 0.7 && next.status !== "confirmed") next.status = "uncertain";
        return next;
      });
      renderSeamTable();
      setStatusSnapshot();
      return;
    }
    bar.style.width = `${appState.parseProgress}%`;
    label.textContent = `解析进度 ${Math.floor(appState.parseProgress)}%`;
    appendLog(`正在识别焊缝符号与几何要素 (${Math.floor(appState.parseProgress)}%)`);
  }, 350);
}

function setStatusSnapshot() {
  document.querySelector("#status-standard").textContent = appState.standard;
  const hasError = appState.conflicts.some((item) => item.severity === "error");
  document.querySelector("#status-match").textContent = hasError ? "partial" : "match";
  document.querySelector("#status-license").textContent = appState.licenseStatus;
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

function buildMatchRequestPayload(useStoredMasterData = false) {
  const standardCode = toStandardCode(appState.standard);
  return {
    trace_id: appState.traceId,
    project_id: PROTOTYPE_PROJECT_ID,
    standard_code: standardCode,
    inventory_policy: "warn",
    top_k: 3,
    weld_seams: appState.seamRows.map((row) => ({
      weld_id: row.id,
      material_group_a: row.matA,
      material_group_b: row.matB,
      thickness_a_mm: Number(row.thkA),
      thickness_b_mm: Number(row.thkB),
      position_code: row.pos,
      process_hint: "GTAW",
      review_status: toReviewStatus(row.status)
    })),
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
    projectId: PROTOTYPE_PROJECT_ID,
    limit: MASTER_DATA_SYNC_LIMIT
  });
  return JSON.parse(payload);
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
        projectId: PROTOTYPE_PROJECT_ID,
        [commandSet.deleteIdArg]: id
      });
    }
  }

  for (const row of rows) {
    await invokeTauriCommand(commandSet.upsert, {
      dbPath: PROTOTYPE_DB_PATH,
      projectId: PROTOTYPE_PROJECT_ID,
      [commandSet.upsertArg]: JSON.stringify(commandSet.toPayload(row))
    });
  }

  return { localCount: rows.length, remoteCount: remoteIds.size };
}

async function syncMasterDataToBackend() {
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

  setMasterDirty("pqr", false);
  setMasterDirty("welder", false);
  setMasterDirty("batch", false);
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

async function bootstrapMasterDataFromBackend() {
  if (typeof window.__TAURI_INTERNALS__?.invoke !== "function") {
    return;
  }
  try {
    await Promise.all([reloadPqrRowsFromBackend(), reloadWelderRowsFromBackend(), reloadBatchRowsFromBackend()]);
    addEvent("master data loaded from backend");
  } catch (error) {
    addEvent(`startup master data load skipped: ${String(error)}`);
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
  addEvent(`fallback simulation used: ${pick.pqr} + ${pick.welder}`);
}

async function runMatch() {
  try {
    await syncMasterDataToBackend();
    const requestPayload = buildMatchRequestPayload(true);
    const responseJson = await invokeTauriCommand("run_match", {
      dbPath: PROTOTYPE_DB_PATH,
      projectName: "Prototype UI Project",
      requestJson: JSON.stringify(requestPayload)
    });
    const response = JSON.parse(responseJson);
    applyMatchResponse(response);
    addEvent(`backend match finished: ${response.trace_id || appState.traceId}`);
  } catch (error) {
    runMatchFallback();
    addEvent(`backend match unavailable, fallback simulation used (${String(error)})`);
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
  const getFilterStateByTable = (table) => (table === "pqr" ? appState.pqrFilter : appState.welderFilter);
  const renderTableByName = (table) => {
    if (table === "pqr") renderPqr();
    if (table === "welder") renderWelder();
  };

  const syncSortButtons = () => {
    allSortButtons.forEach((btn) => {
      const state = getFilterStateByTable(btn.dataset.table);
      const active = state.sortCol === btn.dataset.col;
      btn.classList.toggle("is-active", active);
      btn.textContent = active ? (state.sortDir === "asc" ? "↑" : "↓") : "↕";
    });
  };

  const syncFilterButtons = () => {
    allFilterButtons.forEach((btn) => {
      if (btn.dataset.filterType !== "bool") {
        btn.classList.remove("is-active");
        return;
      }
      const state = getFilterStateByTable(btn.dataset.table);
      btn.classList.toggle("is-active", Boolean(state[btn.dataset.filterKey]));
    });
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
      syncSortButtons();
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
      syncFilterButtons();
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

  syncSortButtons();
  syncFilterButtons();

  const pqrToolbarButtons = ensureMasterToolbarButtons("pqr", "pqr", "Add PQR");
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
      addEvent("new pqr row added");
    });
  }
  if (pqrToolbarButtons.sync) {
    pqrToolbarButtons.sync.addEventListener("click", async () => {
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
        addEvent("pqr rows synced to backend");
      } catch (error) {
        addEvent(`pqr sync failed: ${String(error)}`);
      }
    });
  }
  if (pqrToolbarButtons.load) {
    pqrToolbarButtons.load.addEventListener("click", async () => {
      try {
        await reloadPqrRowsFromBackend();
        addEvent("pqr rows loaded from backend");
      } catch (error) {
        addEvent(`pqr load failed: ${String(error)}`);
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
            addEvent(`pqr ${row.id} rejected: standard must be ASME_IX or CN_GB`);
            return;
          }
          row[field] = normalized.value;
        } else if (field === "range") {
          const normalized = normalizeThicknessRangeInput(value);
          if (!normalized.ok) {
            renderPqr();
            addEvent(`pqr ${row.id} rejected: range must be min-max`);
            return;
          }
          row[field] = normalized.value;
        } else if (field === "maxDelta") {
          const normalized = normalizeNumberInput(value, 0);
          if (!normalized.ok) {
            renderPqr();
            addEvent(`pqr ${row.id} rejected: maxDelta must be >= 0`);
            return;
          }
          row[field] = normalized.value;
        } else if (field === "valid") {
          const normalized = normalizeDateInput(value, true);
          if (!normalized.ok) {
            renderPqr();
            addEvent(`pqr ${row.id} rejected: valid date must be YYYY-MM-DD`);
            return;
          }
          row[field] = normalized.value;
        } else {
          const normalized = normalizeTextInput(value);
          if (!normalized.ok) {
            renderPqr();
            addEvent(`pqr ${row.id} rejected: ${field} cannot be empty`);
            return;
          }
          row[field] = normalized.value;
        }
        renderPqr();
        setMasterDirty("pqr", true);
        addEvent(`pqr ${row.id} updated: ${field}`);
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
        addEvent(`pqr ${row.id} toggled: ${field}`);
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
      addEvent(`pqr removed: ${removed?.id || rowId}`);
    });
  }

  const welderToolbarButtons = ensureMasterToolbarButtons("welder", "welder", "Add Welder");
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
      addEvent("new welder row added");
    });
  }
  if (welderToolbarButtons.sync) {
    welderToolbarButtons.sync.addEventListener("click", async () => {
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
        addEvent("welder rows synced to backend");
      } catch (error) {
        addEvent(`welder sync failed: ${String(error)}`);
      }
    });
  }
  if (welderToolbarButtons.load) {
    welderToolbarButtons.load.addEventListener("click", async () => {
      try {
        await reloadWelderRowsFromBackend();
        addEvent("welder rows loaded from backend");
      } catch (error) {
        addEvent(`welder load failed: ${String(error)}`);
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
            addEvent(`welder ${row.id} rejected: thicknessDeltaMax must be >= 0`);
            return;
          }
          row[field] = normalized.value;
        } else if (field === "exp") {
          const normalized = normalizeDateInput(value, true);
          if (!normalized.ok) {
            renderWelder();
            addEvent(`welder ${row.id} rejected: expiry date must be YYYY-MM-DD`);
            return;
          }
          row[field] = normalized.value;
        } else {
          const normalized = normalizeTextInput(value);
          if (!normalized.ok) {
            renderWelder();
            addEvent(`welder ${row.id} rejected: ${field} cannot be empty`);
            return;
          }
          row[field] = normalized.value;
        }
        renderWelder();
        setMasterDirty("welder", true);
        addEvent(`welder ${row.id} updated: ${field}`);
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
        addEvent(`welder ${row.id} toggled: ${field}`);
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
      addEvent(`welder removed: ${removed?.id || rowId}`);
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
      addEvent("new batch row added");
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
            addEvent(`batch ${row.batch_no} rejected: ${field} must be >= 0`);
            return;
          }
          row[field] = normalized.value;
        } else if (field === "expiry_date") {
          const normalized = normalizeDateInput(value, true);
          if (!normalized.ok) {
            renderBatch();
            addEvent(`batch ${row.batch_no} rejected: expiry date must be YYYY-MM-DD`);
            return;
          }
          row[field] = normalized.value;
        } else {
          const normalized = normalizeTextInput(value);
          if (!normalized.ok) {
            renderBatch();
            addEvent(`batch ${row.batch_no} rejected: ${field} cannot be empty`);
            return;
          }
          row[field] = normalized.value;
        }
        renderBatch();
        setMasterDirty("batch", true);
        addEvent(`batch ${row.batch_no} updated: ${field}`);
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
      addEvent(`batch removed: ${removed?.batch_no || idx}`);
    });
  }

  const batchSyncBtn = document.querySelector("#btn-batch-sync");
  if (batchSyncBtn) {
    batchSyncBtn.addEventListener("click", async () => {
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
        addEvent("batch rows synced to backend");
      } catch (error) {
        addEvent(`batch sync failed: ${String(error)}`);
      }
    });
  }

  const batchLoadBtn = document.querySelector("#btn-batch-load");
  if (batchLoadBtn) {
    batchLoadBtn.addEventListener("click", async () => {
      try {
        await reloadBatchRowsFromBackend();
        addEvent("batch rows loaded from backend");
      } catch (error) {
        addEvent(`batch load failed: ${String(error)}`);
      }
    });
  }

  syncMasterToolbarState();

  document.querySelector("#project-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    appState.standard = form.get("standard_code");
    setStatusSnapshot();
    addEvent(`项目已创建，标准设置为 ${appState.standard}`);
    setView("import");
  });

  document.querySelector("#btn-parse").addEventListener("click", simulateParse);
  document.querySelector("#btn-retry-parse").addEventListener("click", () => appendLog("重试任务已入队"));

  document.querySelector("#btn-confirm-all").addEventListener("click", () => {
    appState.seamRows = appState.seamRows.map((row) => ({ ...row, status: "confirmed" }));
    renderSeamTable();
    addEvent("焊缝信息已批量确认");
  });

  document.querySelector("#btn-mark-uncertain").addEventListener("click", () => {
    appState.seamRows = appState.seamRows.map((row) => (row.conf < 0.7 ? { ...row, status: "uncertain" } : row));
    renderSeamTable();
    addEvent("低置信度焊缝已标记 uncertain");
  });

  document.querySelector("#btn-mark-special").addEventListener("click", () => {
    appState.seamRows = appState.seamRows.map((row) => {
      const special = getSpecialCase(row).key;
      if (special !== "normal" && row.status !== "confirmed") return { ...row, status: "uncertain" };
      return row;
    });
    renderSeamTable();
    addEvent("特殊工况焊缝已标记 uncertain");
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
      row.status = row.status === "confirmed" ? "confirmed" : "pending";
      renderSpecialSummary();
      addEvent(`焊缝 ${row.id} 字段 ${field} 已更新`);
    },
    true
  );

  document.querySelector("#btn-run-match").addEventListener("click", () => {
    runMatch();
    bumpTraceId();
  });

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
  renderPqr();
  renderWelder();
  renderBatch();
  renderAlternatives();
  renderInventoryAlerts();
  renderConflicts("all");
  setStatusSnapshot();
  initHandlers();
  bootstrapMasterDataFromBackend();
  startClock();
}

init();
