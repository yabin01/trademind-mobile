import type { UnifiedTrade } from '@trademind/trading-core';
import {
  deleteConnectionCascade,
  ensureAccount,
  importTrades,
  insertConnection,
  listConnections as dbListConnections,
  migrate,
  uid,
  updateConnection,
} from '@tm/db';
import { deleteCredential, loadCredential, saveCredential } from '@tm/lib/secure';
import {
  fetchOpenPositions,
  fetchPositionsHistory,
  fetchSwapCtValMap,
  probePermissions,
  type OkxCredentials,
  type OkxPositionHistoryRow,
  type OkxPositionRow,
  type PermissionProbe,
} from './okx';
import {
  fetchClearinghouseState,
  fetchUserFills,
  isValidWalletAddress,
  probeHyperliquid,
  reconstructTradesFromFills,
  type HlTrade,
  type HyperliquidCredentials,
} from './hyperliquid';

export type ConnectionMeta = {
  id: string;
  exchange: string;
  name: string;
  status: string;
  lastSyncAt: string | null;
  autoSync: boolean;
  syncIntervalMin: number;
  lastError: string | null;
  permissions: PermissionProbe | null;
  /** 脱敏后的凭证信息（不回传 secret / passphrase / 私钥） */
  credentialsMasked: string | null;
};

const CLOSE_TYPE_LABEL: Record<string, string> = {
  '1': '部分平仓',
  '2': '全部平仓',
  '3': '强制平仓',
  '4': '部分强平',
  '5': 'ADL（未全平）',
  '6': 'ADL（全平）',
};

function maskConnection(row: ReturnType<typeof dbListConnections>[number], cred: unknown): ConnectionMeta {
  const base: ConnectionMeta = {
    id: row.id,
    exchange: row.exchange,
    name: row.name,
    status: row.status,
    lastSyncAt: row.lastSyncAt,
    autoSync: !!row.autoSync,
    syncIntervalMin: row.syncIntervalMin,
    lastError: row.lastError,
    permissions: row.permissions ? (JSON.parse(row.permissions) as PermissionProbe) : null,
    credentialsMasked: null,
  };
  if (row.exchange === 'HYPERLIQUID') {
    const c = (cred ?? {}) as Partial<HyperliquidCredentials>;
    const addr = typeof c.walletAddress === 'string' ? c.walletAddress : '';
    base.credentialsMasked = addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : null;
  } else {
    const c = (cred ?? {}) as Partial<OkxCredentials>;
    base.credentialsMasked = c.apiKey ? `${c.apiKey.slice(0, 4)}****${c.apiKey.slice(-4)}` : null;
  }
  return base;
}

export async function listConnections(): Promise<ConnectionMeta[]> {
  migrate();
  const rows = dbListConnections();
  const out: ConnectionMeta[] = [];
  for (const r of rows) {
    const cred = await loadCredential(r.id);
    out.push(maskConnection(r, cred));
  }
  return out;
}

export async function createConnection(input: {
  exchange: 'OKX' | 'HYPERLIQUID';
  name: string;
  credentials: OkxCredentials | HyperliquidCredentials;
}): Promise<ConnectionMeta> {
  migrate();
  if (input.exchange !== 'OKX' && input.exchange !== 'HYPERLIQUID') {
    throw new Error(`暂不支持 ${input.exchange}`);
  }
  if (!input.name?.trim()) throw new Error('请填写连接名称');
  const id = uid();
  let credMeta: string | null = null;
  if (input.exchange === 'HYPERLIQUID') {
    const c = input.credentials as HyperliquidCredentials;
    if (!isValidWalletAddress(c.walletAddress)) throw new Error('钱包地址格式不正确（需 0x 开头的 42 位地址）');
    credMeta = c.walletAddress;
  } else {
    const c = input.credentials as OkxCredentials;
    if (!c.apiKey?.trim() || !c.secretKey?.trim() || !c.passphrase?.trim())
      throw new Error('OKX 需要 apiKey / secretKey / passphrase 三项都填写');
    credMeta = c.apiKey.trim();
  }

  // 幂等：同一交易所 + 同一凭证（apiKey / 钱包地址）已存在时，复用原连接并更新凭证，
  // 避免反复点击「添加」产生一堆重复条目
  const existing = dbListConnections().find((r) => r.exchange === input.exchange && r.credentialsMeta === credMeta);
  if (existing) {
    updateConnection(existing.id, { name: input.name.trim() });
    await saveCredential(existing.id, input.credentials);
    return (await listConnections()).find((c) => c.id === existing.id)!;
  }

  insertConnection({
    id,
    exchange: input.exchange,
    name: input.name.trim(),
    status: 'CONNECTED',
    credentialsMeta: credMeta,
    autoSync: false,
    syncIntervalMin: 15,
  });
  await saveCredential(id, input.credentials);
  return (await listConnections()).find((c) => c.id === id)!;
}

export async function validateConnection(id: string): Promise<{ permissions: PermissionProbe; warnings: string[] }> {
  const conn = (await listConnections()).find((c) => c.id === id);
  if (!conn) throw new Error('连接不存在');
  const cred = await loadCredential(id);
  if (conn.exchange === 'HYPERLIQUID') {
    const c = cred as HyperliquidCredentials;
    const probe = await probeHyperliquid(c.walletAddress);
    const permissions: PermissionProbe = probe.ok
      ? {
          readOnly: true,
          read: { ok: true },
          trade: { granted: false, msg: 'Hyperliquid 公开只读接口，不涉及交易权限' },
          withdraw: { granted: false, msg: 'Hyperliquid 只读地址，无法提币' },
          checkedAt: new Date().toISOString(),
        }
      : { readOnly: false, read: { ok: false, msg: probe.msg }, trade: { granted: false }, withdraw: { granted: false }, checkedAt: new Date().toISOString() };
    updateConnection(id, { permissions: JSON.stringify(permissions) });
    const warnings = probe.ok
      ? ['仅使用公开链上数据，不需要也不应填入任何私钥/助记词。']
      : ['读取失败，请确认钱包地址是否正确。'];
    return { permissions, warnings };
  }
  const c = cred as OkxCredentials;
  const permissions = await probePermissions(c);
  updateConnection(id, { permissions: JSON.stringify(permissions) });
  const warnings: string[] = [];
  if (!permissions.read.ok) warnings.push('读权限不可用，同步会失败，请检查密钥与 IP 白名单。');
  if (permissions.trade.granted) warnings.push('⚠️ 该密钥具备交易权限，建议改为「只读」密钥以降低风险。');
  if (permissions.withdraw.granted) warnings.push('🚨 该密钥具备提币权限，强烈建议立即更换为只读密钥！');
  return { permissions, warnings };
}

/** OKX 仓位历史 -> UnifiedTrade 行（口径与桌面端一致） */
function mapOkxPosition(row: OkxPositionHistoryRow, accountId: string, ctValMap: Map<string, number>): UnifiedTrade {
  const ctVal = ctValMap.get(row.instId);
  const contracts = Number(row.closeTotalPos) || 0;
  const quantity = ctVal != null ? contracts * ctVal : contracts;
  const direction = (row.direction || row.posSide || 'net').toLowerCase();
  const closeType = CLOSE_TYPE_LABEL[row.type] ?? `平仓(type=${row.type})`;
  const now = new Date().toISOString();
  return {
    id: uid(),
    workspaceId: 'local',
    accountId,
    exchange: 'OKX',
    symbol: row.instId,
    side: direction === 'short' ? 'BUY' : 'SELL',
    positionSide: direction.toUpperCase() as UnifiedTrade['positionSide'],
    entryPrice: Number(row.openAvgPx) || 0,
    exitPrice: Number(row.closeAvgPx) || 0,
    quantity,
    leverage: Math.round(Number(row.lever)) || 1,
    openTime: new Date(Number(row.cTime)).toISOString(),
    closeTime: new Date(Number(row.uTime)).toISOString(),
    grossPnl: Number(row.pnl) + Number(row.settledPnl || 0),
    fees: -Number(row.fee) - Number(row.liqPenalty || 0),
    funding: -Number(row.fundingFee),
    netPnl: Number(row.realizedPnl),
    risk: null,
    reward: null,
    rr: null,
    strategyId: null,
    tags: [],
    mistakes: [],
    externalTradeId: `okx:pos:${row.posId}:${row.uTime}`,
    notes: row.type === '1' || row.type === '2' ? null : closeType,
    metadata: {
      source: 'okx:positions-history',
      posId: row.posId,
      closeType,
      pnlRatio: Number(row.pnlRatio) || 0,
      ctVal: ctVal ?? null,
      quantityUnit: ctVal != null ? 'base' : 'contracts',
      marginMode: row.mgnMode,
      marginCcy: row.ccy,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function hlExternalId(t: HlTrade): string {
  return `hl:${t.coin}:${t.closeTid}`;
}

function mapHlTrade(t: HlTrade, accountId: string): UnifiedTrade {
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
    externalTradeId: hlExternalId(t),
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

export interface SyncResult {
  exchange: string;
  fetched: number;
  inserted: number;
  skipped: number;
  openPositions?: number;
  accountValue?: string | null;
  truncated?: boolean;
  oldestCloseTime?: string | null;
  newestCloseTime?: string | null;
}

export async function syncConnection(id: string, opts: { sinceDays?: number } = {}): Promise<SyncResult> {
  migrate();
  const conn = (await listConnections()).find((c) => c.id === id);
  if (!conn) throw new Error('连接不存在');
  const cred = await loadCredential(id);
  if (!cred) throw new Error('连接缺少凭证，请删除后重新绑定');

  if (conn.exchange === 'HYPERLIQUID') {
    const c = cred as HyperliquidCredentials;
    if (!isValidWalletAddress(c.walletAddress)) throw new Error('连接缺少有效的钱包地址');
    updateConnection(id, { status: 'SYNCING' });
    try {
      const account = ensureAccount(id, conn.name, 'HYPERLIQUID', 'USDC');
      const sinceMs = opts.sinceDays && opts.sinceDays > 0 ? Date.now() - opts.sinceDays * 86_400_000 : undefined;
      const { fills, truncated } = await fetchUserFills(c.walletAddress, { sinceMs, maxPages: 10 });
      const hlTrades = reconstructTradesFromFills(fills);
      const toInsert = hlTrades.map((t) => mapHlTrade(t, account.id));
      const { inserted, skipped } = importTrades(toInsert);
      const state = await fetchClearinghouseState(c.walletAddress).catch(() => null);
      updateConnection(id, { status: 'SUCCESS', lastSyncAt: new Date().toISOString() });
      const closeMs = hlTrades.map((t) => t.closeTimeMs).filter((n) => Number.isFinite(n));
      return {
        exchange: 'HYPERLIQUID',
        fetched: hlTrades.length,
        inserted,
        skipped,
        openPositions: state?.assetPositions.length ?? 0,
        accountValue: state?.marginSummary?.accountValue ?? null,
        truncated,
        oldestCloseTime: closeMs.length ? new Date(Math.min(...closeMs)).toISOString() : null,
        newestCloseTime: closeMs.length ? new Date(Math.max(...closeMs)).toISOString() : null,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      updateConnection(id, { status: 'FAILED', lastError: msg });
      throw new Error(`同步失败：${msg}`);
    }
  }

  // OKX
  const c = cred as OkxCredentials;
  if (!c.apiKey || !c.secretKey || !c.passphrase) throw new Error('连接缺少完整凭证');
  updateConnection(id, { status: 'SYNCING' });
  try {
    const account = ensureAccount(id, conn.name, 'OKX', 'USDT');
    const ctValMap = await fetchSwapCtValMap();
    const rows = await fetchPositionsHistory(c, { instType: 'SWAP' });
    const toInsert = rows.map((r) => mapOkxPosition(r, account.id, ctValMap));
    const { inserted, skipped } = importTrades(toInsert);
    updateConnection(id, { status: 'SUCCESS', lastSyncAt: new Date().toISOString() });
    return { exchange: 'OKX', fetched: rows.length, inserted, skipped };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    updateConnection(id, { status: 'FAILED', lastError: msg });
    throw new Error(`同步失败：${msg}`);
  }
}

export async function removeConnection(id: string): Promise<void> {
  deleteConnectionCascade(id);
  await deleteCredential(id);
}

// ---------- 实时持仓 ----------
export type LivePosition = {
  accountId: string;
  connectionId: string;
  exchange: string;
  symbol: string;
  positionSide: string;
  entryPrice: number;
  markPrice: number;
  size: number; // 带符号（HL）/ 合约数（OKX）
  notionalUsd: number;
  leverage: number;
  margin: number;
  liqPrice: number | null;
  unrealizedPnl: number;
  raw: Record<string, unknown>;
};

export async function fetchLivePositions(connectionId: string): Promise<LivePosition[]> {
  const conn = (await listConnections()).find((c) => c.id === connectionId);
  if (!conn) return [];
  const cred = await loadCredential(connectionId);
  if (!cred) return [];

  if (conn.exchange === 'HYPERLIQUID') {
    const c = cred as HyperliquidCredentials;
    const state = await fetchClearinghouseState(c.walletAddress);
    return state.assetPositions.map((p) => {
      const pos = p.position;
      const szi = Number(pos.szi) || 0;
      return {
        accountId: '',
        connectionId,
        exchange: 'HYPERLIQUID',
        symbol: pos.coin,
        positionSide: szi >= 0 ? 'LONG' : 'SHORT',
        entryPrice: Number(pos.entryPx) || 0,
        markPrice: 0,
        size: szi,
        notionalUsd: Number(pos.positionValue) || 0,
        leverage: pos.leverage?.value ?? 1,
        margin: Number(pos.marginUsed) || 0,
        liqPrice: pos.liquidationPx ? Number(pos.liquidationPx) : null,
        unrealizedPnl: Number(pos.unrealizedPnl) || 0,
        raw: pos as unknown as Record<string, unknown>,
      };
    });
  }

  const c = cred as OkxCredentials;
  const rows = await fetchOpenPositions(c, { instType: 'SWAP' });
  return (rows as OkxPositionRow[]).map((r) => {
    const sign = r.posSide === 'long' ? 1 : r.posSide === 'short' ? -1 : 0;
    return {
      accountId: '',
      connectionId,
      exchange: 'OKX',
      symbol: r.instId,
      positionSide: r.posSide.toUpperCase(),
      entryPrice: Number(r.avgPx) || 0,
      markPrice: Number(r.markPx) || 0,
      size: sign * (Number(r.pos) || 0),
      notionalUsd: Number(r.notionalUsd) || 0,
      leverage: Math.round(Number(r.lever)) || 1,
      margin: Number(r.margin) || 0,
      liqPrice: r.liqPx ? Number(r.liqPx) : null,
      unrealizedPnl: Number(r.upl) || 0,
      raw: r as unknown as Record<string, unknown>,
    };
  });
}
