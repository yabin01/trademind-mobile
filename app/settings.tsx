import { View } from 'react-native';
import { router } from 'expo-router';
import { Card, GhostButton, Screen, SectionTitle } from '@tm/components/ui';
import { useAppearance } from '@tm/lib/appearance';
import { useSettings } from '@tm/store/settings';
import { Tag } from '@tm/components/ui';

export default function Settings() {
  const pal = useAppearance();
  const mode = useSettings((s) => s.mode);
  const toggleMode = useSettings((s) => s.toggleMode);

  return (
    <Screen>
      <SectionTitle text="外观" />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Tag text={`当前：${mode === 'light' ? '浅色' : '深色'}`} />
          <GhostButton title={mode === 'light' ? '切换到深色' : '切换到浅色'} onPress={toggleMode} />
        </View>
      </Card>

      <SectionTitle text="数据源" />
      <Card onPress={() => router.push('/settings/connections')}>
        <RowArrow label="交易所连接" sub="OKX / Hyperliquid 绑定、同步、权限校验" pal={pal} />
      </Card>
      <Card onPress={() => router.push('/settings/add-connection')}>
        <RowArrow label="添加连接" sub="新增一个只读交易所连接" pal={pal} />
      </Card>
      <Card onPress={() => router.push('/settings/import')}>
        <RowArrow label="导入 CSV" sub="从 OKX 网页导出历史成交，一键全量入库" pal={pal} />
      </Card>

      <SectionTitle text="关于" />
      <Card>
        <Tag text="离线优先 · 数据不出手机" color={pal.accent} />
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: pal.sub, fontSize: 13, lineHeight: 19 }}>
            交易所凭证保存在安卓 Keystore，无需服务端。与桌面端 TradeMind 仓库相互独立。
          </Text>
        </View>
      </Card>
    </Screen>
  );
}

import { Text } from 'react-native';
function RowArrow({ label, sub, pal }: { label: string; sub: string; pal: ReturnType<typeof useAppearance> }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: pal.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: pal.sub, fontSize: 12, marginTop: 2 }}>{sub}</Text>
      </View>
      <Text style={{ color: pal.sub, fontSize: 18 }}>›</Text>
    </View>
  );
}
