# 19-App-Service-v0

## 1. 目标

增加应用服务层，统一编排核心能力，给桌面壳提供稳定接口。

## 2. 代码位置

- `crates/app-service/src/lib.rs`

## 3. 公开接口

- `run_match_and_persist(db_path, project_name, request)`
  - 调用 `core-engine::run_match`
  - 调用 `core-store` 持久化 `project/match_report/audit_log`
- `run_parse_via_sidecar(config, request)`
  - 以子进程调用 Python sidecar
  - stdin 输入 JSON，stdout 读取 `ParseResponse`

## 4. 价值

- `engine-cli` 与后续 `Tauri command` 复用同一业务编排层
- 降低 UI 层耦合，便于替换底层实现
