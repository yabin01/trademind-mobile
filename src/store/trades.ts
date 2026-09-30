import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { UnifiedTrade } from '@trademind/trading-core';
import { getConnectionChoices, getTradesAsModels, type ConnChoice } from '@tm/db';

/** 全量交易（落库后统一 UTC）。各页面按需按窗口/筛选切分。 */
export function useAllTrades(): { trades: UnifiedTrade[]; reload: () => void; loading: boolean } {
  const [trades, setTrades] = useState<UnifiedTrade[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    try {
      setTrades(getTradesAsModels({}));
    } catch {
      setTrades([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => reload(), [reload]));

  return { trades, reload, loading };
}

/** 连接选择器数据源（每次聚焦刷新，新增/删除连接后即时生效） */
export function useConnChoices(): ConnChoice[] {
  const [choices, setChoices] = useState<ConnChoice[]>([]);
  useFocusEffect(
    useCallback(() => {
      try {
        setChoices(getConnectionChoices());
      } catch {
        setChoices([]);
      }
    }, []),
  );
  return choices;
}

/** 按所选连接过滤交易（connId=null 表示全部） */
export function filterByConn(trades: UnifiedTrade[], choices: ConnChoice[], connId: string | null): UnifiedTrade[] {
  if (connId == null) return trades;
  const ids = new Set(choices.find((c) => c.id === connId)?.accountIds ?? []);
  return trades.filter((t) => ids.has(t.accountId));
}
