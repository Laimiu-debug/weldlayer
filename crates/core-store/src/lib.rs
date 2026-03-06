use contracts::matching::{
    ConsumableBatch, MatchRequest, MatchResponse, PqrCandidate, StandardCode, WeldSeam,
    WelderCandidate,
};
use rusqlite::{params, Connection, OptionalExtension};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("db error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("not found: {0}")]
    NotFound(String),
}

#[derive(Debug, Clone)]
pub struct ProjectRecord {
    pub project_id: String,
    pub project_name: String,
    pub company_name: String,
    pub drawing_type: String,
    pub standard_code: StandardCode,
    pub archived_at: Option<i64>,
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

#[derive(Debug, Clone)]
pub struct MatchBaselineRecord {
    pub trace_id: String,
    pub project_id: String,
    pub baseline_label: String,
    pub decision: String,
    pub rule_package_version: String,
    pub summary_json: String,
    pub created_at: i64,
}

#[derive(Debug, Clone)]
pub struct MasterDataChangeSummary {
    pub seam_changes: usize,
    pub pqr_changes: usize,
    pub welder_changes: usize,
    pub batch_changes: usize,
    pub latest_change_at: i64,
}

#[derive(Debug, Clone)]
pub struct MasterDataChangeItem {
    pub scope: String,
    pub item_id: String,
    pub updated_at: i64,
    pub summary: String,
    pub impact_hint: String,
    pub payload_json: String,
}

#[derive(Debug, Clone)]
pub struct PqrProfileRecord {
    pub project_id: String,
    pub pqr: PqrCandidate,
    pub updated_at: i64,
}

#[derive(Debug, Clone)]
pub struct WelderProfileRecord {
    pub project_id: String,
    pub welder: WelderCandidate,
    pub updated_at: i64,
}

#[derive(Debug, Clone)]
pub struct ConsumableBatchRecord {
    pub project_id: String,
    pub batch: ConsumableBatch,
    pub updated_at: i64,
}

#[derive(Debug, Clone)]
pub struct WeldSeamRecord {
    pub project_id: String,
    pub seam: WeldSeam,
    pub updated_at: i64,
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
        company_name: &str,
        drawing_type: &str,
        standard_code: &StandardCode,
    ) -> Result<(), StoreError> {
        let updated_at = now_unix_ts();
        let standard_json = serde_json::to_string(standard_code)?;
        self.conn.execute(
            r#"
            INSERT INTO projects (project_id, project_name, company_name, drawing_type, standard_code, archived_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6)
            ON CONFLICT(project_id) DO UPDATE SET
              project_name = excluded.project_name,
              company_name = excluded.company_name,
              drawing_type = excluded.drawing_type,
              standard_code = excluded.standard_code,
              archived_at = NULL,
              updated_at = excluded.updated_at
            "#,
            params![
                project_id,
                project_name,
                company_name,
                drawing_type,
                standard_json,
                updated_at
            ],
        )?;
        Ok(())
    }

    pub fn get_project(&self, project_id: &str) -> Result<Option<ProjectRecord>, StoreError> {
        let row = self
            .conn
            .query_row(
                r#"
                SELECT project_id, project_name, company_name, drawing_type, standard_code, archived_at, updated_at
                FROM projects
                WHERE project_id = ?1
                "#,
                params![project_id],
                |row| {
                    let standard_code_json: String = row.get(4)?;
                    let standard_code: StandardCode =
                        serde_json::from_str(&standard_code_json).map_err(map_json_err)?;
                    Ok(ProjectRecord {
                        project_id: row.get(0)?,
                        project_name: row.get(1)?,
                        company_name: row.get(2)?,
                        drawing_type: row.get(3)?,
                        standard_code,
                        archived_at: row.get(5)?,
                        updated_at: row.get(6)?,
                    })
                },
            )
            .optional()?;
        Ok(row)
    }

    pub fn list_projects(
        &self,
        limit: usize,
        include_archived: bool,
    ) -> Result<Vec<ProjectRecord>, StoreError> {
        let sql = if include_archived {
            r#"
            SELECT project_id, project_name, company_name, drawing_type, standard_code, archived_at, updated_at
            FROM projects
            ORDER BY updated_at DESC
            LIMIT ?1
            "#
        } else {
            r#"
            SELECT project_id, project_name, company_name, drawing_type, standard_code, archived_at, updated_at
            FROM projects
            WHERE archived_at IS NULL
            ORDER BY updated_at DESC
            LIMIT ?1
            "#
        };
        let mut stmt = self.conn.prepare(sql)?;
        let rows = stmt
            .query_map(params![limit as i64], |row| {
                let standard_code_json: String = row.get(4)?;
                let standard_code: StandardCode =
                    serde_json::from_str(&standard_code_json).map_err(map_json_err)?;
                Ok(ProjectRecord {
                    project_id: row.get(0)?,
                    project_name: row.get(1)?,
                    company_name: row.get(2)?,
                    drawing_type: row.get(3)?,
                    standard_code,
                    archived_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn archive_project(
        &self,
        project_id: &str,
        archived: bool,
    ) -> Result<bool, StoreError> {
        let updated_at = now_unix_ts();
        let archived_at = if archived { Some(updated_at) } else { None };
        let changed = self.conn.execute(
            r#"
            UPDATE projects
            SET archived_at = ?2,
                updated_at = ?3
            WHERE project_id = ?1
            "#,
            params![project_id, archived_at, updated_at],
        )?;
        Ok(changed > 0)
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

    pub fn get_match_report(
        &self,
        trace_id: &str,
    ) -> Result<Option<MatchReportRecord>, StoreError> {
        let row = self
            .conn
            .query_row(
                r#"
                SELECT trace_id, project_id, decision, rule_package_version, request_json, response_json, created_at
                FROM match_reports
                WHERE trace_id = ?1
                "#,
                params![trace_id],
                |row| {
                    Ok(MatchReportRecord {
                        trace_id: row.get(0)?,
                        project_id: row.get(1)?,
                        decision: row.get(2)?,
                        rule_package_version: row.get(3)?,
                        request_json: row.get(4)?,
                        response_json: row.get(5)?,
                        created_at: row.get(6)?,
                    })
                },
            )
            .optional()?;
        Ok(row)
    }

    pub fn list_match_reports(
        &self,
        project_id: Option<&str>,
        limit: usize,
    ) -> Result<Vec<MatchReportRecord>, StoreError> {
        let rows = if let Some(project_id) = project_id {
            let mut stmt = self.conn.prepare(
                r#"
                SELECT trace_id, project_id, decision, rule_package_version, request_json, response_json, created_at
                FROM match_reports
                WHERE project_id = ?1
                ORDER BY created_at DESC
                LIMIT ?2
                "#,
            )?;
            stmt.query_map(params![project_id, limit as i64], |row| {
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
            .collect::<Result<Vec<_>, _>>()?
        } else {
            let mut stmt = self.conn.prepare(
                r#"
                SELECT trace_id, project_id, decision, rule_package_version, request_json, response_json, created_at
                FROM match_reports
                ORDER BY created_at DESC
                LIMIT ?1
                "#,
            )?;
            stmt.query_map(params![limit as i64], |row| {
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
            .collect::<Result<Vec<_>, _>>()?
        };

        Ok(rows)
    }

    pub fn freeze_match_baseline(
        &self,
        trace_id: &str,
        baseline_label: &str,
    ) -> Result<MatchBaselineRecord, StoreError> {
        let report = self.get_match_report(trace_id)?.ok_or_else(|| {
            StoreError::NotFound(format!("match report not found for trace_id={trace_id}"))
        })?;

        let response: serde_json::Value = serde_json::from_str(&report.response_json)?;
        let summary_json = serde_json::to_string(&serde_json::json!({
            "recommended": response.get("recommended").cloned().unwrap_or(serde_json::Value::Null),
            "alternative_count": response
                .get("alternatives")
                .and_then(serde_json::Value::as_array)
                .map(|items| items.len())
                .unwrap_or(0),
            "hard_conflict_count": response
                .get("hard_conflicts")
                .and_then(serde_json::Value::as_array)
                .map(|items| items.len())
                .unwrap_or(0),
            "inventory_alert_count": response
                .get("inventory_alerts")
                .and_then(serde_json::Value::as_array)
                .map(|items| items.len())
                .unwrap_or(0)
        }))?;
        let created_at = now_unix_ts();
        let normalized_label = {
            let trimmed = baseline_label.trim();
            if trimmed.is_empty() {
                format!("BASELINE-{trace_id}")
            } else {
                trimmed.to_string()
            }
        };

        self.conn.execute(
            r#"
            INSERT INTO match_baselines
              (trace_id, project_id, baseline_label, decision, rule_package_version, summary_json, created_at)
            VALUES
              (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(trace_id) DO UPDATE SET
              baseline_label = excluded.baseline_label,
              decision = excluded.decision,
              rule_package_version = excluded.rule_package_version,
              summary_json = excluded.summary_json,
              created_at = excluded.created_at
            "#,
            params![
                report.trace_id,
                report.project_id,
                normalized_label,
                report.decision,
                report.rule_package_version,
                summary_json,
                created_at
            ],
        )?;

        Ok(MatchBaselineRecord {
            trace_id: report.trace_id,
            project_id: report.project_id,
            baseline_label: normalized_label,
            decision: report.decision,
            rule_package_version: report.rule_package_version,
            summary_json,
            created_at,
        })
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

    pub fn list_audit_logs(
        &self,
        project_id: Option<&str>,
        limit: usize,
    ) -> Result<Vec<AuditLogRecord>, StoreError> {
        let rows = if let Some(project_id) = project_id {
            let mut stmt = self.conn.prepare(
                r#"
                SELECT a.trace_id, a.action, a.result, a.payload_json, a.created_at
                FROM audit_logs a
                INNER JOIN match_reports m ON m.trace_id = a.trace_id
                WHERE m.project_id = ?1
                ORDER BY a.created_at DESC
                LIMIT ?2
                "#,
            )?;
            stmt.query_map(params![project_id, limit as i64], |row| {
                Ok(AuditLogRecord {
                    trace_id: row.get(0)?,
                    action: row.get(1)?,
                    result: row.get(2)?,
                    payload_json: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?
        } else {
            let mut stmt = self.conn.prepare(
                r#"
                SELECT trace_id, action, result, payload_json, created_at
                FROM audit_logs
                ORDER BY created_at DESC
                LIMIT ?1
                "#,
            )?;
            stmt.query_map(params![limit as i64], |row| {
                Ok(AuditLogRecord {
                    trace_id: row.get(0)?,
                    action: row.get(1)?,
                    result: row.get(2)?,
                    payload_json: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?
        };

        Ok(rows)
    }

    pub fn list_audit_logs_by_trace(
        &self,
        trace_id: &str,
        limit: usize,
    ) -> Result<Vec<AuditLogRecord>, StoreError> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT trace_id, action, result, payload_json, created_at
            FROM audit_logs
            WHERE trace_id = ?1
            ORDER BY created_at DESC
            LIMIT ?2
            "#,
        )?;

        let rows = stmt
            .query_map(params![trace_id, limit as i64], |row| {
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

    pub fn list_match_baselines(
        &self,
        project_id: &str,
        limit: usize,
    ) -> Result<Vec<MatchBaselineRecord>, StoreError> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT trace_id, project_id, baseline_label, decision, rule_package_version, summary_json, created_at
            FROM match_baselines
            WHERE project_id = ?1
            ORDER BY created_at DESC
            LIMIT ?2
            "#,
        )?;

        let rows = stmt
            .query_map(params![project_id, limit as i64], |row| {
                Ok(MatchBaselineRecord {
                    trace_id: row.get(0)?,
                    project_id: row.get(1)?,
                    baseline_label: row.get(2)?,
                    decision: row.get(3)?,
                    rule_package_version: row.get(4)?,
                    summary_json: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(rows)
    }

    pub fn get_match_baseline(
        &self,
        trace_id: &str,
    ) -> Result<Option<MatchBaselineRecord>, StoreError> {
        let row = self
            .conn
            .query_row(
                r#"
                SELECT trace_id, project_id, baseline_label, decision, rule_package_version, summary_json, created_at
                FROM match_baselines
                WHERE trace_id = ?1
                "#,
                params![trace_id],
                |row| {
                    Ok(MatchBaselineRecord {
                        trace_id: row.get(0)?,
                        project_id: row.get(1)?,
                        baseline_label: row.get(2)?,
                        decision: row.get(3)?,
                        rule_package_version: row.get(4)?,
                        summary_json: row.get(5)?,
                        created_at: row.get(6)?,
                    })
                },
            )
            .optional()?;

        Ok(row)
    }

    pub fn summarize_master_data_changes_since(
        &self,
        project_id: &str,
        since_ts: i64,
    ) -> Result<MasterDataChangeSummary, StoreError> {
        let (seam_changes, seam_latest) =
            self.count_updated_rows_since("weld_seams", project_id, since_ts)?;
        let (pqr_changes, pqr_latest) =
            self.count_updated_rows_since("pqr_profiles", project_id, since_ts)?;
        let (welder_changes, welder_latest) =
            self.count_updated_rows_since("welder_profiles", project_id, since_ts)?;
        let (batch_changes, batch_latest) =
            self.count_updated_rows_since("consumable_batches", project_id, since_ts)?;

        Ok(MasterDataChangeSummary {
            seam_changes: seam_changes as usize,
            pqr_changes: pqr_changes as usize,
            welder_changes: welder_changes as usize,
            batch_changes: batch_changes as usize,
            latest_change_at: seam_latest
                .max(pqr_latest)
                .max(welder_latest)
                .max(batch_latest),
        })
    }

    pub fn list_master_data_change_items_since(
        &self,
        project_id: &str,
        since_ts: i64,
        limit_per_scope: usize,
    ) -> Result<Vec<MasterDataChangeItem>, StoreError> {
        let mut changes = Vec::new();
        changes.extend(self.list_weld_seam_change_items_since(
            project_id,
            since_ts,
            limit_per_scope,
        )?);
        changes.extend(self.list_pqr_change_items_since(project_id, since_ts, limit_per_scope)?);
        changes.extend(self.list_welder_change_items_since(
            project_id,
            since_ts,
            limit_per_scope,
        )?);
        changes.extend(self.list_consumable_batch_change_items_since(
            project_id,
            since_ts,
            limit_per_scope,
        )?);
        changes.sort_by(|left, right| {
            right
                .updated_at
                .cmp(&left.updated_at)
                .then_with(|| left.scope.cmp(&right.scope))
                .then_with(|| left.item_id.cmp(&right.item_id))
        });
        Ok(changes)
    }

    fn count_updated_rows_since(
        &self,
        table_name: &str,
        project_id: &str,
        since_ts: i64,
    ) -> Result<(i64, i64), StoreError> {
        let sql = format!(
            "SELECT COUNT(*), COALESCE(MAX(updated_at), 0) FROM {table_name} WHERE project_id = ?1 AND updated_at > ?2"
        );
        let result = self
            .conn
            .query_row(&sql, params![project_id, since_ts], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
            })?;
        Ok(result)
    }

    fn list_pqr_change_items_since(
        &self,
        project_id: &str,
        since_ts: i64,
        limit: usize,
    ) -> Result<Vec<MasterDataChangeItem>, StoreError> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT pqr_json, updated_at
            FROM pqr_profiles
            WHERE project_id = ?1 AND updated_at > ?2
            ORDER BY updated_at DESC
            LIMIT ?3
            "#,
        )?;
        let rows = stmt
            .query_map(params![project_id, since_ts, limit as i64], |row| {
                let pqr_json: String = row.get(0)?;
                let pqr: PqrCandidate = serde_json::from_str(&pqr_json).map_err(map_json_err)?;
                let positions = if pqr.position_scope.is_empty() {
                    "-".to_string()
                } else {
                    pqr.position_scope.join("/")
                };
                Ok(MasterDataChangeItem {
                    scope: "pqr".to_string(),
                    item_id: pqr.pqr_id.clone(),
                    updated_at: row.get(1)?,
                    summary: format!(
                        "{} / {}-{}mm / {}",
                        pqr.process_code,
                        format_mm(pqr.thickness_min_mm),
                        format_mm(pqr.thickness_max_mm),
                        positions
                    ),
                    impact_hint: "候选 PQR 覆盖范围变化".to_string(),
                    payload_json: pqr_json,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    fn list_welder_change_items_since(
        &self,
        project_id: &str,
        since_ts: i64,
        limit: usize,
    ) -> Result<Vec<MasterDataChangeItem>, StoreError> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT welder_json, updated_at
            FROM welder_profiles
            WHERE project_id = ?1 AND updated_at > ?2
            ORDER BY updated_at DESC
            LIMIT ?3
            "#,
        )?;
        let rows = stmt
            .query_map(params![project_id, since_ts, limit as i64], |row| {
                let welder_json: String = row.get(0)?;
                let welder: WelderCandidate =
                    serde_json::from_str(&welder_json).map_err(map_json_err)?;
                let positions = if welder.position_scope.is_empty() {
                    "-".to_string()
                } else {
                    welder.position_scope.join("/")
                };
                Ok(MasterDataChangeItem {
                    scope: "welder".to_string(),
                    item_id: welder.welder_id.clone(),
                    updated_at: row.get(1)?,
                    summary: format!(
                        "{} / {} / 证书 {}",
                        welder.process_code, positions, welder.cert_no
                    ),
                    impact_hint: "候选焊工资格范围变化".to_string(),
                    payload_json: welder_json,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    fn list_consumable_batch_change_items_since(
        &self,
        project_id: &str,
        since_ts: i64,
        limit: usize,
    ) -> Result<Vec<MasterDataChangeItem>, StoreError> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT batch_json, updated_at
            FROM consumable_batches
            WHERE project_id = ?1 AND updated_at > ?2
            ORDER BY updated_at DESC
            LIMIT ?3
            "#,
        )?;
        let rows = stmt
            .query_map(params![project_id, since_ts, limit as i64], |row| {
                let batch_json: String = row.get(0)?;
                let batch: ConsumableBatch =
                    serde_json::from_str(&batch_json).map_err(map_json_err)?;
                Ok(MasterDataChangeItem {
                    scope: "batch".to_string(),
                    item_id: batch.batch_no.clone(),
                    updated_at: row.get(1)?,
                    summary: format!(
                        "{} / 可用 {} / 安全 {}",
                        batch.material_code,
                        format_qty(batch.qty_available),
                        format_qty(batch.safety_stock)
                    ),
                    impact_hint: "库存批次可用量或状态变化".to_string(),
                    payload_json: batch_json,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    fn list_weld_seam_change_items_since(
        &self,
        project_id: &str,
        since_ts: i64,
        limit: usize,
    ) -> Result<Vec<MasterDataChangeItem>, StoreError> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT seam_json, updated_at
            FROM weld_seams
            WHERE project_id = ?1 AND updated_at > ?2
            ORDER BY updated_at DESC
            LIMIT ?3
            "#,
        )?;
        let rows = stmt
            .query_map(params![project_id, since_ts, limit as i64], |row| {
                let seam_json: String = row.get(0)?;
                let seam: WeldSeam = serde_json::from_str(&seam_json).map_err(map_json_err)?;
                Ok(MasterDataChangeItem {
                    scope: "seam".to_string(),
                    item_id: seam.weld_id.clone(),
                    updated_at: row.get(1)?,
                    summary: format!(
                        "{} / {}-{} / {}+{}mm",
                        seam.position_code,
                        seam.material_group_a,
                        seam.material_group_b,
                        format_mm(seam.thickness_a_mm),
                        format_mm(seam.thickness_b_mm)
                    ),
                    impact_hint: "焊缝输入条件变化".to_string(),
                    payload_json: seam_json,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn upsert_pqr_profile(
        &self,
        project_id: &str,
        pqr: &PqrCandidate,
    ) -> Result<(), StoreError> {
        let updated_at = now_unix_ts();
        let pqr_json = serde_json::to_string(pqr)?;
        self.conn.execute(
            r#"
            INSERT INTO pqr_profiles (project_id, pqr_id, pqr_json, updated_at)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(project_id, pqr_id) DO UPDATE SET
              pqr_json = excluded.pqr_json,
              updated_at = excluded.updated_at
            "#,
            params![project_id, pqr.pqr_id, pqr_json, updated_at],
        )?;
        Ok(())
    }

    pub fn delete_pqr_profile(&self, project_id: &str, pqr_id: &str) -> Result<bool, StoreError> {
        let affected = self.conn.execute(
            r#"
            DELETE FROM pqr_profiles
            WHERE project_id = ?1 AND pqr_id = ?2
            "#,
            params![project_id, pqr_id],
        )?;
        Ok(affected > 0)
    }

    pub fn list_pqr_profiles(
        &self,
        project_id: &str,
        limit: usize,
    ) -> Result<Vec<PqrProfileRecord>, StoreError> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT project_id, pqr_json, updated_at
            FROM pqr_profiles
            WHERE project_id = ?1
            ORDER BY updated_at DESC
            LIMIT ?2
            "#,
        )?;

        let rows = stmt
            .query_map(params![project_id, limit as i64], |row| {
                let pqr_json: String = row.get(1)?;
                let pqr: PqrCandidate = serde_json::from_str(&pqr_json).map_err(map_json_err)?;
                Ok(PqrProfileRecord {
                    project_id: row.get(0)?,
                    pqr,
                    updated_at: row.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(rows)
    }

    pub fn upsert_welder_profile(
        &self,
        project_id: &str,
        welder: &WelderCandidate,
    ) -> Result<(), StoreError> {
        let updated_at = now_unix_ts();
        let welder_json = serde_json::to_string(welder)?;
        self.conn.execute(
            r#"
            INSERT INTO welder_profiles (project_id, welder_id, welder_json, updated_at)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(project_id, welder_id) DO UPDATE SET
              welder_json = excluded.welder_json,
              updated_at = excluded.updated_at
            "#,
            params![project_id, welder.welder_id, welder_json, updated_at],
        )?;
        Ok(())
    }

    pub fn delete_welder_profile(
        &self,
        project_id: &str,
        welder_id: &str,
    ) -> Result<bool, StoreError> {
        let affected = self.conn.execute(
            r#"
            DELETE FROM welder_profiles
            WHERE project_id = ?1 AND welder_id = ?2
            "#,
            params![project_id, welder_id],
        )?;
        Ok(affected > 0)
    }

    pub fn list_welder_profiles(
        &self,
        project_id: &str,
        limit: usize,
    ) -> Result<Vec<WelderProfileRecord>, StoreError> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT project_id, welder_json, updated_at
            FROM welder_profiles
            WHERE project_id = ?1
            ORDER BY updated_at DESC
            LIMIT ?2
            "#,
        )?;

        let rows = stmt
            .query_map(params![project_id, limit as i64], |row| {
                let welder_json: String = row.get(1)?;
                let welder: WelderCandidate =
                    serde_json::from_str(&welder_json).map_err(map_json_err)?;
                Ok(WelderProfileRecord {
                    project_id: row.get(0)?,
                    welder,
                    updated_at: row.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(rows)
    }

    pub fn upsert_consumable_batch(
        &self,
        project_id: &str,
        batch: &ConsumableBatch,
    ) -> Result<(), StoreError> {
        let updated_at = now_unix_ts();
        let batch_json = serde_json::to_string(batch)?;
        self.conn.execute(
            r#"
            INSERT INTO consumable_batches (project_id, batch_no, batch_json, updated_at)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(project_id, batch_no) DO UPDATE SET
              batch_json = excluded.batch_json,
              updated_at = excluded.updated_at
            "#,
            params![project_id, batch.batch_no, batch_json, updated_at],
        )?;
        Ok(())
    }

    pub fn delete_consumable_batch(
        &self,
        project_id: &str,
        batch_no: &str,
    ) -> Result<bool, StoreError> {
        let affected = self.conn.execute(
            r#"
            DELETE FROM consumable_batches
            WHERE project_id = ?1 AND batch_no = ?2
            "#,
            params![project_id, batch_no],
        )?;
        Ok(affected > 0)
    }

    pub fn list_consumable_batches(
        &self,
        project_id: &str,
        limit: usize,
    ) -> Result<Vec<ConsumableBatchRecord>, StoreError> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT project_id, batch_json, updated_at
            FROM consumable_batches
            WHERE project_id = ?1
            ORDER BY updated_at DESC
            LIMIT ?2
            "#,
        )?;

        let rows = stmt
            .query_map(params![project_id, limit as i64], |row| {
                let batch_json: String = row.get(1)?;
                let batch: ConsumableBatch =
                    serde_json::from_str(&batch_json).map_err(map_json_err)?;
                Ok(ConsumableBatchRecord {
                    project_id: row.get(0)?,
                    batch,
                    updated_at: row.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(rows)
    }

    pub fn upsert_weld_seam(&self, project_id: &str, seam: &WeldSeam) -> Result<(), StoreError> {
        let updated_at = now_unix_ts();
        let seam_json = serde_json::to_string(seam)?;
        self.conn.execute(
            r#"
            INSERT INTO weld_seams (project_id, weld_id, seam_json, updated_at)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(project_id, weld_id) DO UPDATE SET
              seam_json = excluded.seam_json,
              updated_at = excluded.updated_at
            "#,
            params![project_id, seam.weld_id, seam_json, updated_at],
        )?;
        Ok(())
    }

    pub fn delete_weld_seam(&self, project_id: &str, weld_id: &str) -> Result<bool, StoreError> {
        let affected = self.conn.execute(
            r#"
            DELETE FROM weld_seams
            WHERE project_id = ?1 AND weld_id = ?2
            "#,
            params![project_id, weld_id],
        )?;
        Ok(affected > 0)
    }

    pub fn list_weld_seams(
        &self,
        project_id: &str,
        limit: usize,
    ) -> Result<Vec<WeldSeamRecord>, StoreError> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT project_id, seam_json, updated_at
            FROM weld_seams
            WHERE project_id = ?1
            ORDER BY updated_at DESC
            LIMIT ?2
            "#,
        )?;

        let rows = stmt
            .query_map(params![project_id, limit as i64], |row| {
                let seam_json: String = row.get(1)?;
                let seam: WeldSeam = serde_json::from_str(&seam_json).map_err(map_json_err)?;
                Ok(WeldSeamRecord {
                    project_id: row.get(0)?,
                    seam,
                    updated_at: row.get(2)?,
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
              company_name TEXT NOT NULL DEFAULT '',
              drawing_type TEXT NOT NULL DEFAULT '',
              standard_code TEXT NOT NULL,
              archived_at INTEGER,
              updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);

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

            CREATE TABLE IF NOT EXISTS match_baselines (
              trace_id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL,
              baseline_label TEXT NOT NULL,
              decision TEXT NOT NULL,
              rule_package_version TEXT NOT NULL,
              summary_json TEXT NOT NULL,
              created_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_match_baselines_project_id ON match_baselines(project_id);
            CREATE INDEX IF NOT EXISTS idx_match_baselines_created_at ON match_baselines(created_at DESC);

            CREATE TABLE IF NOT EXISTS pqr_profiles (
              project_id TEXT NOT NULL,
              pqr_id TEXT NOT NULL,
              pqr_json TEXT NOT NULL,
              updated_at INTEGER NOT NULL,
              PRIMARY KEY(project_id, pqr_id)
            );

            CREATE INDEX IF NOT EXISTS idx_pqr_profiles_project_id ON pqr_profiles(project_id);
            CREATE INDEX IF NOT EXISTS idx_pqr_profiles_updated_at ON pqr_profiles(updated_at DESC);

            CREATE TABLE IF NOT EXISTS welder_profiles (
              project_id TEXT NOT NULL,
              welder_id TEXT NOT NULL,
              welder_json TEXT NOT NULL,
              updated_at INTEGER NOT NULL,
              PRIMARY KEY(project_id, welder_id)
            );

            CREATE INDEX IF NOT EXISTS idx_welder_profiles_project_id ON welder_profiles(project_id);
            CREATE INDEX IF NOT EXISTS idx_welder_profiles_updated_at ON welder_profiles(updated_at DESC);

            CREATE TABLE IF NOT EXISTS consumable_batches (
              project_id TEXT NOT NULL,
              batch_no TEXT NOT NULL,
              batch_json TEXT NOT NULL,
              updated_at INTEGER NOT NULL,
              PRIMARY KEY(project_id, batch_no)
            );

            CREATE INDEX IF NOT EXISTS idx_consumable_batches_project_id ON consumable_batches(project_id);
            CREATE INDEX IF NOT EXISTS idx_consumable_batches_updated_at ON consumable_batches(updated_at DESC);

            CREATE TABLE IF NOT EXISTS weld_seams (
              project_id TEXT NOT NULL,
              weld_id TEXT NOT NULL,
              seam_json TEXT NOT NULL,
              updated_at INTEGER NOT NULL,
              PRIMARY KEY(project_id, weld_id)
            );

            CREATE INDEX IF NOT EXISTS idx_weld_seams_project_id ON weld_seams(project_id);
            CREATE INDEX IF NOT EXISTS idx_weld_seams_updated_at ON weld_seams(updated_at DESC);
            "#,
        )?;
        self.ensure_column("projects", "company_name", "TEXT NOT NULL DEFAULT ''")?;
        self.ensure_column("projects", "drawing_type", "TEXT NOT NULL DEFAULT ''")?;
        self.ensure_column("projects", "archived_at", "INTEGER")?;
        self.conn.execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_projects_archived_at ON projects(archived_at);",
        )?;
        Ok(())
    }
}

impl Store {
    fn ensure_column(&self, table_name: &str, column_name: &str, spec: &str) -> Result<(), StoreError> {
        let pragma = format!("PRAGMA table_info({table_name})");
        let mut stmt = self.conn.prepare(&pragma)?;
        let existing = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<Result<Vec<_>, _>>()?;
        if existing.iter().any(|name| name == column_name) {
            return Ok(());
        }
        let sql = format!("ALTER TABLE {table_name} ADD COLUMN {column_name} {spec}");
        self.conn.execute_batch(&sql)?;
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

fn format_mm(value: f64) -> String {
    format_number(value)
}

fn format_qty(value: f64) -> String {
    format_number(value)
}

fn format_number(value: f64) -> String {
    if (value.fract()).abs() < f64::EPSILON {
        format!("{value:.0}")
    } else {
        let text = format!("{value:.2}");
        text.trim_end_matches('0').trim_end_matches('.').to_string()
    }
}

fn map_json_err(err: serde_json::Error) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(err))
}

#[cfg(test)]
mod tests {
    use super::*;
    use contracts::matching::{
        Decision, InventoryPolicy, MatchRequest, MatchResponse, PqrCandidate, RequiredConsumable,
        ReviewStatus, RulePackageRef, StandardCode, WeldSeam, WelderCandidate,
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

    fn sample_pqr() -> PqrCandidate {
        PqrCandidate {
            pqr_id: "PQR-101".to_string(),
            standard_code: StandardCode::AsmeIx,
            process_code: "GTAW".to_string(),
            material_group_scope: vec!["P-No.1".to_string()],
            thickness_min_mm: 3.0,
            thickness_max_mm: 40.0,
            position_scope: vec!["2G".to_string()],
            dissimilar_support: true,
            thickness_mismatch_support: true,
            thickness_delta_max_mm: 12.0,
            valid_to: "2028-12-31".to_string(),
            status: "active".to_string(),
        }
    }

    fn sample_welder() -> WelderCandidate {
        WelderCandidate {
            welder_id: "WELDER-101".to_string(),
            cert_no: "CERT-9001".to_string(),
            standard_code: StandardCode::AsmeIx,
            process_code: "GTAW".to_string(),
            material_group_scope: vec!["P-No.1".to_string()],
            position_scope: vec!["2G".to_string(), "5G".to_string()],
            dissimilar_qualified: true,
            thickness_mismatch_qualified: true,
            thickness_delta_max_mm: 10.0,
            expiry_date: "2028-12-31".to_string(),
            status: "active".to_string(),
        }
    }

    fn sample_batch() -> contracts::matching::ConsumableBatch {
        contracts::matching::ConsumableBatch {
            batch_no: "BATCH-101".to_string(),
            material_code: "ER70S-6".to_string(),
            spec_standard: "AWS A5.18".to_string(),
            qty_available: 20.0,
            safety_stock: 5.0,
            expiry_date: "2028-12-31".to_string(),
            status: "active".to_string(),
        }
    }

    fn sample_seam() -> WeldSeam {
        WeldSeam {
            weld_id: "WELD-101".to_string(),
            material_group_a: "P-No.1".to_string(),
            material_group_b: "P-No.8".to_string(),
            thickness_a_mm: 16.0,
            thickness_b_mm: 12.0,
            position_code: "5G".to_string(),
            process_hint: "GTAW".to_string(),
            review_status: ReviewStatus::Confirmed,
        }
    }

    #[test]
    fn can_upsert_and_read_project() {
        let store = Store::open_in_memory().expect("open in-memory db");
        store
            .upsert_project(
                "PRJ-001",
                "Test Project",
                "Laimiu",
                "PDF+DWG",
                &StandardCode::AsmeIx,
            )
            .expect("upsert project");

        let got = store
            .get_project("PRJ-001")
            .expect("query project")
            .expect("project exists");

        assert_eq!(got.project_id, "PRJ-001");
        assert_eq!(got.project_name, "Test Project");
        assert_eq!(got.company_name, "Laimiu");
        assert_eq!(got.drawing_type, "PDF+DWG");
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
            .insert_audit_log(
                &res.trace_id,
                "run_match",
                "partial",
                "{\"reason\":\"warn inventory\"}",
            )
            .expect("insert audit log");

        let reports = store.list_match_reports(None, 10).expect("list reports");
        let logs = store.list_audit_logs(None, 10).expect("list logs");

        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0].trace_id, "TRC-001");
        assert_eq!(reports[0].decision, "partial");
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].action, "run_match");
    }

    #[test]
    fn can_list_and_archive_projects() {
        let store = Store::open_in_memory().expect("open in-memory db");
        store
            .upsert_project(
                "PRJ-001",
                "Project A",
                "Laimiu",
                "PDF",
                &StandardCode::AsmeIx,
            )
            .expect("upsert first project");
        store
            .upsert_project(
                "PRJ-002",
                "Project B",
                "Laimiu",
                "DWG",
                &StandardCode::CnGb,
            )
            .expect("upsert second project");

        let all_projects = store.list_projects(10, true).expect("list all projects");
        assert_eq!(all_projects.len(), 2);

        assert!(store
            .archive_project("PRJ-001", true)
            .expect("archive project should succeed"));

        let active_projects = store
            .list_projects(10, false)
            .expect("list active projects");
        assert_eq!(active_projects.len(), 1);
        assert_eq!(active_projects[0].project_id, "PRJ-002");

        let archived_project = store
            .get_project("PRJ-001")
            .expect("query archived project")
            .expect("archived project exists");
        assert!(archived_project.archived_at.is_some());
    }

    #[test]
    fn can_freeze_and_list_match_baselines() {
        let store = Store::open_in_memory().expect("open in-memory db");
        let req = sample_request();
        let res = sample_response();

        store
            .insert_match_report(&req, &res)
            .expect("insert match report");

        let baseline = store
            .freeze_match_baseline("TRC-001", "BASELINE-001")
            .expect("freeze baseline");

        assert_eq!(baseline.trace_id, "TRC-001");
        assert_eq!(baseline.project_id, "PRJ-001");
        assert_eq!(baseline.baseline_label, "BASELINE-001");

        let rows = store
            .list_match_baselines("PRJ-001", 10)
            .expect("list match baselines");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].trace_id, "TRC-001");

        let summary: serde_json::Value =
            serde_json::from_str(&rows[0].summary_json).expect("summary json should parse");
        assert_eq!(summary["hard_conflict_count"], 0);
        assert_eq!(summary["inventory_alert_count"], 0);
    }

    #[test]
    fn can_detect_master_data_changes_after_baseline() {
        let store = Store::open_in_memory().expect("open in-memory db");
        let req = sample_request();
        let res = sample_response();
        let project_id = "PRJ-001";

        store
            .insert_match_report(&req, &res)
            .expect("insert match report");
        let baseline = store
            .freeze_match_baseline("TRC-001", "BASELINE-001")
            .expect("freeze baseline");

        store
            .upsert_pqr_profile(project_id, &sample_pqr())
            .expect("upsert pqr");
        store
            .upsert_welder_profile(project_id, &sample_welder())
            .expect("upsert welder");

        let later_ts = baseline.created_at + 10;
        store
            .conn
            .execute(
                "UPDATE pqr_profiles SET updated_at = ?1 WHERE project_id = ?2",
                params![later_ts, project_id],
            )
            .expect("update pqr updated_at");
        store
            .conn
            .execute(
                "UPDATE welder_profiles SET updated_at = ?1 WHERE project_id = ?2",
                params![later_ts + 1, project_id],
            )
            .expect("update welder updated_at");

        let change_summary = store
            .summarize_master_data_changes_since(project_id, baseline.created_at)
            .expect("summarize master data changes");

        assert_eq!(change_summary.seam_changes, 0);
        assert_eq!(change_summary.pqr_changes, 1);
        assert_eq!(change_summary.welder_changes, 1);
        assert_eq!(change_summary.batch_changes, 0);
        assert_eq!(change_summary.latest_change_at, later_ts + 1);
    }

    #[test]
    fn can_list_master_data_change_items_after_baseline() {
        let store = Store::open_in_memory().expect("open in-memory db");
        let req = sample_request();
        let res = sample_response();
        let project_id = "PRJ-001";

        store
            .insert_match_report(&req, &res)
            .expect("insert match report");
        let baseline = store
            .freeze_match_baseline("TRC-001", "BASELINE-001")
            .expect("freeze baseline");

        store
            .upsert_weld_seam(project_id, &sample_seam())
            .expect("upsert seam");
        store
            .upsert_pqr_profile(project_id, &sample_pqr())
            .expect("upsert pqr");
        store
            .upsert_welder_profile(project_id, &sample_welder())
            .expect("upsert welder");
        store
            .upsert_consumable_batch(project_id, &sample_batch())
            .expect("upsert batch");

        let updated_ts = baseline.created_at + 20;
        store
            .conn
            .execute(
                "UPDATE weld_seams SET updated_at = ?1 WHERE project_id = ?2",
                params![updated_ts, project_id],
            )
            .expect("update seam updated_at");
        store
            .conn
            .execute(
                "UPDATE pqr_profiles SET updated_at = ?1 WHERE project_id = ?2",
                params![updated_ts + 1, project_id],
            )
            .expect("update pqr updated_at");
        store
            .conn
            .execute(
                "UPDATE welder_profiles SET updated_at = ?1 WHERE project_id = ?2",
                params![updated_ts + 2, project_id],
            )
            .expect("update welder updated_at");
        store
            .conn
            .execute(
                "UPDATE consumable_batches SET updated_at = ?1 WHERE project_id = ?2",
                params![updated_ts + 3, project_id],
            )
            .expect("update batch updated_at");

        let items = store
            .list_master_data_change_items_since(project_id, baseline.created_at, 3)
            .expect("list change items");

        assert_eq!(items.len(), 4);
        assert_eq!(items[0].scope, "batch");
        assert_eq!(items[0].item_id, "BATCH-101");
        assert_eq!(items[1].scope, "welder");
        assert_eq!(items[2].scope, "pqr");
        assert_eq!(items[3].scope, "seam");
        assert!(items.iter().any(|item| item.summary.contains("ER70S-6")));
        assert!(items
            .iter()
            .any(|item| item.impact_hint.contains("焊缝输入条件")));
    }

    #[test]
    fn can_upsert_list_and_delete_master_data_records() {
        let store = Store::open_in_memory().expect("open in-memory db");
        let project_id = "PRJ-MASTER-001";

        store
            .upsert_pqr_profile(project_id, &sample_pqr())
            .expect("upsert pqr");
        store
            .upsert_welder_profile(project_id, &sample_welder())
            .expect("upsert welder");
        store
            .upsert_consumable_batch(project_id, &sample_batch())
            .expect("upsert batch");
        store
            .upsert_weld_seam(project_id, &sample_seam())
            .expect("upsert seam");

        let pqrs = store.list_pqr_profiles(project_id, 10).expect("list pqr");
        let welders = store
            .list_welder_profiles(project_id, 10)
            .expect("list welder");
        let batches = store
            .list_consumable_batches(project_id, 10)
            .expect("list batches");
        let seams = store.list_weld_seams(project_id, 10).expect("list seams");

        assert_eq!(pqrs.len(), 1);
        assert_eq!(pqrs[0].pqr.pqr_id, "PQR-101");
        assert_eq!(welders.len(), 1);
        assert_eq!(welders[0].welder.welder_id, "WELDER-101");
        assert_eq!(batches.len(), 1);
        assert_eq!(batches[0].batch.batch_no, "BATCH-101");
        assert_eq!(seams.len(), 1);
        assert_eq!(seams[0].seam.weld_id, "WELD-101");

        assert!(store
            .delete_pqr_profile(project_id, "PQR-101")
            .expect("delete pqr"));
        assert!(store
            .delete_welder_profile(project_id, "WELDER-101")
            .expect("delete welder"));
        assert!(store
            .delete_consumable_batch(project_id, "BATCH-101")
            .expect("delete batch"));
        assert!(store
            .delete_weld_seam(project_id, "WELD-101")
            .expect("delete seam"));

        assert_eq!(
            store
                .list_pqr_profiles(project_id, 10)
                .expect("list pqr after delete")
                .len(),
            0
        );
        assert_eq!(
            store
                .list_welder_profiles(project_id, 10)
                .expect("list welder after delete")
                .len(),
            0
        );
        assert_eq!(
            store
                .list_consumable_batches(project_id, 10)
                .expect("list batch after delete")
                .len(),
            0
        );
        assert_eq!(
            store
                .list_weld_seams(project_id, 10)
                .expect("list seam after delete")
                .len(),
            0
        );
    }
}
