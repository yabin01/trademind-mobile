import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { UnifiedTrade } from '@trademind/trading-core';
import { getTradesAsModels } from '@tm/db';

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
