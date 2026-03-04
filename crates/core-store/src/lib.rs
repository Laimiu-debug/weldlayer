use contracts::matching::{MatchRequest, MatchResponse, StandardCode};
use rusqlite::{params, Connection, OptionalExtension};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("db error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Clone)]
pub struct ProjectRecord {
    pub project_id: String,
    pub project_name: String,
    pub standard_code: StandardCode,
    pub updated_at: i64,
}

#[derive(Debug, Clone)]
pub struct MatchReportRecord {
    pub trace_id: String,
    pub project_id: String,
    pub decision: String,
    pub rule_package_version: String,
    pub request_json: String,
    pub response_json: String,
    pub created_at: i64,
}

#[derive(Debug, Clone)]
pub struct AuditLogRecord {
    pub trace_id: String,
    pub action: String,
    pub result: String,
    pub payload_json: String,
    pub created_at: i64,
}

pub struct Store {
    conn: Connection,
}

impl Store {
    pub fn open(path: &str) -> Result<Self, StoreError> {
        let conn = Connection::open(path)?;
        let store = Self { conn };
        store.migrate()?;
        Ok(store)
    }

    pub fn open_in_memory() -> Result<Self, StoreError> {
        let conn = Connection::open_in_memory()?;
        let store = Self { conn };
        store.migrate()?;
        Ok(store)
    }

    pub fn upsert_project(
        &self,
        project_id: &str,
        project_name: &str,
        standard_code: &StandardCode,
    ) -> Result<(), StoreError> {
        let updated_at = now_unix_ts();
        let standard_json = serde_json::to_string(standard_code)?;
        self.conn.execute(
            r#"
            INSERT INTO projects (project_id, project_name, standard_code, updated_at)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(project_id) DO UPDATE SET
              project_name = excluded.project_name,
              standard_code = excluded.standard_code,
              updated_at = excluded.updated_at
            "#,
            params![project_id, project_name, standard_json, updated_at],
        )?;
        Ok(())
    }

    pub fn get_project(&self, project_id: &str) -> Result<Option<ProjectRecord>, StoreError> {
        let row = self
            .conn
            .query_row(
                r#"
                SELECT project_id, project_name, standard_code, updated_at
                FROM projects
                WHERE project_id = ?1
                "#,
                params![project_id],
                |row| {
                    let standard_code_json: String = row.get(2)?;
                    let standard_code: StandardCode =
                        serde_json::from_str(&standard_code_json).map_err(map_json_err)?;
                    Ok(ProjectRecord {
                        project_id: row.get(0)?,
                        project_name: row.get(1)?,
                        standard_code,
                        updated_at: row.get(3)?,
                    })
                },
            )
            .optional()?;
        Ok(row)
    }

    pub fn insert_match_report(
        &self,
        request: &MatchRequest,
        response: &MatchResponse,
    ) -> Result<(), StoreError> {
        let request_json = serde_json::to_string(request)?;
        let response_json = serde_json::to_string(response)?;
        let created_at = now_unix_ts();

        self.conn.execute(
            r#"
            INSERT INTO match_reports
              (trace_id, project_id, decision, rule_package_version, request_json, response_json, created_at)
            VALUES
              (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
            params![
                response.trace_id,
                request.project_id,
                format!("{:?}", response.decision).to_lowercase(),
                response.rule_package.version,
                request_json,
                response_json,
                created_at
            ],
        )?;

        Ok(())
    }

    pub fn list_match_reports(&self, limit: usize) -> Result<Vec<MatchReportRecord>, StoreError> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT trace_id, project_id, decision, rule_package_version, request_json, response_json, created_at
            FROM match_reports
            ORDER BY created_at DESC
            LIMIT ?1
            "#,
        )?;

        let rows = stmt
            .query_map(params![limit as i64], |row| {
                Ok(MatchReportRecord {
                    trace_id: row.get(0)?,
                    project_id: row.get(1)?,
                    decision: row.get(2)?,
                    rule_package_version: row.get(3)?,
                    request_json: row.get(4)?,
                    response_json: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(rows)
    }

    pub fn insert_audit_log(
        &self,
        trace_id: &str,
        action: &str,
        result: &str,
        payload_json: &str,
    ) -> Result<(), StoreError> {
        self.conn.execute(
            r#"
            INSERT INTO audit_logs (trace_id, action, result, payload_json, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
            "#,
            params![trace_id, action, result, payload_json, now_unix_ts()],
        )?;
        Ok(())
    }

    pub fn list_audit_logs(&self, limit: usize) -> Result<Vec<AuditLogRecord>, StoreError> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT trace_id, action, result, payload_json, created_at
            FROM audit_logs
            ORDER BY created_at DESC
            LIMIT ?1
            "#,
        )?;

        let rows = stmt
            .query_map(params![limit as i64], |row| {
                Ok(AuditLogRecord {
                    trace_id: row.get(0)?,
                    action: row.get(1)?,
                    result: row.get(2)?,
                    payload_json: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(rows)
    }

    fn migrate(&self) -> Result<(), StoreError> {
        self.conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;

            CREATE TABLE IF NOT EXISTS projects (
              project_id TEXT PRIMARY KEY,
              project_name TEXT NOT NULL,
              standard_code TEXT NOT NULL,
              updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS match_reports (
              trace_id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL,
              decision TEXT NOT NULL,
              rule_package_version TEXT NOT NULL,
              request_json TEXT NOT NULL,
              response_json TEXT NOT NULL,
              created_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_match_reports_project_id ON match_reports(project_id);
            CREATE INDEX IF NOT EXISTS idx_match_reports_created_at ON match_reports(created_at DESC);

            CREATE TABLE IF NOT EXISTS audit_logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              trace_id TEXT NOT NULL,
              action TEXT NOT NULL,
              result TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              created_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_audit_logs_trace_id ON audit_logs(trace_id);
            CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
            "#,
        )?;
        Ok(())
    }
}

fn now_unix_ts() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn map_json_err(err: serde_json::Error) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        0,
        rusqlite::types::Type::Text,
        Box::new(err),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use contracts::matching::{
        Decision, InventoryPolicy, MatchRequest, MatchResponse, PqrCandidate, RequiredConsumable, ReviewStatus,
        RulePackageRef, StandardCode, WelderCandidate, WeldSeam,
    };

    fn sample_request() -> MatchRequest {
        MatchRequest {
            trace_id: "TRC-001".to_string(),
            project_id: "PRJ-001".to_string(),
            standard_code: StandardCode::AsmeIx,
            inventory_policy: InventoryPolicy::Warn,
            top_k: 3,
            weld_seams: vec![WeldSeam {
                weld_id: "W-001".to_string(),
                material_group_a: "P-No.1".to_string(),
                material_group_b: "P-No.1".to_string(),
                thickness_a_mm: 12.0,
                thickness_b_mm: 12.0,
                position_code: "2G".to_string(),
                process_hint: "GTAW".to_string(),
                review_status: ReviewStatus::Confirmed,
            }],
            pqr_candidates: vec![PqrCandidate {
                pqr_id: "PQR-001".to_string(),
                standard_code: StandardCode::AsmeIx,
                process_code: "GTAW".to_string(),
                material_group_scope: vec!["P-No.1".to_string()],
                thickness_min_mm: 3.0,
                thickness_max_mm: 45.0,
                position_scope: vec!["2G".to_string()],
                dissimilar_support: true,
                thickness_mismatch_support: true,
                thickness_delta_max_mm: 10.0,
                valid_to: "2027-01-01".to_string(),
                status: "active".to_string(),
            }],
            welder_candidates: vec![WelderCandidate {
                welder_id: "WELDER-001".to_string(),
                cert_no: "CERT-001".to_string(),
                standard_code: StandardCode::AsmeIx,
                process_code: "GTAW".to_string(),
                material_group_scope: vec!["P-No.1".to_string()],
                position_scope: vec!["2G".to_string()],
                dissimilar_qualified: true,
                thickness_mismatch_qualified: true,
                thickness_delta_max_mm: 10.0,
                expiry_date: "2027-01-01".to_string(),
                status: "active".to_string(),
            }],
            required_consumables: vec![RequiredConsumable {
                material_code: "ER70S-6".to_string(),
                required_qty: 8.0,
            }],
            consumable_batches: vec![],
        }
    }

    fn sample_response() -> MatchResponse {
        MatchResponse {
            trace_id: "TRC-001".to_string(),
            decision: Decision::Partial,
            recommended: None,
            alternatives: vec![],
            hard_conflicts: vec![],
            inventory_alerts: vec![],
            rule_package: RulePackageRef {
                standard_code: StandardCode::AsmeIx,
                version: "0.1.0".to_string(),
            },
        }
    }

    #[test]
    fn can_upsert_and_read_project() {
        let store = Store::open_in_memory().expect("open in-memory db");
        store
            .upsert_project("PRJ-001", "Test Project", &StandardCode::AsmeIx)
            .expect("upsert project");

        let got = store
            .get_project("PRJ-001")
            .expect("query project")
            .expect("project exists");

        assert_eq!(got.project_id, "PRJ-001");
        assert_eq!(got.project_name, "Test Project");
        assert_eq!(got.standard_code, StandardCode::AsmeIx);
    }

    #[test]
    fn can_insert_match_report_and_audit_log() {
        let store = Store::open_in_memory().expect("open in-memory db");
        let req = sample_request();
        let res = sample_response();

        store
            .insert_match_report(&req, &res)
            .expect("insert match report");
        store
            .insert_audit_log(&res.trace_id, "run_match", "partial", "{\"reason\":\"warn inventory\"}")
            .expect("insert audit log");

        let reports = store.list_match_reports(10).expect("list reports");
        let logs = store.list_audit_logs(10).expect("list logs");

        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0].trace_id, "TRC-001");
        assert_eq!(reports[0].decision, "partial");
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].action, "run_match");
    }
}
