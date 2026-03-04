# 05-Matching-Explain-Spec

## 1. 目标

- 定义统一匹配评分与冲突解释。
- 冲突解释需精确到字段和条款。
- 输出可直接用于前端展示与导出摘要。

## 2. 判定状态

- `match`：存在合规 `PQR + 焊工` 组合
- `partial`：仅一侧合规
- `fail`：无合规候选

## 3. 匹配规则

先硬约束后软评分：

1. 硬约束失败直接淘汰。
2. 合规候选进入软评分排序。

软评分公式：

`score = sum(weight_i * subscore_i) / sum(weight_i_enabled)`

综合推荐分（v1 默认）：

`final_score = 0.6 * pqr_score + 0.4 * welder_score`

## 4. v1 默认硬约束

- `standard_code`
- `process_code`
- `material_group/material_group_scope`
- `thickness_mm` 与厚度范围
- `position_code` 与位置范围
- 有效期与状态

## 5. 解释结构

每条冲突至少包含：

- `entity_type`
- `entity_id`
- `field_key`
- `actual_value`
- `expected_value`
- `rule_id`
- `clause_ref`
- `message`
- `suggestion`
- `evidence`

## 6. 文案模板

- 错误：字段 `{field}` 的值 `{actual}` 不满足 `{expected}`，依据 `{clause_ref}`。
- 警告：字段 `{field}` 存在风险 `{reason}`，建议 `{suggestion}`。

## 7. 前端展示建议

- 顶部：结论、推荐组合、综合分、规则包版本
- 中部：主推荐 + 备选
- 底部：冲突表（字段/实际/期望/条款/建议）
- 右侧抽屉：证据与 trace 信息

## 8. 可审计要求

- 每次结果带 `trace_id`。
- 冲突必须包含 `rule_id + clause_ref + evidence`。
- 输出绑定规则包版本与模板版本。
