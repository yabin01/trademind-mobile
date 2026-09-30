/**
 * Hyperliquid 只读客户端（React Native 版）。
 * /info 端点全部公开只读：只需钱包地址（42 位 0x），不需要 API Key、不涉及交易/提币权限。
 * 文档：https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
 *
 * 关键点（与桌面端一致）：
 *  - 手续费 fee：正数 = 支出，负数 = 返佣；落到本项目 fees（成本口径，正=支出）即 fees = fee。
 *  - closedPnl 为不含手续费的价格盈亏，与本项目 grossPnl 口径一致。
 *  - userFills 只返回最近 2000 笔、平台只保留最近约 10000 笔；更久历史需用 userFillsByTime 翻页。
 *  - 同一毫秒内成交非因果顺序：用每笔自带 startPosition 为权威，同毫秒分组内做因果重排。
 */

export type HyperliquidCredentials = { walletAddress: string };

const HL_BASE = 'https://api.hyperliquid.xyz';

async function hlInfo<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${HL_BASE}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Hyperliquid HTTP ${res.status}`);
  return (await res.json()) as T;
}

export type HyperliquidFill = {
  coin: string;
  px: string;
  sz: string;
  side: 'B' | 'A';
  time: number;
  startPosition?: string;
  dir: string;
  closedPnl: string;
  fee: string;
  tid: number;
  oid: number;
  hash: string;
  crossed: boolean;
  feeToken?: string;
  cloid?: string | null;
};

export type HyperliquidPositionInfo = {
  coin: string;
  szi: string;
  entryPx: string;
  leverage: { type: string; value: number };
  liquidationPx: string | null;
  marginUsed: string;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  cumFunding?: { allTime: string; sinceOpen: string; sinceChange: string };
};

export type HyperliquidAssetPosition = { type: string; position: HyperliquidPositionInfo };
export type HyperliquidClearinghouseState = {
  marginSummary: { accountValue: string; totalNtlPos: string; totalMarginUsed: string };
  withdrawable: string;
  assetPositions: HyperliquidAssetPosition[];
  time: number;
};

export function isValidWalletAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(String(addr ?? '').trim());
}

export async function fetchClearinghouseState(address: string): Promise<HyperliquidClearinghouseState> {
  const state = await hlInfo<HyperliquidClearinghouseState>({ type: 'clearinghouseState', user: address });
  if (!state || typeof state !== 'object') throw new Error('Hyperliquid 返回结构异常');
  return {
    ...state,
    assetPositions: (state.assetPositions ?? []).filter((p) => Math.abs(Number(p?.position?.szi) || 0) > 1e-12),
  };
}

const USER_FILLS_PAGE = 2000;
const MAX_FILL_TOTAL = 24000;
const MAX_WINDOW_MS = 730 * 86_400_000;
const MIN_WINDOW_MS = 5 * 60_000;

function fillsByTime(address: string, startTime: number, endTime: number): Promise<HyperliquidFill[]> {
  return hlInfo<HyperliquidFill[]>({ type: 'userFillsByTime', user: address, startTime, endTime });
}

/**
 * 拉取成交明细（倒序自适应分页：先拿最新一页锚定，再往过去翻，保证最新成交完整、区间连续）。
 */
export async function fetchUserFills(
  address: string,
  opts: { maxPages?: number; sinceMs?: number; timeBudgetMs?: number } = {},
): Promise<{ fills: HyperliquidFill[]; truncated: boolean }> {
  const maxPages = opts.maxPages ?? 10;
  const deadline = Date.now() + (opts.timeBudgetMs ?? 90_000);
  const floor = opts.sinceMs && opts.sinceMs > 0 ? opts.sinceMs : 0;
  const out: HyperliquidFill[] = [];
  const seen = new Set<number>();
  let truncated = false;

  const collect = (rows: HyperliquidFill[]) => {
    for (const r of rows) {
      if (r && typeof r.tid === 'number' && !seen.has(r.tid)) {
        seen.add(r.tid);
        out.push(r);
      }
    }
  };
  const done = () => {
    out.sort((x, y) => Number(x.time) - Number(y.time) || Number(x.tid) - Number(y.tid));
    return { fills: out, truncated };
  };

  const latest = await hlInfo<HyperliquidFill[]>({ type: 'userFills', user: address });
  const first = Array.isArray(latest) ? latest : [];
  collect(first);
  if (first.length < USER_FILLS_PAGE) return done();

  const times = first.map((r) => Number(r.time) || 0).filter((t) => t > 0);
  if (times.length === 0) return done();
  let cursor = Math.min(...times) - 1;
  let window = Math.max(MIN_WINDOW_MS, Math.max(...times) - Math.min(...times));
  let pages = 1;

  while (pages < maxPages && cursor > floor && out.length < MAX_FILL_TOTAL && Date.now() < deadline) {
    const start = Math.max(floor, cursor - window);
    let rows: HyperliquidFill[];
    try {
      rows = await fillsByTime(address, start, cursor);
    } catch (e) {
      if (out.length > 0) {
        truncated = true;
        break;
      }
      throw e;
    }
    if (!Array.isArray(rows)) rows = [];

    if (rows.length >= USER_FILLS_PAGE) {
      const maxTime = Math.max(...rows.map((r) => Number(r.time) || 0));
      const covered = maxTime - start;
      if (covered < MIN_WINDOW_MS) {
        collect(rows);
        pages++;
        cursor = Math.max(floor, Math.min(...rows.map((r) => Number(r.time) || Date.now())) - 1);
        truncated = true;
        continue;
      }
      window = covered >= window ? Math.floor(window / 2) : covered;
      continue;
    }

    collect(rows);
    pages++;
    cursor = start - 1;
    if (rows.length === 0) window = Math.min(MAX_WINDOW_MS, window * 4);
    else if (rows.length < USER_FILLS_PAGE / 2) window = Math.min(MAX_WINDOW_MS, window * 2);
  }

  if ((pages >= maxPages || Date.now() >= deadline) && cursor > floor) truncated = true;
  return done();
}

export interface HlTrade {
  coin: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  openTimeMs: number;
  closeTimeMs: number;
  grossPnl: number;
  fees: number;
  funding: number;
  netPnl: number;
  fillCount: number;
  openTid: number;
  closeTid: number;
  partialEntry: boolean;
}

const EPS = 1e-12;

function samePos(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1e-6, Math.abs(a) * 1e-9);
}
function deltaOf(f: HyperliquidFill): number {
  return (f.side === 'B' ? 1 : -1) * (Number(f.sz) || 0);
}
const posKey = (v: number): string => v.toFixed(8);

function causalOrder(group: HyperliquidFill[]): HyperliquidFill[] {
  if (group.length <= 1) return group;
  for (const f of group) if (!Number.isFinite(Number(f.startPosition))) return group;
  const buckets = new Map<string, HyperliquidFill[]>();
  for (const f of group) {
    const k = posKey(Number(f.startPosition));
    const arr = buckets.get(k);
    if (arr) arr.push(f);
    else buckets.set(k, [f]);
  }
  const afterKeys = new Set<string>();
  for (const f of group) afterKeys.add(posKey(Number(f.startPosition) + deltaOf(f)));
  const starts = [...buckets.keys()].filter((k) => !afterKeys.has(k));
  if (starts.length !== 1) return group;
  const ordered: HyperliquidFill[] = [];
  let cur = starts[0];
  while (ordered.length < group.length) {
    const arr = buckets.get(cur);
    if (!arr || arr.length === 0) break;
    const f = arr.pop() as HyperliquidFill;
    ordered.push(f);
    cur = posKey(Number(f.startPosition) + deltaOf(f));
  }
  return ordered.length === group.length ? ordered : group;
}

function orderFillsCausally(list: HyperliquidFill[]): HyperliquidFill[] {
  const sorted = list
    .slice()
    .sort((x, y) => Number(x.time) - Number(y.time) || Number(x.tid) - Number(y.tid));
  const out: HyperliquidFill[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && Number(sorted[j].time) === Number(sorted[i].time)) j++;
    out.push(...causalOrder(sorted.slice(i, j)));
    i = j;
  }
  return out;
}

type Episode = {
  direction: 'LONG' | 'SHORT';
  entryNotional: number;
  entrySize: number;
  openTimeMs: number;
  openTid: number;
  partialEntry: boolean;
};
type Acc = {
  closeNotional: number;
  closeSize: number;
  grossPnl: number;
  fees: number;
  fillCount: number;
  lastTimeMs: number;
  closeTid: number;
};
const newEpisode = (
  direction: 'LONG' | 'SHORT' = 'LONG',
  entrySize = 0,
  entryNotional = 0,
  openTimeMs = 0,
  openTid = 0,
  partialEntry = false,
): Episode => ({ direction, entrySize, entryNotional, openTimeMs, openTid, partialEntry });
const newAcc = (): Acc => ({
  closeNotional: 0,
  closeSize: 0,
  grossPnl: 0,
  fees: 0,
  fillCount: 0,
  lastTimeMs: 0,
  closeTid: 0,
});
function emit(e: Episode, a: Acc, coin: string): HlTrade {
  const entryPrice = e.entrySize > EPS ? e.entryNotional / e.entrySize : 0;
  const exitPrice = a.closeSize > EPS ? a.closeNotional / a.closeSize : 0;
  return {
    coin,
    direction: e.direction,
    entryPrice,
    exitPrice,
    quantity: a.closeSize,
    openTimeMs: e.openTimeMs,
    closeTimeMs: a.lastTimeMs,
    grossPnl: a.grossPnl,
    fees: a.fees,
    funding: 0,
    netPnl: a.grossPnl - a.fees,
    fillCount: a.fillCount,
    openTid: e.openTid,
    closeTid: a.closeTid,
    partialEntry: e.partialEntry,
  };
}

/** 把逐笔成交重建为「往返交易」（一开一平为一个 episode）。外部去重键用平仓 tid。 */
export function reconstructTradesFromFills(fills: HyperliquidFill[]): HlTrade[] {
  const byCoin = new Map<string, HyperliquidFill[]>();
  for (const f of fills) {
    if (!f || typeof f.coin !== 'string' || f.coin.startsWith('@')) continue;
    if ((Number(f.sz) || 0) <= 0) continue;
    const list = byCoin.get(f.coin) ?? [];
    list.push(f);
    byCoin.set(f.coin, list);
  }
  const trades: HlTrade[] = [];
  for (const [coin, raw] of byCoin) {
    const list = orderFillsCausally(raw);
    let episode: Episode | null = null;
    let acc = newAcc();
    let tracked = 0;
    for (const f of list) {
      const sz = Number(f.sz) || 0;
      if (sz <= EPS) continue;
      const px = Number(f.px) || 0;
      const delta = deltaOf(f);
      const fee = Number(f.fee) || 0;
      const cpnl = Number(f.closedPnl) || 0;
      const timeMs = Number(f.time) || 0;
      const tid = Number(f.tid) || 0;
      const rawBefore = Number(f.startPosition);
      const before = Number.isFinite(rawBefore) ? rawBefore : tracked;
      const after = before + delta;
      const beforeSign = samePos(before, 0) ? 0 : Math.sign(before);
      const afterSign = samePos(after, 0) ? 0 : Math.sign(after);
      const sameDir = beforeSign !== 0 && beforeSign === afterSign;
      const flip = beforeSign !== 0 && afterSign !== 0 && beforeSign !== afterSign;
      if (!episode) {
        if (beforeSign !== 0) {
          episode = newEpisode(beforeSign > 0 ? 'LONG' : 'SHORT', Math.abs(before), Math.abs(before) * px, timeMs, tid, true);
        } else if (afterSign !== 0) {
          episode = newEpisode(afterSign > 0 ? 'LONG' : 'SHORT', 0, 0, timeMs, tid, false);
        }
      } else if (flip && (episode.direction === 'LONG' ? 1 : -1) === afterSign) {
        if (acc.closeSize > EPS) trades.push(emit(episode, acc, coin));
        acc = newAcc();
        episode =
          beforeSign !== 0
            ? newEpisode(beforeSign > 0 ? 'LONG' : 'SHORT', Math.abs(before), Math.abs(before) * px, timeMs, tid, true)
            : null;
      }
      if (!episode) {
        tracked = after;
        continue;
      }
      let closedSz = 0;
      let openedSz = 0;
      if (beforeSign !== 0 && beforeSign !== afterSign) {
        closedSz = Math.abs(before);
        openedSz = Math.abs(after);
      } else if (sameDir) {
        if (Math.abs(after) > Math.abs(before)) openedSz = Math.abs(after) - Math.abs(before);
        else closedSz = Math.abs(before) - Math.abs(after);
      } else {
        openedSz = sz;
      }
      const feeClosed = sz > EPS ? fee * (closedSz / sz) : 0;
      const feeOpened = fee - feeClosed;
      if (openedSz > 0) {
        episode.entrySize += openedSz;
        episode.entryNotional += px * openedSz;
      }
      acc.fillCount += 1;
      acc.lastTimeMs = timeMs;
      acc.closeTid = tid;
      if (closedSz > 0) {
        acc.closeSize += closedSz;
        acc.closeNotional += px * closedSz;
        acc.grossPnl += cpnl;
        acc.fees += feeClosed;
      } else {
        acc.fees += fee;
      }
      if (afterSign === 0) {
        if (acc.closeSize > EPS) trades.push(emit(episode, acc, coin));
        episode = null;
        acc = newAcc();
      } else if (flip) {
        if (acc.closeSize > EPS) trades.push(emit(episode, acc, coin));
        episode = newEpisode(afterSign > 0 ? 'LONG' : 'SHORT', openedSz, px * openedSz, timeMs, tid, false);
        acc = newAcc();
        acc.fees += feeOpened;
        acc.fillCount += 1;
        acc.lastTimeMs = timeMs;
        acc.closeTid = tid;
      }
      tracked = after;
    }
  }
  trades.sort((x, y) => x.closeTimeMs - y.closeTimeMs);
  return trades;
}

export async function probeHyperliquid(address: string): Promise<{ ok: boolean; accountValue: string | null; msg?: string }> {
  try {
    const st = await fetchClearinghouseState(address);
    return { ok: true, accountValue: st.marginSummary?.accountValue ?? null };
  } catch (e) {
    return { ok: false, accountValue: null, msg: e instanceof Error ? e.message : String(e) };
  }
}
