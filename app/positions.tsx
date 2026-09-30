import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Card, ConnPicker, Empty, Input, PrimaryButton, Screen, SectionTitle, Tag } from '@tm/components/ui';
import { useAppearance } from '@tm/lib/appearance';
import { fmtNum, fmtPnl, pnlColor } from '@tm/lib/format';
import { getAccounts, getConnectionChoices, getPositionNote, upsertPositionNote } from '@tm/db';
import { useSettings } from '@tm/store/settings';
import {
  fetchLivePositions,
  listConnections,
  type LivePosition,
} from '@tm/core/exchange/sync';

export default function Positions() {
  const pal = useAppearance();
  const [positions, setPositions] = useState<(LivePosition & { connId: string; connName: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<(LivePosition & { connId: string; connName: string }) | null>(null);
  const [noteText, setNoteText] = useState('');
  const [tagText, setTagText] = useState('');
  const [savedTag, setSavedTag] = useState<string[]>([]);
  const connId = useSettings((s) => s.connId);
  const setConnId = useSettings((s) => s.setConnId);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const conns = await listConnections();
      const accounts = getAccounts() as unknown as { id: string; connection_id?: string; connectionId?: string }[];
      const all: (LivePosition & { connId: string; connName: string })[] = [];
      for (const c of conns) {
        try {
          const ps = await fetchLivePositions(c.id);
          // 行键是 snake_case 列名（connection_id），驼峰兜底
          const accId =
            accounts.find((a) => (a.connection_id ?? a.connectionId) === c.id)?.id ?? c.id;
          for (const p of ps) {
            all.push({ ...p, accountId: accId, connId: c.id, connName: c.name });
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : '部分连接拉取失败');
        }
      }
      setPositions(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openAnnot(p: LivePosition & { connId: string; connName: string }) {
    setSel(p);
    const existing = getPositionNote(p.accountId, p.symbol, p.positionSide);
    setNoteText(existing?.notes ?? '');
    const tags = existing ? JSON.parse(existing.tags as unknown as string) as string[] : [];
    setSavedTag(tags);
    setTagText('');
  }

  function saveAnnot() {
    if (!sel) return;
    const newTags = tagText
      .split(/[;|,，]/)
      .map((t) => t.trim())
      .filter(Boolean);
    upsertPositionNote({
      accountId: sel.accountId,
      symbol: sel.symbol,
      positionSide: sel.positionSide,
      entryTags: [...new Set([...savedTag, ...newTags])],
      notes: noteText,
    });
    setSel(null);
  }

  const styles = makeStyles(pal);

  if (loading) {
    return (
      <Screen>
        <Card>
          <ActivityIndicator color={pal.accent} />
        </Card>
      </Screen>
    );
  }

  const visible = connId ? positions.filter((p) => p.connId === connId) : positions;
  const connChoices = useMemo(() => {
    try {
      return getConnectionChoices();
    } catch {
      return [];
    }
  }, [loading]);

  return (
    <Screen>
      <ConnPicker
        choices={connChoices}
        value={connId}
        onChange={setConnId}
      />
      <View style={styles.headerRow}>
        <SectionTitle text={`实时持仓（${visible.length}）`} />
        <Pressable onPress={() => void load()}>
          <Tag text="刷新" color={pal.accent} />
        </Pressable>
      </View>

      {error ? <Card><Empty icon="cloud-offline-outline" text="拉取实时持仓失败" hint={error} /></Card> : null}
      {visible.length === 0 && !error ? (
        <Card>
          <Empty
            icon="layers-outline"
            text="当前没有未平仓合约"
            hint="去「设置」绑定交易所并同步后，这里会实时显示持仓"
          />
        </Card>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(p, i) => `${p.connectionId}-${p.symbol}-${p.positionSide}-${i}`}
          scrollEnabled={false}
          renderItem={({ item }) => {
            const up = item.unrealizedPnl >= 0;
            return (
              <Card onPress={() => openAnnot(item)}>
                <View style={styles.posTop}>
                  <View>
                    <View style={styles.symRow}>
                      <Text style={[styles.sym, { color: pal.text }]}>{item.symbol}</Text>
                      <Tag text={item.positionSide} color={item.positionSide === 'LONG' ? pal.up : pal.down} />
                      <Tag text={`${item.leverage}x`} />
                    </View>
                    <Text style={[styles.conn, { color: pal.sub }]}>{item.connName}</Text>
                  </View>
                  <View style={styles.right}>
                    <Text style={[styles.pnl, { color: pnlColor(item.unrealizedPnl, pal.up, pal.down, pal.sub) }]}>
                      {fmtPnl(item.unrealizedPnl)}
                    </Text>
                    <Text style={[styles.sub, { color: pal.sub }]}>未实现</Text>
                  </View>
                </View>
                <View style={styles.grid}>
                  <Cell label="开仓价" value={fmtNum(item.entryPrice)} pal={pal} />
                  <Cell label="标记价" value={fmtNum(item.markPrice)} pal={pal} />
                  <Cell label="数量" value={fmtNum(item.size, 4)} pal={pal} />
                  <Cell label="名义价值" value={`$${fmtNum(item.notionalUsd)}`} pal={pal} />
                  <Cell label="强平价" value={item.liqPrice ? fmtNum(item.liqPrice) : '—'} pal={pal} />
                  <Cell label="保证金" value={fmtNum(item.margin)} pal={pal} />
                </View>
                <View style={styles.noteHint}>
                  <Text style={[styles.noteHintText, { color: pal.sub }]}>点击添加入场理由 / 标注 →</Text>
                </View>
              </Card>
            );
          }}
        />
      )}

      {sel ? (
        <Card style={styles.sheet}>
          <SectionTitle text={`标注 ${sel.symbol} ${sel.positionSide}`} />
          {savedTag.length > 0 ? (
            <View style={styles.tagWrap}>
              {savedTag.map((t) => (
                <Tag key={t} text={t} color={pal.accent} />
              ))}
            </View>
          ) : null}
          <Input value={tagText} onChangeText={setTagText} placeholder="加标签，逗号分隔（如 突破, 顺势）" />
          <Input value={noteText} onChangeText={setNoteText} placeholder="入场理由 / 计划…" multiline />
          <PrimaryButton title="保存标注" onPress={saveAnnot} />
          <Pressable onPress={() => setSel(null)}>
            <Text style={[styles.cancel, { color: pal.sub }]}>取消</Text>
          </Pressable>
        </Card>
      ) : null}
    </Screen>
  );
}

// 模块级布局样式：Cell 在组件外定义，不能引用组件内的 styles（会 ReferenceError）
const cellStyles = StyleSheet.create({
  cell: { width: '33%', marginBottom: 8 },
  cellLabel: { fontSize: 11 },
  cellValue: { fontSize: 13, fontWeight: '600' },
});

function Cell({ label, value, pal }: { label: string; value: string; pal: ReturnType<typeof useAppearance> }) {
  return (
    <View style={cellStyles.cell}>
      <Text style={[cellStyles.cellLabel, { color: pal.sub }]}>{label}</Text>
      <Text style={[cellStyles.cellValue, { color: pal.text }]}>{value}</Text>
    </View>
  );
}

import { Text } from 'react-native';
function makeStyles(pal: ReturnType<typeof useAppearance>) {
  return StyleSheet.create({
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    posTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    symRow: { flexDirection: 'row', alignItems: 'center' },
    sym: { fontSize: 16, fontWeight: '700', marginRight: 6 },
    conn: { fontSize: 12, marginTop: 2 },
    right: { alignItems: 'flex-end' },
    pnl: { fontSize: 16, fontWeight: '700' },
    sub: { fontSize: 11 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
    cell: { width: '33%', marginBottom: 8 },
    cellLabel: { fontSize: 11 },
    cellValue: { fontSize: 13, fontWeight: '600' },
    noteHint: { marginTop: 6 },
    noteHintText: { fontSize: 12 },
    tagWrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 },
    sheet: { marginTop: 8 },
    cancel: { textAlign: 'center', marginTop: 8, fontSize: 14 },
  });
}
