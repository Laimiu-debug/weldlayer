# 03-Data-Dictionary

## 1. 统一字段元模型

字段元数据建议统一维护以下键：

- `field_key`
- `field_name`
- `module`（`weld_seam/pqr/welder/consumable/template`）
- `data_type`（`string/number/enum/date/bool`）
- `required`
- `is_enabled`
- `is_user_editable`
- `standard_scope`（`CN_GB/ASME_IX/BOTH`）
- `match_role`（`hard_filter/soft_score/info`）
- `match_weight`
- `validation_rule`
- `conflict_clause_ref`

## 2. 焊缝信息模块（weld_seam）

最小字段：

- `weld_id`
- `draw_ref`
- `weld_symbol`
- `joint_type`
- `material_spec`
- `material_group`
- `thickness_mm`
- `diameter_mm`
- `position_code`
- `bevel_type`
- `process_hint`
- `confidence_score`
- `review_status`
- `updated_by`
- `updated_at`

## 3. PQR 模块（pqr）

最小字段：

- `pqr_id`
- `standard_code`
- `process_code`
- `base_material_group`
- `base_material_spec`
- `thickness_min_mm`
- `thickness_max_mm`
- `position_scope`
- `filler_class`
- `preheat_min_c`
- `interpass_max_c`
- `heat_input_min`
- `heat_input_max`
- `valid_from`
- `valid_to`
- `status`

## 4. 焊工资格模块（welder）

最小字段：

- `welder_id`
- `welder_name`
- `cert_no`
- `standard_code`
- `process_code`
- `position_scope`
- `material_group_scope`
- `thickness_min_mm`
- `thickness_max_mm`
- `diameter_min_mm`
- `diameter_max_mm`
- `test_date`
- `expiry_date`
- `status`

## 5. 焊材库与库存模块（consumable）

最小字段：

- `consumable_id`
- `material_code`（焊材牌号/型号）
- `spec_standard`（执行标准）
- `diameter_mm`
- `process_scope`（适用焊接方法）
- `material_group_scope`（适用母材组）
- `batch_no`
- `lot_no`
- `warehouse_code`
- `location_code`
- `qty_on_hand`（当前库存）
- `qty_available`（可用库存）
- `safety_stock`（安全库存）
- `uom`（单位）
- `mfg_date`
- `expiry_date`
- `status`（`active/hold/expired`）
- `updated_by`
- `updated_at`

## 6. 模板映射模块（template）

最小字段：

- `template_id`
- `template_name`
- `target_field_key`
- `source_module`
- `source_field`
- `transform_rule`
- `required`
- `empty_policy`
- `display_order`
- `export_word`
- `export_pdf`
- `preview_visible`

## 7. 关键校验规则

- 范围校验：`min <= max`
- 数值校验：厚度、管径、热输入必须大于 0
- 日期校验：`valid_to >= valid_from`、`expiry_date >= test_date`
- 枚举校验：`process_code`、`position_code` 必须在标准包枚举内
- 追溯校验：人工修改必须记录操作人、时间、原因
- 库存校验：
  - `qty_available >= required_qty`（strict 模式下为硬约束）
  - `qty_available < safety_stock` 触发预警
  - `expiry_date` 距离当前阈值天数内触发临期预警
  - `material_code/spec_standard` 必须满足工艺要求

## 8. 条款引用格式

统一采用：`<STANDARD>:<CLAUSE>`

示例：

- `ASME_IX:QW-452.1(b)`
- `CN_GB:GB_RULE_PQR_THK_001`
- `INVENTORY:STOCK_MIN_001`
- `INVENTORY:EXPIRY_WARN_001`
