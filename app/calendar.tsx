import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card, Input, PrimaryButton, Screen, SectionTitle, Tag } from '@tm/components/ui';
import { useAppearance } from '@tm/lib/appearance';
import { dayKeyBeijing, fmtDate, fmtPnl, fmtTs } from '@tm/lib/format';
import { closedTrades } from '@tm/lib/metrics';
import { getDiaryNote, upsertDiaryNote } from '@tm/db';
import { useAllTrades } from '@tm/store/trades';
import type { UnifiedTrade } from '@trademind/trading-core';

const WEEK = ['一', '二', '三', '四', '五', '六', '日'];

export default function Calendar() {
  const pal = useAppearance();
  const { trades } = useAllTrades();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const [selDay, setSelDay] = useState<string | null>(null);

  const dayPnl = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of closedTrades(trades)) {
      const k = dayKeyBeijing(t.closeTime as string);
      map.set(k, (map.get(k) ?? 0) + t.netPnl);
    }
    return map;
  }, [trades]);

  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // 周一=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const styles = makeStyles(pal);

  const selTrades = useMemo(
    () => (selDay ? closedTrades(trades).filter((t) => dayKeyBeijing(t.closeTime as string) === selDay) : []),
    [selDay, trades],
  );
  const diary = selDay ? getDiaryNote('DAY', selDay) : null;

  function shift(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 0) {
      m = 11;
      y--;
    } else if (m > 11) {
      m = 0;
      y++;
    }
    setYear(y);
    setMonth(m);
    setSelDay(null);
  }

  return (
    <Screen>
      <View style={styles.nav}>
        <Pressable onPress={() => shift(-1)}>
          <Text style={[styles.navBtn, { color: pal.accent }]}>‹</Text>
        </Pressable>
        <Text style={[styles.navTitle, { color: pal.text }]}>
          {year} 年 {month + 1} 月
        </Text>
        <Pressable onPress={() => shift(1)}>
          <Text style={[styles.navBtn, { color: pal.accent }]}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEK.map((w) => (
          <Text key={w} style={[styles.weekCell, { color: pal.sub }]}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <View key={`e${i}`} style={styles.cell} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const d = i + 1;
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const pnl = dayPnl.get(key);
          const has = pnl !== undefined;
          const selected = selDay === key;
          return (
            <Pressable key={key} onPress={() => setSelDay(key)} style={styles.cell}>
              <View style={[styles.dayBox, { borderColor: selected ? pal.accent : pal.border, backgroundColor: has ? (pnl! >= 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)') : pal.card }]}>
                <Text style={[styles.dayNum, { color: pal.text }]}>{d}</Text>
                {has ? (
                  <Text style={[styles.dayPnl, { color: pnl! >= 0 ? pal.up : pal.down }]}>{fmtPnl(pnl!, 0)}</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {selDay ? (
        <>
          <SectionTitle text={`${selDay} 复盘`} />
          <Card>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((r) => (
                <Pressable key={r} onPress={() => upsertDiaryNote({ scope: 'DAY', periodKey: selDay, rating: r })}>
                  <View style={[styles.star, { backgroundColor: diary?.rating === r ? pal.accent : pal.bg, borderColor: pal.border }]}>
                    <Text style={{ color: diary?.rating === r ? '#fff' : pal.sub }}>{r}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
            <Input
              value={diary?.content ?? ''}
              onChangeText={(t) => upsertDiaryNote({ scope: 'DAY', periodKey: selDay, content: t })}
              placeholder="今日复盘：市场、执行、纪律…"
              multiline
            />
            <PrimaryButton title="保存复盘" onPress={() => upsertDiaryNote({ scope: 'DAY', periodKey: selDay, content: diary?.content ?? '' })} />
          </Card>

          <SectionTitle text={`当日交易（${selTrades.length}）`} />
          {selTrades.length === 0 ? (
            <Card>
              <Tag text="当日无已平仓交易" />
            </Card>
          ) : (
            selTrades.map((t) => <TradeMini key={t.id} trade={t} pal={pal} styles={styles} />)
          )}
        </>
      ) : null}
    </Screen>
  );
}

function TradeMini({ trade, pal, styles }: { trade: UnifiedTrade; pal: ReturnType<typeof useAppearance>; styles: ReturnType<typeof makeStyles> }) {
  return (
    <Card>
      <View style={styles.miniRow}>
        <Text style={[styles.miniSym, { color: pal.text }]}>{trade.symbol}</Text>
        <Tag text={trade.positionSide} color={trade.positionSide === 'LONG' ? pal.up : pal.down} />
        <View style={{ flex: 1 }} />
        <Text style={[styles.miniPnl, { color: trade.netPnl >= 0 ? pal.up : pal.down }]}>{fmtPnl(trade.netPnl)}</Text>
      </View>
      <Text style={[styles.miniMeta, { color: pal.sub }]}>平仓 {fmtDate(trade.closeTime)} · 开 {fmtTs(trade.openTime)}</Text>
    </Card>
  );
}

import { Text } from 'react-native';
function makeStyles(pal: ReturnType<typeof useAppearance>) {
  return StyleSheet.create({
    nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    navBtn: { fontSize: 26, fontWeight: '700', paddingHorizontal: 12 },
    navTitle: { fontSize: 17, fontWeight: '700' },
    weekRow: { flexDirection: 'row', marginBottom: 4 },
    weekCell: { flex: 1, textAlign: 'center', fontSize: 12 },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: '14.28%', padding: 2 },
    dayBox: { borderWidth: 1, borderRadius: 8, padding: 4, minHeight: 46, alignItems: 'center' },
    dayNum: { fontSize: 13, fontWeight: '600' },
    dayPnl: { fontSize: 10, marginTop: 2 },
    ratingRow: { flexDirection: 'row', marginBottom: 10 },
    star: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, marginRight: 8, alignItems: 'center', justifyContent: 'center' },
    miniRow: { flexDirection: 'row', alignItems: 'center' },
    miniSym: { fontSize: 15, fontWeight: '700', marginRight: 6 },
    miniPnl: { fontSize: 15, fontWeight: '700' },
    miniMeta: { fontSize: 12, marginTop: 3, color: pal.sub },
  });
}
