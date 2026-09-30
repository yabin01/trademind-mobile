import { useState } from 'react';
import { Card, GhostButton, Input, PrimaryButton, Screen, Segmented, Tag } from '@tm/components/ui';
import { useAppearance } from '@tm/lib/appearance';
import { router } from 'expo-router';
import { createConnection } from '@tm/core/exchange/sync';

export default function AddConnection() {
  const pal = useAppearance();
  const [exchange, setExchange] = useState<'OKX' | 'HYPERLIQUID'>('OKX');
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [wallet, setWallet] = useState('');
  const [simulated, setSimulated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName('');
    setApiKey('');
    setSecretKey('');
    setPassphrase('');
    setWallet('');
    setSimulated(false);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (exchange === 'OKX') {
        await createConnection({
          exchange: 'OKX',
          name: name || 'OKX',
          credentials: { apiKey: apiKey.trim(), secretKey: secretKey.trim(), passphrase: passphrase.trim(), flag: simulated ? '1' : '0' },
        });
      } else {
        await createConnection({
          exchange: 'HYPERLIQUID',
          name: name || 'Hyperliquid',
          credentials: { walletAddress: wallet.trim() },
        });
      }
      reset();
      // 直接跳到连接列表，用户能立刻看到刚加的连接并执行校验/同步
      router.replace('/settings/connections');
    } catch (e) {
      setError(e instanceof Error ? e.message : '添加失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Segmented
        options={[
          { key: 'OKX', label: 'OKX' },
          { key: 'HYPERLIQUID', label: 'Hyperliquid' },
        ]}
        value={exchange}
        onChange={setExchange}
      />

      <Card>
        <Input value={name} onChangeText={setName} placeholder={exchange === 'OKX' ? '连接名称（如 OKX 主账户）' : '连接名称（如 HL 主钱包）'} />

        {exchange === 'OKX' ? (
          <>
            <Input value={apiKey} onChangeText={setApiKey} placeholder="API Key" autoCapitalize="none" />
            <Input value={secretKey} onChangeText={setSecretKey} placeholder="Secret Key" secure autoCapitalize="none" />
            <Input value={passphrase} onChangeText={setPassphrase} placeholder="Passphrase" secure autoCapitalize="none" />
            <GhostButton title={simulated ? '已选：模拟盘（点击切换实盘）' : '已选：实盘（点击切换模拟盘）'} onPress={() => setSimulated((s) => !s)} />
            <Tag text="强烈建议使用「只读」密钥（无交易/提币权限）" color={pal.warn} />
          </>
        ) : (
          <>
            <Input value={wallet} onChangeText={setWallet} placeholder="0x… 钱包地址（公开只读，无需私钥）" autoCapitalize="none" />
            <Tag text="只需公开钱包地址，Chain 上数据天然只读，最安全。" color={pal.up} />
          </>
        )}

        {error ? <Tag text={error} color={pal.down} /> : null}
        <PrimaryButton title={busy ? '添加中…' : '添加连接'} onPress={submit} disabled={busy} loading={busy} />
        <Tag
          text={
            exchange === 'OKX'
              ? '提示：添加后请在连接列表点「校验」。若报 IP 白名单错误，请到 OKX 后台把手机当前网络出口 IP 加入 API 白名单。'
              : '提示：添加后点「同步」即可拉取链上成交记录。'
          }
          color={pal.sub}
        />
      </Card>
    </Screen>
  );
}
