import { computeCoreMetrics, type CoreMetrics } from '@trademind/analytics';
import type { UnifiedTrade } from '@trademind/trading-core';
import { dayKeyBeijing } from './format';

export { computeCoreMetrics };
export type { CoreMetrics };

export function closedTrades(trades: UnifiedTrade[]): UnifiedTrade[] {
  return trades.filter((t) => t.closeTime != null);
}

export function filterByWindow(trades: UnifiedTrade[], days: number | null): UnifiedTrade[] {
  if (days === null) return trades;
  const from = Date.now() - days * 86_400_000;
  return trades.filter((t) => new Date(t.openTime).getTime() >= from);
}

export interface DailyPoint {
  day: string;
  pnl: number;
  trades: number;
  cumulative: number;
}

/** 按北京时间收盘日聚合的日盈亏序列（用于走势图） */
export function dailyPnlSeries(trades: UnifiedTrade[]): DailyPoint[] {
  const map = new Map<string, { pnl: number; trades: number }>();
  for (const t of closedTrades(trades)) {
    const day = dayKeyBeijing(t.closeTime as string);
    const e = map.get(day) ?? { pnl: 0, trades: 0 };
    e.pnl += t.netPnl;
    e.trades += 1;
    map.set(day, e);
  }
  const days = [...map.keys()].sort();
  let cum = 0;
  return days.map((d) => {
    cum += map.get(d)!.pnl;
    return { day: d, pnl: map.get(d)!.pnl, trades: map.get(d)!.trades, cumulative: cum };
  });
}

/** 按符号聚合（用于占比/分布） */
export function bySymbol(trades: UnifiedTrade[]): { symbol: string; pnl: number; trades: number }[] {
  const map = new Map<string, { pnl: number; trades: number }>();
  for (const t of closedTrades(trades)) {
    const e = map.get(t.symbol) ?? { pnl: 0, trades: 0 };
    e.pnl += t.netPnl;
    e.trades += 1;
    map.set(t.symbol, e);
  }
  return [...map.entries()]
    .map(([symbol, v]) => ({ symbol, ...v }))
    .sort((a, b) => b.pnl - a.pnl);
}
