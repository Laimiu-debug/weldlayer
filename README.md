# WeldLayer

WeldLayer 是一个面向焊接工程场景的桌面应用仓库，当前已包含：

- 需求与产品文档：`docs/`
- 静态 UI 原型：`prototype/`
- Rust 后端骨架（workspace）：`crates/`
- 桌面壳占位目录（Tauri 方向）：`apps/desktop-tauri/`
- 解析 sidecar（Python 占位实现）：`sidecar/parser-python/`

## 仓库结构

```text
.
├── apps/
│   └── desktop-tauri/
├── crates/
│   ├── app-service/
│   ├── contracts/
│   ├── core-engine/
│   ├── core-store/
│   └── engine-cli/
├── docs/
├── prototype/
└── sidecar/
    └── parser-python/
```

## 快速开始（后端骨架）

```bash
cargo check
cargo test -p core-engine
cargo test -p core-store
cargo run -p engine-cli -- weldlayer.db
```

## 当前阶段

这是 v0 骨架：重点是模块边界和契约先行，后续再接入真实解析、数据库和桌面 UI。
