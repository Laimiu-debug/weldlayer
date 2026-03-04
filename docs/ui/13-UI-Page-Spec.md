# 13-UI-Page-Spec

## 1. 页面列表（v1）

1. 项目首页 / 新建项目
2. 图纸导入与解析
3. 焊缝信息表确认
4. PQR 管理
5. 焊工资格管理
6. 匹配结果与冲突解释
7. 模板映射
8. 工艺卡预览与导出
9. 许可证

## 2. 页面规格

### 2.1 项目首页

- 关键字段：`project_name/project_code/company/standard_code/drawing_type`
- 关键动作：新建、打开最近项目、归档
- 校验：项目名必填，项目编码唯一

### 2.2 图纸导入与解析

- 关键字段：`file_path/file_type/parse_status/progress/error_code`
- 关键动作：拖拽上传、开始解析、重试、日志查看
- 校验：仅 PDF/DWG

### 2.3 焊缝信息表确认

- 关键字段：`weld_id/material_group/thickness_mm/position_code/confidence_score/review_status`
- 关键动作：增删改、批量编辑、不确定项标记、历史查看
- 校验：必填缺失不能提交匹配

### 2.4 PQR 管理

- 关键字段：`pqr_id/standard_code/process_code/thickness_range/position_scope/valid_to/status`
- 关键动作：新增、编辑、停用、导入
- 校验：范围合法、有效期合法、编号唯一

### 2.5 焊工资格管理

- 关键字段：`welder_id/cert_no/process_code/position_scope/material_group_scope/expiry_date/status`
- 关键动作：新增、编辑、批量导入、到期预警
- 校验：范围合法、到期状态可见

### 2.6 匹配结果与冲突解释

- 关键字段：`decision/recommended/alternatives/hard_conflicts/clause_ref/trace_id`
- 关键动作：切换备选、筛选冲突、查看条款详情、修复后重跑
- 校验：未确认焊缝不可匹配

### 2.7 模板映射

- 关键字段：`template_id/target_field/source_field/transform_rule/empty_policy`
- 关键动作：新建模板、映射配置、保存版本、发布
- 校验：required 字段未映射不可发布

### 2.8 工艺卡预览与导出

- 关键字段：`template_version/validation_summary/export_status`
- 关键动作：预览、导出 Word、导出 PDF
- 校验：导出前完整性检查

### 2.9 许可证

- 关键字段：`license_key/license_status/plan/valid_to/device_fingerprint`
- 关键动作：在线激活、生成 licreq、导入 lic
- 校验：签名、设备绑定、过期校验

## 3. 主流程跳转

`项目首页 -> 图纸导入 -> 焊缝确认 -> 匹配结果 -> 工艺卡导出`

匹配失败可跳转主数据页补数后返回重跑。
