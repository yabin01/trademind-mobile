import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Card, Input, Screen, Segmented, Tag } from '@tm/components/ui';
import { useAppearance } from '@tm/lib/appearance';
import { analyze, type CoachAnswer } from '@tm/lib/coach';
import { rangeDays, useSettings, type RangeKey } from '@tm/store/settings';
import { useAllTrades } from '@tm/store/trades';

const RANGE_OPTS: { key: RangeKey; label: string }[] = [
  { key: '7d', label: '7天' },
  { key: '30d', label: '30天' },
  { key: '90d', label: '90天' },
  { key: 'all', label: '全部' },
];

const QUICK = ['本周概览', '最大亏损交易', '连亏纪律', '杠杆风险', '品种表现'];

interface Msg {
  role: 'user' | 'coach';
  text: string;
  refs?: string[];
}

export default function Coach() {
  const pal = useAppearance();
  const { trades } = useAllTrades();
  const range = useSettings((s) => s.range);
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'coach', text: '我是你的交易教练（离线版）。所有结论都来自你的真实数据库，不虚构。点下面的快捷问题，或输入你的问题。' },
  ]);

  const styles = makeStyles(pal);

  function ask(q: string) {
    if (!q.trim()) return;
    const answer: CoachAnswer = analyze(trades, rangeDays(range), q);
    setMsgs((m) => [...m, { role: 'user', text: q }, { role: 'coach', text: answer.text, refs: answer.refs }]);
    setInput('');
  }

  const tradeMap = useMemo(() => new Map(trades.map((t) => [t.id, t])), [trades]);

  return (
    <Screen style={{ paddingBottom: 16 }}>
      <Segmented options={RANGE_OPTS} value={range} onChange={useSettings.getState().setRange} />

      <View style={styles.chips}>
        {QUICK.map((q) => (
          <Pressable key={q} onPress={() => ask(q)}>
            <Tag text={q} color={pal.accent} />
          </Pressable>
        ))}
      </View>

      <View style={{ marginTop: 4 }}>
        {msgs.map((m, i) => (
          <View key={i} style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.coachBubble]}>
            <Text style={[styles.bubbleText, { color: m.role === 'user' ? '#fff' : pal.text }]}>{m.text}</Text>
            {m.refs && m.refs.length > 0 ? (
              <View style={styles.refWrap}>
                {m.refs.map((rid) => {
                  const t = tradeMap.get(rid);
                  return (
                    <Pressable key={rid} onPress={() => router.push(`/trades/${rid}`)}>
                      <View style={[styles.refChip, { borderColor: pal.border }]}>
                        <Text style={[styles.refText, { color: pal.accent }]}>
                          查看 {t ? t.symbol : '交易'} →
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        ))}
      </View>

      <View style={styles.inputBar}>
        <Input value={input} onChangeText={setInput} placeholder="问教练，例如：我最近纪律有问题吗？" />
        <Pressable onPress={() => ask(input)} style={[styles.send, { backgroundColor: pal.accent }]}>
          <Text style={styles.sendText}>问</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

import { Text } from 'react-native';
function makeStyles(pal: ReturnType<typeof useAppearance>) {
  return StyleSheet.create({
    chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
    bubble: { borderRadius: 12, padding: 12, marginBottom: 10, maxWidth: '92%' },
    userBubble: { backgroundColor: pal.accent, alignSelf: 'flex-end' },
    coachBubble: { backgroundColor: pal.card, borderWidth: 1, borderColor: pal.border, alignSelf: 'flex-start' },
    bubbleText: { fontSize: 14, lineHeight: 20 },
    refWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
    refChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginRight: 6, marginTop: 4 },
    refText: { fontSize: 12, fontWeight: '600' },
    inputBar: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },
    send: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginLeft: 8, marginBottom: 10 },
    sendText: { color: '#fff', fontWeight: '700' },
  });
}
