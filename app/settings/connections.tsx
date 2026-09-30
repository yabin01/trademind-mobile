import { useCallback, useState } from 'react';
import { View, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
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
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // 每次聚焦（包括从添加页返回）都重新读取，避免「加了但列表不显示」
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      listConnections()
        .then((rows) => {
          if (alive) {
            setConns(rows);
            setLoaded(true);
          }
        })
        .catch(() => {
          if (alive) setLoaded(true);
        });
      return () => {
        alive = false;
      };
    }, []),
  );

  async function refresh() {
    setConns(await listConnections());
  }

  async function onValidate(c: ConnectionMeta) {
    setBusy(c.id);
    setMsg(null);
    try {
      const r = await validateConnection(c.id);
      const parts: string[] = [];
      if (r.permissions.read.ok) parts.push('✅ 读取正常');
      else parts.push(`❌ 读取失败：${r.permissions.read.msg ?? '未知错误'}`);
      parts.push(r.permissions.trade.granted ? '⚠️ 可交易' : '不可交易（安全）');
      parts.push(r.permissions.withdraw.granted ? '🚨 可提币，立即换只读密钥！' : '不可提币');
      setMsg(parts.join(' · ') + (r.warnings.length ? ` | ${r.warnings.join(' ')}` : ''));
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
      setMsg(
        `同步完成：拉取 ${r.fetched} 笔，新增 ${r.inserted} 笔${r.skipped ? `，跳过 ${r.skipped}` : ''}` +
          (r.truncated ? '（历史区间过大，仅拉到最近部分）' : ''),
      );
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
          <Text style={{ color: pal.text, fontSize: 13, lineHeight: 20 }}>{msg}</Text>
        </Card>
      ) : null}

      {!loaded ? (
        <Card>
          <Empty text="读取中…" />
        </Card>
      ) : conns.length === 0 ? (
        <Card>
          <Empty text="还没有连接。先添加一个 OKX 只读密钥，或 Hyperliquid 钱包地址。" />
        </Card>
      ) : (
        conns.map((c) => (
          <Card key={c.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexShrink: 1 }}>
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

            {c.lastError ? (
              <View style={{ marginTop: 6 }}>
                <Text style={{ color: pal.down, fontSize: 12 }}>{c.lastError}</Text>
              </View>
            ) : null}

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
