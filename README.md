# TradeMind 安卓端（trademind-mobile）

自托管、离线优先的加密货币**交易日志与分析 App**，基于 Expo / React Native。
与桌面端 [`TradeMind`](https://github.com/yabin01/TradeMind) 仓库**完全独立、互不依赖**——这是一个单独的仓库。

> 基于 [MIT 协议](LICENSE) 开源，可自由使用、修改、分发与商用（需保留版权声明）。

📦 **下载安卓 APK（无需 Google Play，直接安装）**：[Releases](https://github.com/yabin01/trademind-mobile/releases/latest)

## 设计要点

- **离线优先 / 数据不出手机**：所有交易数据存在本机 SQLite（`expo-sqlite`），交易所 API Key 存于安卓 Keystore（`expo-secure-store`），不依赖任何服务端，也无需鉴权。
- **业务逻辑下沉为平台无关领域层**：把桌面端验证过的纯函数引擎（`@trademind/analytics` 指标计算、`@trademind/trading-core` 模型/CSV/去重）原样 vendored 进 `src/core/`，移动端与桌面端共用同一套口径（红涨绿跌、UTC 存储 / 北京时间显示、净盈亏恒等式、OKX 与 Hyperliquid 手续费符号相反等历史坑都保持一致）。
- **交易所客户端 RN 化**：原桌面端的 `curl` 子进程 + `node:crypto` 传输层**全部重写为** `fetch` + `@noble/hashes`（纯 JS HMAC-SHA256），去掉了所有 Node 专属依赖，可在手机直接跑。
- **双数据源**：OKX（只读 API Key 同步近 3 个月仓位历史）/ Hyperliquid（公开钱包地址，零凭证）/ OKX 网页导出 CSV 全量导入（保留 2 年历史）。

## 已实现功能（Phase 0 → 2）

| 模块 | 说明 |
|---|---|
| 看板 Dashboard | KPI（净盈亏 / 胜率 / 盈利因子 / 期望值…）+ 累计净值曲线，支持 7/30/90 天 / 全部窗口 |
| 实时持仓 | 拉取 OKX / Hyperliquid 未平仓合约，显示开平仓价、杠杆、强平价、未实现盈亏，可加标注（入场理由 / 标签 / 备注） |
| 交易记录 | 列表 + 搜索 + 时间窗筛选，点进交易详情（价格、盈亏分解、标注、归档） |
| 日历复盘 | 月历视图，按日聚合盈亏着色，点日写复盘（1–5 星自评 + 笔记） |
| AI 教练 | **本地离线**分析引擎：基于真实数据库回答「最大亏损」「连亏纪律」「杠杆风险」「品种表现」等，结论带可点击的交易引用，不虚构 |
| 设置 | 外观（浅/深）、数据源管理（连接 / 校验 / 同步 / 删除）、添加连接、CSV 导入 |

## 目录结构

```
app/                   Expo Router 路由（看板/持仓/交易/复盘/教练/设置 + 子页）
src/core/trading-core  vendored 纯函数：模型 / CSV / 去重（原样保留）
src/core/analytics     vendored 纯函数：指标引擎（原样保留）
src/core/exchange      RN 版 OKX / Hyperliquid 客户端 + 同步编排
src/db/                SQLite schema（drizzle 方言）+ 仓储层
src/lib/               主题(红涨绿跌) / 格式化(北京时间) / 指标 / 教练 / 安全存储
src/store/             zustand 状态 + 数据 hooks
src/components/ui.tsx  共享 UI 组件
```

## 构建与运行（本地出 APK，无需 Google Play）

> 本仓库不含 Android 原生工程与 SDK；在你装了 **Android Studio + Android SDK** 的机器上执行：

```bash
npm install            # 或 pnpm install
npx expo prebuild      # 生成 android/ 原生工程（首次）
npx expo run:android   # 编译并安装到已连接的手机 / 模拟器
# 仅出发行包：
cd android && ./gradlew assembleRelease   # 产物 app-release.apkgradle
```

也可使用 EAS 本地构建（不出公网）：`eas build --profile preview --local`（配置见 `eas.json`）。

### 代理说明
手机上 OKX / Hyperliquid 的访问由系统 **Clash VPN（TUN 模式）** 自动接管，App 内无需配置代理；桌面端的 `curl + SSRUN` 链路在移动端不存在。

## 数据导入（保住 2 年历史）

OKX 公开 API 仅回溯近 3 个月。要保留历史样本：
1. 在 OKX 网页「账单 → 历史成交」导出 CSV（时间范围可选到 2021 至今）；
2. 发到手机，App 内「设置 → 导入 CSV」一键全量入库。

日常增量靠「设置 → 连接 → 同步」即可。

## 已知限制 / 后续（Phase 3+）

- 规则引擎可视化编辑、批量操作、笔记独立页、策略页尚在 Phase 3。
- AI 教练当前为**本地规则分析**；后续可接入外部 LLM（带本机 Key），结论仍须来自数据库、禁止虚构。
- 推送通知、生物识别锁、离线缓存增强为 Phase 4。

---
数据完全留在你的设备上。祝交易顺利。🦉
