/**
 * 移动端数据管线集成测试（真实代码，桌面端复现）。
 *
 * 目的：验证「同步 -> 入库 -> 查询 -> 看板/交易/复盘指标」整条链路在 expo-sqlite 行为下
 * 能正确产出数据。expo-sqlite（与 node:sqlite 一致）返回的行键是「列名 snake_case」，
 * 不自动转驼峰——本测试用 node:sqlite 替身真实复现该行为。
 *
 * 运行：node --experimental-strip-types --experimental-loader ./test/loader.mjs ./test/pipeline.test.ts
 */
import { migrate, ensureAccount, importTrades, getTradesAsModels, getConnectionChoices, insertConnection, uid } from '../src/db/index.ts';
import { reconstructTradesFromFills } from '../src/core/exchange/hyperliquid.ts';
import { computeCoreMetrics } from '../src/core/analytics/src/metrics.ts';
import { filterByWindow, dailyPnlSeries, closedTrades } from '../src/lib/metrics.ts';
import { dayKeyBeijing } from '../src/lib/format.ts';

// ---- mapHlTrade 副本（与 src/core/exchange/sync.ts 一致，纯函数）----
function mapHlTrade(t: any, accountId: string): any {
  const now = new Date().toISOString();
  return {
    id: uid(),
    workspaceId: 'local',
    accountId,
    exchange: 'HYPERLIQUID',
    symbol: t.coin,
    side: t.direction === 'LONG' ? 'SELL' : 'BUY',
    positionSide: t.direction,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    quantity: t.quantity,
    leverage: 1,
    openTime: new Date(t.openTimeMs).toISOString(),
    closeTime: new Date(t.closeTimeMs).toISOString(),
    grossPnl: t.grossPnl,
    fees: t.fees,
    funding: t.funding,
    netPnl: t.netPnl,
    risk: null,
    reward: null,
    rr: null,
    strategyId: null,
    tags: [],
    mistakes: [],
    externalTradeId: `hl:${t.coin}:${t.closeTid}`,
    notes: null,
    metadata: {
      source: 'hyperliquid:fills',
      coin: t.coin,
      fillCount: t.fillCount,
      openTid: t.openTid,
      closeTid: t.closeTid,
      partialEntry: t.partialEntry,
      leverageUnknown: true,
      fundingUnavailable: true,
      quantityUnit: 'base',
    },
    createdAt: now,
    updatedAt: now,
  };
}

// ---- 合成 Hyperliquid 成交：2 笔完整往返（多/空各一），时间落在近 90 天内 ----
const now = Date.now();
const fills: any[] = [
  { coin: 'ETH', px: '3000', sz: '1', side: 'B', time: now - 20 * 86_400_000, startPosition: '0', dir: 'Long', closedPnl: '0', fee: '0.5', tid: 1, oid: 1, hash: 'h1', crossed: true },
  { coin: 'ETH', px: '3100', sz: '1', side: 'A', time: now - 18 * 86_400_000, startPosition: '1', dir: 'Short', closedPnl: '100', fee: '0.5', tid: 2, oid: 2, hash: 'h2', crossed: true },
  { coin: 'ETH', px: '3200', sz: '0.5', side: 'A', time: now - 10 * 86_400_000, startPosition: '0', dir: 'Short', closedPnl: '0', fee: '0.3', tid: 3, oid: 3, hash: 'h3', crossed: true },
  { coin: 'ETH', px: '3150', sz: '0.5', side: 'B', time: now - 9 * 86_400_000, startPosition: '-0.5', dir: 'Long', closedPnl: '25', fee: '0.3', tid: 4, oid: 4, hash: 'h4', crossed: true },
];

function run() {
  migrate();
  insertConnection({
    id: 'conn1', exchange: 'HYPERLIQUID', name: 'Robin', status: 'CONNECTED', credentialsMeta: null,
    lastSyncAt: null, autoSync: false, syncIntervalMin: 15, lastError: null, permissions: null,
  });
  const account = ensureAccount('conn1', 'Robin', 'HYPERLIQUID', 'USDC');
  const hlTrades = reconstructTradesFromFills(fills);
  const toInsert = hlTrades.map((t) => mapHlTrade(t, account.id));
  const { inserted, skipped } = importTrades(toInsert);

  // 重复同步同批数据，应被去重（验证 importTrades 的 existing-set 键正确）
  const re = importTrades(toInsert);

  const raw = getTradesAsModels({});
  const sample = raw[0];

  // 看板计算（与 app/index.tsx 一致）
  const windowTrades = filterByWindow(raw, 90);
  const metrics = computeCoreMetrics(windowTrades);
  const series = dailyPnlSeries(windowTrades);
  const closed = closedTrades(raw);

  console.log('=== 管线诊断 ===');
  console.log('reconstruct 笔数:', hlTrades.length, '| 首次入库 inserted:', inserted, 'skipped:', skipped, '| 复同步 re:', JSON.stringify(re));
  console.log('查询返回笔数:', raw.length);
  console.log('样本字段: symbol=%s closeTime=%s netPnl=%s quantity=%s openTime=%s',
    sample?.symbol, sample?.closeTime, sample?.netPnl, sample?.quantity, sample?.openTime);
  console.log('看板窗口内笔数:', windowTrades.length);
  console.log('看板指标: closedTrades=%s netPnl=%s winRate=%s fees=%s',
    metrics.closedTrades, metrics.netPnl, metrics.winRate, metrics.fees);
  console.log('净值序列点数:', series.length);
  console.log('复盘(closedTrades):', closed.length, closed.map((t) => dayKeyBeijing(t.closeTime!)).join(','));

  // ---- 断言（修复后应全部成立）----
  const problems: string[] = [];
  if (raw.length !== 2) problems.push(`查询返回笔数应为 2，实为 ${raw.length}`);
  if (re.inserted !== 0 || re.skipped !== 2) problems.push(`复同步去重应 inserted=0 skipped=2，实为 inserted=${re.inserted} skipped=${re.skipped}`);
  for (const t of raw) {
    if (t.closeTime == null) problems.push(`trade ${t.symbol} 的 closeTime 为 ${t.closeTime}（rowToTrade 未取到 snake_case 列）`);
    if (!Number.isFinite(t.netPnl)) problems.push(`trade ${t.symbol} 的 netPnl 非有限值: ${t.netPnl}`);
    if (!Number.isFinite(t.quantity)) problems.push(`trade ${t.symbol} 的 quantity 非有限值: ${t.quantity}`);
  }
  if (windowTrades.length !== 2) problems.push(`看板窗口内应为 2 笔，实为 ${windowTrades.length}`);
  if (metrics.closedTrades !== 2) problems.push(`看板 closedTrades 应为 2，实为 ${metrics.closedTrades}`);
  if (series.length !== 2) problems.push(`净值序列应为 2 点，实为 ${series.length}`);
  if (closed.length !== 2) problems.push(`复盘 closedTrades 应为 2，实为 ${closed.length}`);

  // ---- 数据源筛选（按连接/API 查看）：getConnectionChoices + accountId 归属 ----
  const choices = getConnectionChoices();
  const conn1 = choices.find((c) => c.id === 'conn1');
  console.log('连接选择器:', JSON.stringify(choices));
  if (!conn1) problems.push('getConnectionChoices 应包含 conn1');
  else {
    if (!conn1.accountIds.includes(account.id)) problems.push('conn1 的 accountIds 应包含本次账户 id');
    const scoped = raw.filter((t) => conn1.accountIds.includes(t.accountId));
    if (scoped.length !== 2) problems.push(`按 conn1 筛选应得 2 笔，实为 ${scoped.length}`);
    const otherConn = raw.filter((t) => !conn1.accountIds.includes(t.accountId));
    if (otherConn.length !== 0) problems.push(`conn1 之外不应有交易，实为 ${otherConn.length} 笔`);
  }

  if (problems.length) {
    console.error('\n❌ PIPELINE TEST FAILED:');
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
  console.log('\n✅ PIPELINE TEST PASSED：看板 / 交易 / 复盘 数据均可正常显示，且按连接筛选归属正确');
  process.exit(0);
}

run();
