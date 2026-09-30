import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Card, Empty, GhostButton, PrimaryButton, Screen, Tag } from '@tm/components/ui';
import { useAppearance } from '@tm/lib/appearance';
import { fmtDate } from '@tm/lib/format';
import {
  listConnections,
  removeConnection,
  syncConnection,
  validateConnection,
  type ConnectionMeta,
} from '@tm/core/exchange/sync';

export default function Connections() {
  const pal = useAppearance();
  const [conns, setConns] = useState<ConnectionMeta[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useState(() => {
    void refresh();
  });
  async function refresh() {
    setConns(await listConnections());
  }

  async function onValidate(c: ConnectionMeta) {
    setBusy(c.id);
    setMsg(null);
    try {
      const r = await validateConnection(c.id);
      setMsg(r.warnings.join(' ') || (r.permissions.readOnly ? '✅ 只读密钥，安全。' : '已完成校验'));
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '校验失败');
    } finally {
      setBusy(null);
    }
  }

  async function onSync(c: ConnectionMeta) {
    setBusy(c.id);
    setMsg(null);
    try {
      const r = await syncConnection(c.id);
      setMsg(`同步完成：拉取 ${r.fetched} 笔，新增 ${r.inserted} 笔${r.skipped ? `，跳过 ${r.skipped}` : ''}`);
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '同步失败');
    } finally {
      setBusy(null);
    }
  }

  async function onRemove(c: ConnectionMeta) {
    await removeConnection(c.id);
    await refresh();
  }

  return (
    <Screen>
      <PrimaryButton title="添加连接" onPress={() => router.push('/settings/add-connection')} />
      {msg ? (
        <Card>
          <Tag text={msg} color={pal.warn} />
        </Card>
      ) : null}

      {conns.length === 0 ? (
        <Card>
          <Empty text="还没有连接。先添加一个 OKX 只读密钥，或 Hyperliquid 钱包地址。" />
        </Card>
      ) : (
        conns.map((c) => (
          <Card key={c.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: pal.text, fontSize: 16, fontWeight: '700' }}>{c.name}</Text>
                  <Tag text={c.exchange} color={pal.accent} />
                </View>
                <Text style={{ color: pal.sub, fontSize: 12, marginTop: 2 }}>
                  {c.credentialsMasked ?? ''}
                  {c.lastSyncAt ? ` · 上次同步 ${fmtDate(c.lastSyncAt)}` : ''}
                </Text>
              </View>
              <Tag
                text={c.status === 'SUCCESS' ? '已同步' : c.status === 'FAILED' ? '失败' : c.status === 'SYNCING' ? '同步中' : '已连接'}
                color={c.status === 'FAILED' ? pal.down : c.status === 'SUCCESS' ? pal.up : pal.sub}
              />
            </View>

            {c.permissions ? (
              <View style={{ marginTop: 8 }}>
                <Tag
                  text={c.permissions.readOnly ? '只读密钥 ✓' : c.permissions.trade.granted ? '⚠ 可交易' : '可读'}
                  color={c.permissions.readOnly ? pal.up : c.permissions.trade.granted ? pal.down : pal.warn}
                />
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', marginTop: 10 }}>
              <GhostButton title="校验" onPress={() => onValidate(c)} />
              <View style={{ width: 8 }} />
              <GhostButton title={busy === c.id ? '处理中…' : '同步'} onPress={() => onSync(c)} />
              <View style={{ width: 8 }} />
              <GhostButton title="删除" onPress={() => onRemove(c)} />
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

import { Text } from 'react-native';
