# 06-Template-Mapping-Spec

## 1. 目标

- 提供预设工艺卡模板快速出卡。
- 支持企业自定义模板字段映射。
- 支持预览、Word 导出、PDF 导出。

## 2. 模板类型

- `preset`：系统预设，不可删除，可复制
- `enterprise`：企业自定义，支持版本化

## 3. 模板主数据

- `template_id`
- `template_name`
- `template_type`
- `standard_scope`
- `status`
- `version`
- `export_targets`

## 4. 映射配置字段

- `mapping_id`
- `target_field_key`
- `source_module`
- `source_field_key`
- `transform_rule`
- `default_value`
- `required`
- `empty_policy`（`error/warn/allow`）
- `display_order`
- `group_name`

## 5. transform_rule（v1）

- `identity`
- `concat(a,b,sep)`
- `format_date(pattern)`
- `number(unit,precision)`
- `enum_label(dict)`
- `fallback(a,b)`

## 6. 渲染流程

1. 读取模板与映射配置
2. 聚合焊缝/PQR/焊工/系统字段
3. 执行转换规则
4. 执行空值策略与完整性校验
5. 生成预览模型
6. 导出 Word/PDF

## 7. 版本策略

- 每次保存映射均生成新版本。
- 匹配结果绑定模板版本。
- 仅 active 版本用于正式导出。

## 8. v1 预设模板

- `TPL-CN-001`（国标）
- `TPL-ASME-001`（ASME）

## 9. 验收要点

- 自定义映射可保存并回放。
- 预览与导出字段一致。
- 空值策略行为与配置一致。
