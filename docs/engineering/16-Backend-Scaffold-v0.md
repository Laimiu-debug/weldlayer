# 16-Backend-Scaffold-v0

## 1. 目标

建立 v0 工程骨架，优先固定边界与契约，支持后续并行开发：

- Rust 核心匹配引擎
- Python 解析 sidecar
- Tauri 桌面壳接入点

## 2. 目录布局

```text
crates/
  contracts/    # 统一请求/响应模型
  core-engine/  # 匹配与库存策略核心逻辑
sidecar/
  parser-python/ # PDF/DWG 解析 sidecar 占位实现
apps/
  desktop-tauri/ # 桌面壳占位目录
```

## 3. 第一批接口契约

Rust 契约定义：

- `crates/contracts/src/matching.rs`
- `crates/contracts/src/parser.rs`

匹配输入（`MatchRequest`）关键字段：

- `trace_id`
- `standard_code`
- `inventory_policy` (`warn|strict`)
- `weld_seams`
- `pqr_candidates`
- `welder_candidates`
- `required_consumables`
- `consumable_batches`

匹配输出（`MatchResponse`）关键字段：

- `decision` (`match|partial|fail`)
- `recommended`
- `alternatives`
- `hard_conflicts`
- `inventory_alerts`
- `rule_package.version`

解析输入输出：

- 输入：`ParseRequest`
- 输出：`ParseResponse`

## 4. 当前引擎行为（v0）

`core-engine` 已支持：

- 焊缝确认门禁（未确认阻断）
- PQR/焊工基础硬约束过滤
- `warn/strict` 库存策略差异
- 推荐与备选输出

说明：当前是可运行占位逻辑，不是最终规则实现。

## 5. 后续落地顺序

1. 在 `core-engine` 补齐规则包加载（`CN_GB/ASME_IX`）
2. 接入 SQLite（项目、主数据、审计日志）
3. Tauri 初始化并绑定 command
4. 将 Python sidecar 替换为真实 PDF/DWG 解析实现
