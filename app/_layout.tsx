import { useEffect } from 'react';
import { Alert, Text, View, StyleSheet, ScrollView } from 'react-native';
import { Tabs } from 'expo-router';
import { useAppearance } from '@tm/lib/appearance';
import { migrate } from '@tm/db';

/** 启动即建表（幂等），避免任何页面在同步前查询缺表 */
let dbReady = false;
function ensureDb() {
  if (dbReady) return;
  try {
    migrate();
    dbReady = true;
  } catch (e) {
    console.warn('[TradeMind] migrate failed:', e);
  }
}
ensureDb();

/**
 * 全局错误兜底：expo-router 的 ErrorBoundary + 全局 JS 异常处理器。
 * 任何启动/渲染崩溃都会红屏显示报错，绝不再白屏无提示。
 */
function CrashScreen({ error }: { error: Error }) {
  return (
    <View style={crash.wrap}>
      <Text style={crash.title}>TradeMind 启动出错</Text>
      <ScrollView style={crash.box}>
        <Text style={crash.msg}>{String(error?.message || error)}</Text>
        <Text style={crash.stack}>{String(error?.stack || '')}</Text>
      </ScrollView>
    </View>
  );
}

export function ErrorBoundary({ error }: { error: Error }) {
  return <CrashScreen error={error} />;
}

// 捕获 ErrorBoundary 覆盖不到的异步/全局异常
if ((globalThis as any).ErrorUtils) {
  const prev = (globalThis as any).ErrorUtils.getGlobalHandler();
  (globalThis as any).ErrorUtils.setGlobalHandler((err: any, isFatal: boolean) => {
    try {
      Alert.alert('TradeMind 运行出错', String(err?.message || err));
    } catch {}
    prev?.(err, isFatal);
  });
}

export default function Layout() {
  const pal = useAppearance();
  useEffect(() => {
    ensureDb();
  }, []);
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

const crash = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0B0E14', padding: 24, paddingTop: 64 },
  title: { color: '#ef4444', fontSize: 20, fontWeight: '800', marginBottom: 12 },
  box: { flex: 1, backgroundColor: '#151A23', borderRadius: 12, padding: 12 },
  msg: { color: '#E5E7EB', fontSize: 14, fontWeight: '700' },
  stack: { color: '#9AA4B2', fontSize: 11, marginTop: 8 },
});
