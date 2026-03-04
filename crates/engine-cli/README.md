# engine-cli

最小命令行联调工具：

- 生成一份样例 `MatchRequest`
- 调用 `app-service::run_match_and_persist`
- 由 `app-service` 写入 SQLite

## 使用

```bash
cargo run -p engine-cli -- match weldlayer.db
cargo run -p engine-cli -- parse
```

说明：

- `match`：执行匹配并落库；若不传 `db_path`，默认 `weldlayer.db`
- `parse`：调用 Python sidecar 执行图纸解析占位流程
