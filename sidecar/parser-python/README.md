# Parser Sidecar (Python)

这个目录是图纸解析 sidecar 的占位实现，用于和 Rust 主体通过 JSON 协议联调。

## 运行方式

```bash
python parser_sidecar.py < sample_request.json
```

输入：`ParseRequest` JSON  
输出：`ParseResponse` JSON

## 协议来源

Rust 契约定义位于：

- `crates/contracts/src/parser.rs`
