import { ChangeEvent, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { matchExample, parseExample } from "./examples";

const TEMPLATE_STORAGE_KEY = "weldlayer.request.templates.v1";
const MAX_TEMPLATE_COUNT = 50;
const TEMPLATE_EXPORT_VERSION = 1;

type LogLevel = "info" | "error";
type TemplateType = "match" | "parse";

type LogItem = {
  level: LogLevel;
  text: string;
};

type RequestTemplate = {
  id: string;
  type: TemplateType;
  name: string;
  payload: string;
  createdAt: string;
  updatedAt: string;
};

type ParseResponseView = {
  traceId: string;
  status: string;
  seams: Record<string, unknown>[];
  errors: Record<string, unknown>[];
  logs: Record<string, unknown>[];
};

function nowLabel(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function pretty(input: unknown): string {
  return JSON.stringify(input, null, 2);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

function tryParseJson(input: string): unknown | null {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function readRecordField(record: Record<string, unknown>, field: string, fallback = "-"): string {
  const value = record[field];
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function readConfidence(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value === "number") {
    return value.toFixed(3);
  }
  return "-";
}

function suggestTemplateName(prefix: TemplateType): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${stamp}`;
}

function normalizeTemplate(input: unknown): RequestTemplate | null {
  if (!isRecord(input)) {
    return null;
  }

  const type = input.type;
  const id = input.id;
  const name = input.name;
  const payload = input.payload;
  const createdAt = input.createdAt;
  const updatedAt = input.updatedAt;

  if ((type !== "match" && type !== "parse") || typeof id !== "string" || typeof name !== "string") {
    return null;
  }
  if (typeof payload !== "string" || typeof createdAt !== "string" || typeof updatedAt !== "string") {
    return null;
  }

  return {
    id,
    type,
    name,
    payload,
    createdAt,
    updatedAt
  };
}

function normalizeTemplateList(input: unknown): RequestTemplate[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => normalizeTemplate(item))
    .filter((item): item is RequestTemplate => item !== null);
}

function loadTemplatesFromStorage(): RequestTemplate[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => normalizeTemplate(item))
      .filter((item): item is RequestTemplate => item !== null)
      .slice(0, MAX_TEMPLATE_COUNT);
  } catch {
    return [];
  }
}

function persistTemplatesToStorage(templates: RequestTemplate[]): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
}

function mergeTemplates(existing: RequestTemplate[], imported: RequestTemplate[]): RequestTemplate[] {
  const map = new Map<string, RequestTemplate>();

  for (const template of existing) {
    map.set(`${template.type}:${template.name}`, template);
  }

  for (const template of imported) {
    map.set(`${template.type}:${template.name}`, template);
  }

  return [...map.values()]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_TEMPLATE_COUNT);
}

function readImportTemplates(input: unknown): RequestTemplate[] {
  if (Array.isArray(input)) {
    return normalizeTemplateList(input);
  }
  if (!isRecord(input)) {
    return [];
  }
  return normalizeTemplateList(input.templates);
}

function toParseResponseView(input: unknown): ParseResponseView | null {
  if (!isRecord(input)) {
    return null;
  }

  const status = input.status;
  const seams = input.seams;
  const errors = input.errors;
  const logs = input.logs;

  if (typeof status !== "string" || !Array.isArray(seams) || !Array.isArray(errors) || !Array.isArray(logs)) {
    return null;
  }

  return {
    traceId: typeof input.trace_id === "string" ? input.trace_id : "",
    status,
    seams: seams.filter((item): item is Record<string, unknown> => isRecord(item)),
    errors: errors.filter((item): item is Record<string, unknown> => isRecord(item)),
    logs: logs.filter((item): item is Record<string, unknown> => isRecord(item))
  };
}

export default function App() {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [dbPath, setDbPath] = useState("weldlayer.db");
  const [projectName, setProjectName] = useState("Desktop Demo Project");
  const [matchRequest, setMatchRequest] = useState(pretty(matchExample));
  const [parseRequest, setParseRequest] = useState(pretty(parseExample));
  const [matchTemplateName, setMatchTemplateName] = useState(suggestTemplateName("match"));
  const [parseTemplateName, setParseTemplateName] = useState(suggestTemplateName("parse"));
  const [selectedMatchTemplateId, setSelectedMatchTemplateId] = useState("");
  const [selectedParseTemplateId, setSelectedParseTemplateId] = useState("");
  const [templates, setTemplates] = useState<RequestTemplate[]>(() => loadTemplatesFromStorage());
  const [resultText, setResultText] = useState("");
  const [resultJson, setResultJson] = useState<unknown | null>(null);
  const [resultView, setResultView] = useState<"raw" | "structured">("raw");
  const [lastCommand, setLastCommand] = useState<TemplateType | null>(null);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [busy, setBusy] = useState(false);

  const tauriReady = useMemo(
    () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window,
    []
  );

  const matchTemplates = useMemo(
    () => templates.filter((template) => template.type === "match"),
    [templates]
  );

  const parseTemplates = useMemo(
    () => templates.filter((template) => template.type === "parse"),
    [templates]
  );

  const parseResult = useMemo(
    () => (lastCommand === "parse" ? toParseResponseView(resultJson) : null),
    [lastCommand, resultJson]
  );

  const appendLog = (level: LogLevel, text: string) => {
    setLogs((prev) => [{ level, text: `[${nowLabel()}] ${text}` }, ...prev].slice(0, 40));
  };

  const setResponse = (responseJson: string, command: TemplateType) => {
    const parsed = tryParseJson(responseJson);
    setResultJson(parsed);
    setResultText(parsed === null ? responseJson : pretty(parsed));
    setLastCommand(command);
    setResultView(command === "parse" ? "structured" : "raw");
  };

  const runMatch = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    appendLog("info", "Running run_match");
    try {
      const responseJson = await invoke<string>("run_match", {
        dbPath,
        projectName,
        requestJson: matchRequest
      });
      setResponse(responseJson, "match");
      appendLog("info", "run_match completed");
    } catch (error) {
      const text = String(error);
      setResultText(text);
      setResultJson(null);
      setLastCommand("match");
      setResultView("raw");
      appendLog("error", `run_match failed: ${text}`);
    } finally {
      setBusy(false);
    }
  };

  const runParse = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    appendLog("info", "Running run_parse");
    try {
      const responseJson = await invoke<string>("run_parse", {
        requestJson: parseRequest
      });
      setResponse(responseJson, "parse");
      appendLog("info", "run_parse completed");
    } catch (error) {
      const text = String(error);
      setResultText(text);
      setResultJson(null);
      setLastCommand("parse");
      setResultView("raw");
      appendLog("error", `run_parse failed: ${text}`);
    } finally {
      setBusy(false);
    }
  };

  const saveTemplate = (type: TemplateType) => {
    const payload = type === "match" ? matchRequest : parseRequest;
    const draftName = type === "match" ? matchTemplateName : parseTemplateName;
    const parsed = tryParseJson(payload);

    if (parsed === null) {
      appendLog("error", `${type} template save failed: request is not valid JSON`);
      return;
    }

    const name = draftName.trim() || suggestTemplateName(type);
    const now = new Date().toISOString();
    let savedTemplateId = "";

    setTemplates((prev) => {
      const existingIndex = prev.findIndex((template) => template.type === type && template.name === name);
      let next = [...prev];

      if (existingIndex >= 0) {
        const existing = next[existingIndex];
        savedTemplateId = existing.id;
        next[existingIndex] = {
          ...existing,
          payload,
          updatedAt: now
        };
      } else {
        savedTemplateId = `${type}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        next = [
          {
            id: savedTemplateId,
            type,
            name,
            payload,
            createdAt: now,
            updatedAt: now
          },
          ...next
        ].slice(0, MAX_TEMPLATE_COUNT);
      }

      persistTemplatesToStorage(next);
      return next;
    });

    if (type === "match") {
      setSelectedMatchTemplateId(savedTemplateId);
      setMatchTemplateName(suggestTemplateName("match"));
    } else {
      setSelectedParseTemplateId(savedTemplateId);
      setParseTemplateName(suggestTemplateName("parse"));
    }

    appendLog("info", `${type} template saved: ${name}`);
  };

  const loadTemplate = (type: TemplateType) => {
    const selectedId = type === "match" ? selectedMatchTemplateId : selectedParseTemplateId;
    const template = templates.find((item) => item.id === selectedId && item.type === type);

    if (!template) {
      appendLog("error", `${type} template load failed: no template selected`);
      return;
    }

    if (type === "match") {
      setMatchRequest(template.payload);
    } else {
      setParseRequest(template.payload);
    }

    appendLog("info", `${type} template loaded: ${template.name}`);
  };

  const deleteTemplate = (type: TemplateType) => {
    const selectedId = type === "match" ? selectedMatchTemplateId : selectedParseTemplateId;
    const template = templates.find((item) => item.id === selectedId && item.type === type);

    if (!template) {
      appendLog("error", `${type} template delete failed: no template selected`);
      return;
    }

    setTemplates((prev) => {
      const next = prev.filter((item) => item.id !== selectedId);
      persistTemplatesToStorage(next);
      return next;
    });

    if (type === "match") {
      setSelectedMatchTemplateId("");
    } else {
      setSelectedParseTemplateId("");
    }

    appendLog("info", `${type} template deleted: ${template.name}`);
  };

  const exportTemplates = () => {
    if (templates.length === 0) {
      appendLog("error", "template export failed: no templates to export");
      return;
    }

    const payload = {
      schema: "weldlayer-templates",
      version: TEMPLATE_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      templates
    };
    const blob = new Blob([pretty(payload)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = url;
    link.download = `weldlayer-templates-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    appendLog("info", `template export completed: ${templates.length} items`);
  };

  const triggerImportDialog = () => {
    importInputRef.current?.click();
  };

  const importTemplates = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const imported = readImportTemplates(parsed);

      if (imported.length === 0) {
        appendLog("error", "template import failed: no valid templates found in file");
        return;
      }

      setTemplates((prev) => {
        const merged = mergeTemplates(prev, imported);
        persistTemplatesToStorage(merged);
        return merged;
      });

      appendLog("info", `template import completed: ${imported.length} items`);
    } catch (error) {
      appendLog("error", `template import failed: ${String(error)}`);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>WeldLayer Desktop Shell</h1>
        <p>{tauriReady ? "Tauri runtime detected." : "Browser mode only. Run with Tauri to invoke commands."}</p>
        <div className="template-tools">
          <button className="secondary" disabled={busy} onClick={exportTemplates}>
            Export Templates
          </button>
          <button className="ghost" disabled={busy} onClick={triggerImportDialog}>
            Import Templates
          </button>
          <input ref={importInputRef} type="file" accept=".json,application/json" hidden onChange={importTemplates} />
        </div>
      </header>

      <main className="layout">
        <section className="card">
          <h2>Match Command</h2>
          <label>
            DB Path
            <input value={dbPath} onChange={(e) => setDbPath(e.target.value)} />
          </label>
          <label>
            Project Name
            <input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
          </label>
          <label>
            Match Request JSON
            <textarea value={matchRequest} onChange={(e) => setMatchRequest(e.target.value)} rows={14} />
          </label>

          <div className="template-panel">
            <div className="template-row">
              <input
                value={matchTemplateName}
                onChange={(e) => setMatchTemplateName(e.target.value)}
                placeholder="Template name"
              />
              <button className="secondary" disabled={busy} onClick={() => saveTemplate("match")}>
                Save Template
              </button>
            </div>
            <div className="template-row">
              <select value={selectedMatchTemplateId} onChange={(e) => setSelectedMatchTemplateId(e.target.value)}>
                <option value="">Select a match template</option>
                {matchTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
              <button className="ghost" disabled={busy || !selectedMatchTemplateId} onClick={() => loadTemplate("match")}>
                Load
              </button>
              <button
                className="ghost danger"
                disabled={busy || !selectedMatchTemplateId}
                onClick={() => deleteTemplate("match")}
              >
                Delete
              </button>
            </div>
          </div>

          <button disabled={busy} onClick={runMatch}>
            {busy ? "Running..." : "Run run_match"}
          </button>
        </section>

        <section className="card">
          <h2>Parse Command</h2>
          <label>
            Parse Request JSON
            <textarea value={parseRequest} onChange={(e) => setParseRequest(e.target.value)} rows={14} />
          </label>

          <div className="template-panel">
            <div className="template-row">
              <input
                value={parseTemplateName}
                onChange={(e) => setParseTemplateName(e.target.value)}
                placeholder="Template name"
              />
              <button className="secondary" disabled={busy} onClick={() => saveTemplate("parse")}>
                Save Template
              </button>
            </div>
            <div className="template-row">
              <select value={selectedParseTemplateId} onChange={(e) => setSelectedParseTemplateId(e.target.value)}>
                <option value="">Select a parse template</option>
                {parseTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
              <button className="ghost" disabled={busy || !selectedParseTemplateId} onClick={() => loadTemplate("parse")}>
                Load
              </button>
              <button
                className="ghost danger"
                disabled={busy || !selectedParseTemplateId}
                onClick={() => deleteTemplate("parse")}
              >
                Delete
              </button>
            </div>
          </div>

          <button disabled={busy} onClick={runParse}>
            {busy ? "Running..." : "Run run_parse"}
          </button>
        </section>

        <section className="card">
          <h2>Result</h2>
          {parseResult ? (
            <div className="result-toolbar">
              <button
                className={resultView === "structured" ? "secondary active" : "ghost"}
                onClick={() => setResultView("structured")}
              >
                Structured
              </button>
              <button className={resultView === "raw" ? "secondary active" : "ghost"} onClick={() => setResultView("raw")}>
                Raw JSON
              </button>
            </div>
          ) : null}

          {parseResult && resultView === "structured" ? (
            <div className="result-structured">
              <div className="result-kpis">
                <div className="kpi-item">
                  <span>Status</span>
                  <strong>{parseResult.status}</strong>
                </div>
                <div className="kpi-item">
                  <span>Trace ID</span>
                  <strong>{parseResult.traceId || "-"}</strong>
                </div>
                <div className="kpi-item">
                  <span>Seams</span>
                  <strong>{parseResult.seams.length}</strong>
                </div>
                <div className="kpi-item">
                  <span>Errors</span>
                  <strong>{parseResult.errors.length}</strong>
                </div>
              </div>

              <div className="result-block">
                <h3>Extracted Seams</h3>
                {parseResult.seams.length === 0 ? (
                  <p className="muted">No seams extracted.</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Weld ID</th>
                          <th>Drawing Ref</th>
                          <th>Symbol</th>
                          <th>Material</th>
                          <th>Thickness</th>
                          <th>Position</th>
                          <th>Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parseResult.seams.map((seam, idx) => (
                          <tr key={`seam-${idx}`}>
                            <td>{readRecordField(seam, "weld_id")}</td>
                            <td>{readRecordField(seam, "draw_ref")}</td>
                            <td>{readRecordField(seam, "weld_symbol")}</td>
                            <td>{readRecordField(seam, "material_spec")}</td>
                            <td>{readRecordField(seam, "thickness_mm")}</td>
                            <td>{readRecordField(seam, "position_code")}</td>
                            <td>{readConfidence(seam, "confidence_score")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="result-block">
                <h3>Errors</h3>
                {parseResult.errors.length === 0 ? (
                  <p className="muted">No parse errors.</p>
                ) : (
                  <ul className="flat-list">
                    {parseResult.errors.map((errorItem, idx) => (
                      <li key={`err-${idx}`}>
                        [{readRecordField(errorItem, "code", "unknown")}] {readRecordField(errorItem, "message")}
                        {" "}
                        ({readRecordField(errorItem, "path", "-")})
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="result-block">
                <h3>Logs</h3>
                {parseResult.logs.length === 0 ? (
                  <p className="muted">No parser logs.</p>
                ) : (
                  <ul className="flat-list">
                    {parseResult.logs.map((logItem, idx) => (
                      <li key={`parse-log-${idx}`}>
                        [{readRecordField(logItem, "level", "info")}] {readRecordField(logItem, "message")}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <pre>{resultText || "Waiting for command execution..."}</pre>
          )}
        </section>

        <section className="card">
          <h2>Logs</h2>
          <ul className="log-list">
            {logs.length === 0 ? <li>No logs yet.</li> : null}
            {logs.map((item, idx) => (
              <li key={`${item.level}-${idx}`} className={item.level}>
                {item.text}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
