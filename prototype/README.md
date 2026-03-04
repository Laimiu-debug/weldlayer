# WeldLayer Frontend Prototype

## Quick Start

1. Open `prototype/index.html` in your browser.
2. Click left navigation to switch between the 9 core pages.
3. Use these interactions to test flow:
   - `图纸导入解析` -> `开始解析`
   - `焊缝信息确认` -> `批量确认` / `标记低置信度` / `标记特殊工况`
   - `PQR管理` / `焊工资格管理` -> 在表头内按异种金属与不同厚度筛选并排序
   - `匹配与冲突解释` -> `重新匹配` + severity filter
   - `模板映射` -> `保存新版本`
   - `工艺卡预览导出` -> `导出Word/PDF`
   - `许可证中心` -> test key format `WL-AB12-CD34-EF56`

## Scope

- This is a static UI prototype with mock data.
- No backend APIs are connected yet.
- The layout follows project docs under `docs/phase0` and `docs/ui`.
- Weld seam confirmation includes special-case checks for dissimilar metals and thickness mismatch.
