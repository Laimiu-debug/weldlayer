# 18-Engine-CLI-v0

## 1. 目标

提供一个最小可执行入口，用于本地验证：

- 契约模型是否可用
- 匹配引擎输出是否可落库
- 审计日志是否可写入

## 2. 代码位置

- `crates/engine-cli/src/main.rs`

## 3. 执行方式

```bash
cargo run -p engine-cli -- match weldlayer.db
cargo run -p engine-cli -- parse
cargo run -p engine-cli -- match weldlayer.db crates/engine-cli/examples/match_request.json
cargo run -p engine-cli -- parse crates/engine-cli/examples/parse_request.json
```

`match` 执行后会：

1. 构造样例 `MatchRequest`
2. 调用 `run_match`
3. 写入 `projects/match_reports/audit_logs`
4. 输出 JSON 摘要到 stdout

`parse` 执行后会：

1. 构造样例 `ParseRequest`
2. 调用 `app-service` 触发 Python sidecar
3. 输出解析摘要到 stdout

## 4. 后续

- 支持更多 CLI 参数（规则包、策略、top_k）
- 支持输出完整响应 JSON 文件
- 增加 `strict` 模式切换参数
