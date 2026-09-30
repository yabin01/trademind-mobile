import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Card, GhostButton, Input, PrimaryButton, Row, Screen, SectionTitle, Tag } from '@tm/components/ui';
import { useAppearance } from '@tm/lib/appearance';
import { fmtDate, fmtNum, fmtPnl, fmtTs, pnlColor } from '@tm/lib/format';
import { getTradeById, rowToTrade, updateTrade } from '@tm/db';
import type { UnifiedTrade } from '@trademind/trading-core';

export default function TradeDetail() {
  const pal = useAppearance();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trade, setTrade] = useState<UnifiedTrade | null>(null);
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    const row = getTradeById(id);
    if (row) {
      const t = rowToTrade(row);
      setTrade(t);
      setNotes(t.notes ?? '');
      setTags((t.tags ?? []).join(', '));
    }
  }, [id]);

  if (!trade) {
    return (
      <Screen>
        <Card>
          <Tag text="未找到该笔交易" />
        </Card>
      </Screen>
    );
  }

  const up = trade.netPnl >= 0;
  const styles = makeStyles(pal);

  function save() {
    const tagArr = tags
      .split(/[;|,，]/)
      .map((t) => t.trim())
      .filter(Boolean);
    updateTrade(trade!.id, { notes, tags: tagArr });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function toggleArchive() {
    updateTrade(trade!.id, { archived: !trade!.archived });
    setTrade({ ...trade!, archived: !trade!.archived });
  }

  return (
    <Screen>
      <View style={styles.head}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: pal.accent }]}>‹ 返回</Text>
        </Pressable>
        <Tag text={trade.exchange} />
        {trade.archived ? <Tag text="已归档" color={pal.warn} /> : null}
      </View>

      <Card>
        <View style={styles.titleRow}>
          <Text style={[styles.sym, { color: pal.text }]}>{trade.symbol}</Text>
          <Tag text={trade.positionSide} color={trade.positionSide === 'LONG' ? pal.up : pal.down} />
          <Tag text={`${trade.leverage}x`} />
        </View>
        <Text style={[styles.bigPnl, { color: pnlColor(trade.netPnl, pal.up, pal.down, pal.text) }]}>
          {fmtPnl(trade.netPnl)}
        </Text>
      </Card>

      <SectionTitle text="价格与数量" />
      <Card>
        <Row label="开仓价" value={fmtNum(trade.entryPrice)} />
        <Row label="平仓价" value={fmtNum(trade.exitPrice)} />
        <Row label="数量" value={fmtNum(trade.quantity, 4)} />
        <Row label="开仓时间" value={fmtTs(trade.openTime, true)} />
        <Row label="平仓时间" value={trade.closeTime ? fmtTs(trade.closeTime, true) : '持仓中'} />
      </Card>

      <SectionTitle text="盈亏分解" />
      <Card>
        <Row label="毛盈亏 GP" value={fmtPnl(trade.grossPnl)} color={pnlColor(trade.grossPnl, pal.up, pal.down, pal.text)} />
        <Row label="手续费" value={fmtPnl(-trade.fees)} color={pal.down} />
        <Row label="资金费" value={fmtPnl(-trade.funding)} color={pal.down} />
        <Row label="净盈亏" value={fmtPnl(trade.netPnl)} color={pnlColor(trade.netPnl, pal.up, pal.down, pal.text)} />
        <Row label="R 倍数" value={trade.rr != null ? fmtNum(trade.rr, 2) : '—'} />
      </Card>

      <SectionTitle text="标注与复盘" />
      <Card>
        <Input value={tags} onChangeText={setTags} placeholder="标签，逗号分隔（如 突破, 顺势）" />
        <Input value={notes} onChangeText={setNotes} placeholder="交易备注 / 复盘…" multiline />
        <PrimaryButton title={saved ? '已保存 ✓' : '保存'} onPress={save} />
        <GhostButton title={trade.archived ? '取消归档' : '归档（移出统计）'} onPress={toggleArchive} />
      </Card>
    </Screen>
  );
}

import { Text } from 'react-native';
function makeStyles(pal: ReturnType<typeof useAppearance>) {
  return StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    back: { fontSize: 15, fontWeight: '600' },
    titleRow: { flexDirection: 'row', alignItems: 'center' },
    sym: { fontSize: 22, fontWeight: '800', marginRight: 8 },
    bigPnl: { fontSize: 30, fontWeight: '800', marginTop: 6 },
  });
}
