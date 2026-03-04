# app-service

应用服务层，封装底层引擎与存储编排：

- `run_match_and_persist`
- `run_parse_via_sidecar`

目标是给桌面壳（Tauri）提供稳定调用入口，避免 UI 层直接耦合 `core-engine/core-store`。
