# 07-AI-Scope-v1

## 1. AI 职责边界（v1）

仅做两件事：

- 智能匹配推荐（对合规候选排序）
- 冲突解释增强（将规则结果转为工程可读建议）

不做：

- 自动放行
- 覆盖硬约束结论
- 审批签署

## 2. 决策优先级

`规则引擎 > AI 建议 > 人工修改`

AI 不可推荐硬约束失败项。

## 3. 输入协议（最小）

- `task_type`（`recommendation/explanation`）
- `standard_code`
- `weld_context`
- `eligible_candidates`
- `rule_conflicts`
- `history_context`
- `language`

## 4. 输出协议（最小）

- `confidence`
- `recommendations[]`
- `explanations[]`

## 5. 置信度策略

- `>= 0.85`：高可信
- `0.60 - 0.85`：需复核
- `< 0.60`：仅参考，不进入默认推荐位

## 6. 人工确认策略

- 焊缝信息表必须人工确认后才能正式匹配。
- AI 补全字段逐项可采纳/拒绝。
- 所有修改记录 before/after/operator/time/reason。

## 7. 运行模式

- `offline_mode`：本地模型或内网推理
- `online_mode`：云模型 API

接口一致，支持后续平滑切换。

## 8. 回退机制

- AI 超时或不可用时，主流程继续，仅显示规则结果。
- AI 输出非法时丢弃并记录错误码。

## 9. 验收要点

- AI 故障不影响主流程。
- 低置信度建议不会覆盖默认推荐。
- 冲突解释文本可读、可追溯。
