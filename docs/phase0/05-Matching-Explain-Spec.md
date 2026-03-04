# 05-Matching-Explain-Spec

## 1. 目标

- 定义统一匹配评分与冲突解释。
- 冲突解释需精确到字段和条款。
- 输出可直接用于前端展示与导出摘要。
- 增加“库存可执行性”判断，避免推荐不可落地工艺。

## 2. 判定状态

- `match`：存在合规且库存可执行的 `PQR + 焊工 + 焊材` 组合
- `partial`：规则合规但库存存在风险（warn）或仅一侧合规
- `fail`：无合规候选，或 strict 模式下库存不满足

## 3. 匹配规则

先硬约束后软评分：

1. 硬约束失败直接淘汰。
2. 合规候选进入软评分排序。
3. 对排序结果执行库存可执行性检查（`warn/strict`）。

软评分公式：

`score = sum(weight_i * subscore_i) / sum(weight_i_enabled)`

综合推荐分（v1 默认）：

`final_score = 0.5 * pqr_score + 0.3 * welder_score + 0.2 * consumable_score`

## 4. v1 默认硬约束

- `standard_code`
- `process_code`
- `material_group/material_group_scope`
- `thickness_mm` 与厚度范围
- `position_code` 与位置范围
- 有效期与状态
- 焊材牌号/规格适配性

库存策略约束：

- `warn`：库存问题记为 warning，不阻断推荐
- `strict`：库存不足、批次不符、过期直接 fail

## 5. 解释结构

每条冲突至少包含：

- `entity_type`（`pqr/welder/consumable/inventory`）
- `entity_id`
- `field_key`
- `actual_value`
- `expected_value`
- `rule_id`
- `clause_ref`
- `message`
- `suggestion`
- `evidence`

库存冲突附加字段：

- `required_qty`
- `available_qty`
- `batch_no`
- `expiry_date`

## 6. 文案模板

- 规则错误：字段 `{field}` 的值 `{actual}` 不满足 `{expected}`，依据 `{clause_ref}`。
- 库存不足：焊材 `{material_code}` 需求 `{required_qty}`，可用 `{available_qty}`，建议补料或切换批次。
- 临期预警：焊材批次 `{batch_no}` 将于 `{expiry_date}` 到期，建议优先替换。

## 7. 前端展示建议

- 顶部：结论、推荐组合、综合分、规则包版本、库存可执行状态
- 中部：主推荐 + 备选
- 底部：冲突表（字段/实际/期望/条款/建议）
- 新增库存卡片：可用库存、安全库存、临期批次
- 右侧抽屉：证据与 trace 信息

## 8. 可审计要求

- 每次结果带 `trace_id`。
- 冲突必须包含 `rule_id + clause_ref + evidence`。
- 库存判断需记录检查时间与库存快照 ID。
- 输出绑定规则包版本与模板版本。
