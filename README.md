# 油站网点地图管理

- 行业：石油
- 技术栈：Vue3、Vite、TypeScript、Element Plus、Leaflet
- 启动：`npm install && npm run dev`
- 构建：`npm run build`

这是一个功能最小闭环前端项目，数据默认保存在浏览器localStorage中，方便后续扩展接口、权限、图表或地图能力。

## 应急补给批次闭环

在油站列表下方可登记应急补给批次：

- 仅可勾选同一区域内「营业中」的站点，逐站填写补给量并按 ↑/↓ 调整到站顺序；
- 登记油品与总额度，累计补给量不得超过额度；
- 同区域已有未结束批次（待发车/运输中/已冻结），或任一站点库存高于安全线（12000L）时**整批拒绝**，页面与 localStorage 均不变；
- 发车后只能按到站顺序逐站签收，补给量自动入库；
- 某站签收前进入「库存紧张」（可在油站卡片上用“流转状态”模拟）立即冻结批次，此前签收保留，后续站点不得跳过；
- 全部签收后批次完成并释放区域名额；批次与站点库存分别持久化在 localStorage，刷新后仍保留。

批次规则实现在 `src/supply.ts`（纯函数），可运行 `npx esbuild scripts/test-supply.ts --bundle --platform=node --format=esm --outfile=/tmp/test-supply.mjs && node /tmp/test-supply.mjs` 校验。
