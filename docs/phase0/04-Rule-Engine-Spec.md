# 04-Rule-Engine-Spec

## 1. 目标

- 规则引擎按标准体系执行匹配与冲突解释。
- 规则包支持热插拔，便于后续扩展。
- 结果可审计、可复现、可追溯。

## 2. v1 范围

- 支持 `CN_GB` 与 `ASME_IX`。
- 用户手动选择标准后匹配。
- 输出推荐、备选、冲突和追踪信息。

## 3. 规则包目录规范

```text
rules/
  CN_GB/
    manifest.json
    clauses.json
    ruleset.json
  ASME_IX/
    manifest.json
    clauses.json
    ruleset.json
```

## 4. 规则包清单字段（manifest）

- `standard_code`
- `version`
- `engine_api_version`
- `effective_from`
- `compatible_data_dict`
- `checksum`

## 5. 输入输出约定

输入最小结构：

- `project_id`
- `standard_code`
- `weld_seams[]`
- `pqr_candidates[]`
- `welder_candidates[]`
- `options.strict_mode`
- `options.top_k`

输出最小结构：

- `decision`（`match/partial/fail`）
- `recommended`（`pqr_id/welder_id/score`）
- `alternatives[]`
- `hard_conflicts[]`
- `soft_score_breakdown[]`
- `trace_id`
- `rule_package.version`

## 6. 执行顺序

1. Schema 与字段校验
2. 硬约束过滤
3. 软评分排序
4. 冲突解释生成
5. 输出封装与审计记录

## 7. 热插拔协议

- 启动扫描规则包并校验兼容性。
- 新包加载流程：`load -> validate -> activate`。
- 激活失败自动回滚到上一个可用版本。
- 同一标准仅允许一个 active 版本。

## 8. 错误码（最小集）

- `RULE_NOT_FOUND`
- `RULE_INCOMPATIBLE`
- `INPUT_INVALID`
- `NO_ELIGIBLE_PQR`
- `NO_ELIGIBLE_WELDER`
- `ENGINE_INTERNAL_ERROR`

## 9. 审计要求

- 每次匹配记录 `trace_id`、规则包版本、输入快照哈希、输出摘要。
- 相同输入 + 相同规则包版本必须得到一致结论。
