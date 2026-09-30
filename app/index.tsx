import { useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { router } from 'expo-router';
import { Card, ConnPicker, Empty, Screen, SectionTitle, Segmented, StatTile } from '@tm/components/ui';
import { useAppearance } from '@tm/lib/appearance';
import { fmtNum, fmtPct, fmtPnl, rangeFromIso } from '@tm/lib/format';
import { computeCoreMetrics, dailyPnlSeries, filterByWindow } from '@tm/lib/metrics';
import { rangeDays, useSettings, type RangeKey } from '@tm/store/settings';
import { filterByConn, useAllTrades, useConnChoices } from '@tm/store/trades';
import { listConnections, syncConnection } from '@tm/core/exchange/sync';
import { useState } from 'react';
import { PrimaryButton } from '@tm/components/ui';

const RANGE_OPTS: { key: RangeKey; label: string }[] = [
  { key: '7d', label: '7天' },
  { key: '30d', label: '30天' },
  { key: '90d', label: '90天' },
  { key: 'all', label: '全部' },
];

export default function Dashboard() {
  const pal = useAppearance();
  const { trades } = useAllTrades();
  const choices = useConnChoices();
  const range = useSettings((s) => s.range);
  const setRange = useSettings((s) => s.setRange);
  const connId = useSettings((s) => s.connId);
  const setConnId = useSettings((s) => s.setConnId);
  const [syncing, setSyncing] = useState(false);

  const scoped = useMemo(() => filterByConn(trades, choices, connId), [trades, choices, connId]);
  const windowTrades = useMemo(() => filterByWindow(scoped, rangeDays(range)), [scoped, range]);
  const metrics = useMemo(() => computeCoreMetrics(windowTrades), [windowTrades]);
  const series = useMemo(() => dailyPnlSeries(windowTrades), [windowTrades]);

  const chartWidth = Dimensions.get('window').width - 32;

  async function quickSync() {
    setSyncing(true);
    try {
      const conns = await listConnections();
      const targets = connId ? conns.filter((c) => c.id === connId) : conns;
      for (const c of targets) {
        if (connId || c.status !== 'FAILED') await syncConnection(c.id).catch(() => {});
      }
    } finally {
      setSyncing(false);
    }
  }

  if (trades.length === 0) {
    return (
      <Screen>
        <Card style={{ marginTop: 8 }}>
          <Empty
            icon="bar-chart-outline"
            text="还没有交易数据"
            hint="绑定交易所自动同步，或导入 OKX 历史 CSV（可回溯到 2021 年）"
          />
        </Card>
        <PrimaryButton title="绑定 OKX / Hyperliquid" onPress={() => router.push('/settings/add-connection')} />
        <PrimaryButton title="导入历史 CSV" onPress={() => router.push('/settings/import')} />
      </Screen>
    );
  }

  if (scoped.length === 0) {
    return (
      <Screen>
        <ConnPicker choices={choices} value={connId} onChange={setConnId} />
        <Card style={{ marginTop: 8 }}>
          <Empty icon="swap-horizontal-outline" text="该连接暂无交易数据" hint="先去连接管理点「同步」，或切回「全部」查看汇总" />
        </Card>
      </Screen>
    );
  }

  const pfText = metrics.profitFactor === Infinity ? '∞' : fmtNum(metrics.profitFactor);

  return (
    <Screen>
      <ConnPicker choices={choices} value={connId} onChange={setConnId} />
      <Segmented options={RANGE_OPTS} value={range} onChange={setRange} />

      <Card>
        <View style={styles.kpiRow}>
          <StatTile label="净盈亏" value={fmtPnl(metrics.netPnl)} color={pal[metrics.netPnl >= 0 ? 'up' : 'down']} />
          <StatTile label="胜率" value={fmtPct(metrics.winRate)} align="right" />
        </View>
        <View style={styles.kpiRow}>
          <StatTile label="盈利因子" value={pfText} />
          <StatTile label="交易数" value={String(metrics.closedTrades)} align="right" />
        </View>
        <View style={styles.kpiRow}>
          <StatTile label="平均盈利" value={fmtPnl(metrics.avgWin)} color={pal.up} />
          <StatTile label="平均亏损" value={fmtPnl(-metrics.avgLoss)} color={pal.down} align="right" />
        </View>
        <View style={styles.kpiRow}>
          <StatTile label="期望值" value={fmtPnl(metrics.expectancy)} color={pal[metrics.expectancy >= 0 ? 'up' : 'down']} />
          <StatTile label="手续费" value={fmtPnl(-metrics.fees)} align="right" />
        </View>
      </Card>

      <SectionTitle text="累计净值曲线（北京时间）" />
      <Card style={{ padding: 4 }}>
        {series.length > 1 ? (
          <LineChart
            data={{
              labels: series.map((p) => p.day.slice(5)),
              datasets: [{ data: series.map((p) => Number(p.cumulative.toFixed(2))) }],
            }}
            width={chartWidth - 8}
            height={170}
            withDots={false}
            withInnerLines={false}
            withVerticalLines={false}
            chartConfig={{
              backgroundColor: pal.card,
              backgroundGradientFrom: pal.card,
              backgroundGradientTo: pal.card,
              decimalPlaces: 0,
              color: (opacity = 1) => pal.accent,
              labelColor: () => pal.sub,
              style: { borderRadius: 12 },
            }}
            bezier
            style={{ borderRadius: 12 }}
          />
        ) : (
          <Empty text="该时间窗内无已平仓交易" />
        )}
      </Card>

      <PrimaryButton
        title={syncing ? '同步中…' : connId ? '同步当前连接' : '同步全部连接'}
        onPress={quickSync}
        loading={syncing}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
});
