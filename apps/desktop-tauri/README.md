# desktop-tauri

Tauri 桌面壳目录。

当前已补充 `src-tauri` Rust 侧命令骨架，用于连接：

- `run_match` -> `app-service::run_match_and_persist`
- `run_parse` -> `app-service::run_parse_via_sidecar`

前端 UI 仍待初始化（React + TypeScript）。

可先验证 Rust 侧：

```bash
cargo check --manifest-path apps/desktop-tauri/src-tauri/Cargo.toml
```

## 下一步

1. 执行 `npm create tauri-app@latest` 初始化前端壳
2. 将前端调用接到 `src-tauri` command
3. 联调 `match/parse` 两条端到端链路
