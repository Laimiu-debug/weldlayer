# desktop-tauri

Tauri 桌面壳目录（预留）。

当前阶段只约定模块边界，不强制一次性初始化完整前端工程，避免干扰 Rust 核心和协议联调。

## 约定

- 前端 UI：React + TypeScript（后续接入）
- 桌面壳：Tauri 2
- 调用链路：
  - 前端 -> Tauri command -> `core-engine`（Rust）
  - 前端 -> Tauri command -> Python sidecar（图纸解析）

## 下一步建议

1. 初始化 `npm create tauri-app@latest`
2. 将 `crates/core-engine` 通过 path 依赖接入 `src-tauri`
3. 添加 `run_match` 与 `run_parse` 两个 command
