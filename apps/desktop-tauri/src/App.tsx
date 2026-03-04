import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { matchExample, parseExample } from "./examples";

type LogLevel = "info" | "error";

type LogItem = {
  level: LogLevel;
  text: string;
};

function nowLabel(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function pretty(input: unknown): string {
  return JSON.stringify(input, null, 2);
}

function parseDisplayJson(responseJson: string): string {
  try {
    return pretty(JSON.parse(responseJson));
  } catch {
    return responseJson;
  }
}

export default function App() {
  const [dbPath, setDbPath] = useState("weldlayer.db");
  const [projectName, setProjectName] = useState("Desktop Demo Project");
  const [matchRequest, setMatchRequest] = useState(pretty(matchExample));
  const [parseRequest, setParseRequest] = useState(pretty(parseExample));
  const [resultText, setResultText] = useState("");
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [busy, setBusy] = useState(false);

  const tauriReady = useMemo(
    () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window,
    []
  );

  const appendLog = (level: LogLevel, text: string) => {
    setLogs((prev) => [{ level, text: `[${nowLabel()}] ${text}` }, ...prev].slice(0, 40));
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
      setResultText(parseDisplayJson(responseJson));
      appendLog("info", "run_match completed");
    } catch (error) {
      const text = String(error);
      setResultText(text);
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
      setResultText(parseDisplayJson(responseJson));
      appendLog("info", "run_parse completed");
    } catch (error) {
      const text = String(error);
      setResultText(text);
      appendLog("error", `run_parse failed: ${text}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>WeldLayer Desktop Shell</h1>
        <p>{tauriReady ? "Tauri runtime detected." : "Browser mode only. Run with Tauri to invoke commands."}</p>
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
          <button disabled={busy} onClick={runParse}>
            {busy ? "Running..." : "Run run_parse"}
          </button>
        </section>

        <section className="card">
          <h2>Result</h2>
          <pre>{resultText || "Waiting for command execution..."}</pre>
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
