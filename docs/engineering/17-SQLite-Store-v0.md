# 17-SQLite-Store-v0

## 1. 目标

提供本地 SQLite 存储层 v0，实现项目、匹配报告、审计日志的最小闭环持久化。

## 2. 代码位置

- `crates/core-store/src/lib.rs`

## 3. 表结构（v0）

### projects

- `project_id` (PK)
- `project_name`
- `standard_code` (JSON enum)
- `updated_at` (unix ts)

### match_reports

- `trace_id` (PK)
- `project_id`
- `decision`
- `rule_package_version`
- `request_json`
- `response_json`
- `created_at` (unix ts)

### audit_logs

- `id` (PK, auto increment)
- `trace_id`
- `action`
- `result`
- `payload_json`
- `created_at` (unix ts)

## 4. 核心接口

- `Store::open(path)` / `Store::open_in_memory()`
- `Store::upsert_project(...)`
- `Store::get_project(project_id)`
- `Store::insert_match_report(request, response)`
- `Store::list_match_reports(limit)`
- `Store::insert_audit_log(...)`
- `Store::list_audit_logs(limit)`

## 5. 现状说明

- schema 由 `migrate()` 自动创建（非版本化迁移）。
- 报告与审计先以 JSON 原文落库，便于追溯与调试。
- 后续可补：
  - 版本化 migration
  - 主数据（PQR/焊工/焊材）规范化表
  - 索引和归档策略优化
