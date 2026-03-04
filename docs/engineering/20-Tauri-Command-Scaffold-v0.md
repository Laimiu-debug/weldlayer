# 20-Tauri-Command-Scaffold-v0

## 1. 目标

在 `apps/desktop-tauri/src-tauri` 提供可接前端的 command 骨架。

## 2. 代码位置

- `apps/desktop-tauri/src-tauri/src/main.rs`
- `apps/desktop-tauri/src-tauri/src/commands.rs`

## 3. 已提供命令

- `run_match(db_path, project_name, request_json) -> response_json`
- `run_parse(request_json) -> response_json`

两者都通过 `app-service` 调用底层能力。

## 4. 现状说明

- 当前仅完成 Rust 侧 command 路径。
- 前端 UI 尚未初始化。
- `tauri.conf.json` 已加最小配置占位。
- 已补充最小 `icons/icon.ico`，`cargo check --manifest-path apps/desktop-tauri/src-tauri/Cargo.toml` 可通过。
