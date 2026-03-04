# 08-License-Spec

## 1. 目标

- 同时支持在线激活与离线许可证文件激活。
- v1 面向单机授权，v1.1 兼容局域网共享场景。

## 2. 授权类型与权限

- `trial`
- `standard`
- `enterprise`

权限门控覆盖：

- 标准包权限
- AI 功能权限
- 模板数量上限
- 导出权限（Word/PDF）

## 3. 核心实体

- `license_key`（在线激活）
- `license_file(.lic)`（离线激活）
- `device_fingerprint`
- `seats`
- `feature_flags`

## 4. 在线激活流程

1. 输入 license key
2. 客户端生成设备指纹
3. 服务端校验 key、期限、seat
4. 返回签名许可证并本地缓存
5. 状态进入 `Activated`

## 5. 离线激活流程

1. 客户端生成 `*.licreq`
2. 发行端签发 `*.lic`
3. 客户端导入并验签
4. 验签通过后激活

## 6. 设备绑定策略

- v1 默认单设备绑定。
- 设备变更需解绑重绑或重签发。
- 在线异常时允许短期宽限期（建议 7 天）。

## 7. 状态机

- `NotActivated`
- `Activated`
- `GracePeriod`
- `Expired`
- `Revoked`
- `InvalidSignature`

## 8. 错误码

- `LIC_INVALID_KEY`
- `LIC_EXPIRED`
- `LIC_SEAT_FULL`
- `LIC_SIGNATURE_INVALID`
- `LIC_DEVICE_MISMATCH`
- `LIC_REVOKED`
- `LIC_OFFLINE_NOT_ALLOWED`

## 9. 安全要求

- 许可证必须数字签名。
- 客户端仅保留公钥。
- 本地缓存加密并做完整性保护。
- 防系统时间回拨策略。

## 10. 审计要求

每次授权事件记录：

- `time`
- `action`
- `license_id`
- `device_id_hash`
- `result`
- `trace_id`
