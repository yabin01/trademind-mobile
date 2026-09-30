import { Tabs } from 'expo-router';
import { useAppearance } from '@tm/lib/appearance';

export default function Layout() {
  const pal = useAppearance();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: pal.card },
        headerTitleStyle: { color: pal.text, fontWeight: '700' },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: pal.card, borderTopColor: pal.border },
        tabBarActiveTintColor: pal.accent,
        tabBarInactiveTintColor: pal.sub,
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '看板', headerTitle: 'TradeMind' }} />
      <Tabs.Screen name="positions" options={{ title: '持仓', headerTitle: '实时持仓' }} />
      <Tabs.Screen name="trades" options={{ title: '交易', headerTitle: '交易记录' }} />
      <Tabs.Screen name="calendar" options={{ title: '复盘', headerTitle: '日历复盘' }} />
      <Tabs.Screen name="coach" options={{ title: '教练', headerTitle: 'AI 教练' }} />
      <Tabs.Screen name="settings" options={{ title: '设置', headerTitle: '设置' }} />
    </Tabs>
  );
}
