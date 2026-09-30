import { useState } from 'react';
import { View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Card, Input, PrimaryButton, Screen, Segmented, Tag } from '@tm/components/ui';
import { useAppearance } from '@tm/lib/appearance';
import { mapCsvToTrades } from '@trademind/trading-core';
import { ensureAccount, importTrades, uid } from '@tm/db';

export default function CsvImport() {
  const pal = useAppearance();
  const [exchange, setExchange] = useState<'OKX' | 'HYPERLIQUID' | 'CSV'>('OKX');
  const [name, setName] = useState('CSV 导入');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  async function pick() {
    setBusy(true);
    setResult(null);
    setErrors([]);
    try {
      const doc = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain'], copyToCacheDirectory: true });
      if (doc.canceled || !doc.assets?.[0]) {
        setBusy(false);
        return;
      }
      const uri = doc.assets[0].uri;
      const text = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
      const acc = ensureAccount('csv-import', name || 'CSV 导入', exchange, exchange === 'HYPERLIQUID' ? 'USDC' : 'USDT');
      const { trades, errors: errs } = mapCsvToTrades(text, {
        workspaceId: 'local',
        accountId: acc.id,
        exchange,
      });
      const { inserted, skipped } = importTrades(trades);
      setResult(`解析 ${trades.length} 笔，入库 ${inserted} 笔，跳过（重复）${skipped} 笔。`);
      setErrors(errs.slice(0, 8));
    } catch (e) {
      setResult(e instanceof Error ? e.message : '导入失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card>
        <Segmented
          options={[
            { key: 'OKX', label: 'OKX' },
            { key: 'HYPERLIQUID', label: 'Hyperliquid' },
            { key: 'CSV', label: '其他/手动' },
          ]}
          value={exchange}
          onChange={setExchange}
        />
        <Input value={name} onChangeText={setName} placeholder="账户名称（导入后显示在交易列表）" />
        <Tag text="从 OKX 网页「账单/历史成交」导出 CSV，发到手机后在此选择即可全量入库。" color={pal.accent} />
        <PrimaryButton title={busy ? '导入中…' : '选择 CSV 文件'} onPress={pick} disabled={busy} loading={busy} />
      </Card>

      {result ? (
        <Card>
          <Tag text={result} color={pal.up} />
        </Card>
      ) : null}

      {errors.length > 0 ? (
        <Card>
          <View>
            {errors.map((e, i) => (
              <Text key={i} style={{ color: pal.down, fontSize: 12, marginBottom: 4 }}>
                · {e}
              </Text>
            ))}
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

import { Text } from 'react-native';
