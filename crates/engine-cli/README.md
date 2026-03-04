# engine-cli

最小命令行联调工具：

- 生成一份样例 `MatchRequest`
- 调用 `core-engine::run_match`
- 将结果写入 `core-store` SQLite

## 使用

```bash
cargo run -p engine-cli -- weldlayer.db
```

若不传参数，默认数据库文件是当前目录下的 `weldlayer.db`。
