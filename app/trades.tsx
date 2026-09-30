import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Card, ConnPicker, Empty, Input, Screen, Segmented, Tag } from '@tm/components/ui';
import { useAppearance } from '@tm/lib/appearance';
import { fmtDate, fmtPnl, fmtTs } from '@tm/lib/format';
import { closedTrades, filterByWindow } from '@tm/lib/metrics';
import { rangeDays, useSettings, type RangeKey } from '@tm/store/settings';
import { filterByConn, useAllTrades, useConnChoices } from '@tm/store/trades';
import type { UnifiedTrade } from '@trademind/trading-core';

const RANGE_OPTS: { key: RangeKey; label: string }[] = [
  { key: '7d', label: '7天' },
  { key: '30d', label: '30天' },
  { key: '90d', label: '90天' },
  { key: 'all', label: '全部' },
];

export default function Trades() {
  const pal = useAppearance();
  const { trades } = useAllTrades();
  const choices = useConnChoices();
  const range = useSettings((s) => s.range);
  const connId = useSettings((s) => s.connId);
  const setConnId = useSettings((s) => s.setConnId);
  const [search, setSearch] = useState('');

  const list = useMemo(() => {
    let t = filterByConn(trades, choices, connId);
    t = filterByWindow(t, rangeDays(range));
    t = closedTrades(t);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      t = t.filter(
        (x) => x.symbol.toLowerCase().includes(s) || (x.notes ?? '').toLowerCase().includes(s),
      );
    }
    return t.sort((a, b) => new Date(b.closeTime!).getTime() - new Date(a.closeTime!).getTime());
  }, [trades, choices, connId, range, search]);

  const styles = makeStyles(pal);

  return (
    <Screen>
      <ConnPicker choices={choices} value={connId} onChange={setConnId} />
      <Input value={search} onChangeText={setSearch} placeholder="搜索品种 / 备注…" />
      <Segmented options={RANGE_OPTS} value={range} onChange={useSettings.getState().setRange} />
      <FlatList
        data={list}
        keyExtractor={(t) => t.id}
        scrollEnabled={false}
        ListEmptyComponent={<Card><Empty text="该时间窗内没有交易记录" /></Card>}
        renderItem={({ item }) => <TradeRow trade={item} pal={pal} styles={styles} onPress={() => router.push(`/trades/${item.id}`)} />}
      />
    </Screen>
  );
}

function TradeRow({
  trade,
  pal,
  styles,
  onPress,
}: {
  trade: UnifiedTrade;
  pal: ReturnType<typeof useAppearance>;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
}) {
  const up = trade.netPnl >= 0;
  return (
    <Pressable onPress={onPress}>
      <Card>
        <View style={styles.row}>
          <View>
            <View style={styles.symRow}>
              <Text style={[styles.sym, { color: pal.text }]}>{trade.symbol}</Text>
              <Tag text={trade.positionSide} color={trade.positionSide === 'LONG' ? pal.up : pal.down} />
              <Tag text={`${trade.leverage}x`} />
            </View>
            <Text style={[styles.meta, { color: pal.sub }]}>
              平仓 {fmtDate(trade.closeTime)} · 开 {fmtTs(trade.openTime)}
            </Text>
          </View>
          <View style={styles.right}>
            <Text style={[styles.pnl, { color: up ? pal.up : pal.down }]}>{fmtPnl(trade.netPnl)}</Text>
            <Text style={[styles.meta, { color: pal.sub }]}>GP {fmtPnl(trade.grossPnl)}</Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

import { Text } from 'react-native';
function makeStyles(pal: ReturnType<typeof useAppearance>) {
  return StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    symRow: { flexDirection: 'row', alignItems: 'center' },
    sym: { fontSize: 16, fontWeight: '700', marginRight: 6 },
    meta: { fontSize: 12, marginTop: 3 },
    right: { alignItems: 'flex-end' },
    pnl: { fontSize: 16, fontWeight: '700' },
  });
}
