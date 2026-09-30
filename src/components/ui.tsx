import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppearance, type Palette } from '@tm/lib/appearance';
import { fmtPnl } from '@tm/lib/format';

export function Screen({ children, style }: { children: React.ReactNode; style?: object }) {
  const pal = useAppearance();
  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: pal.bg }]}
      contentContainerStyle={[{ padding: 16, paddingBottom: 48 }, style]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: object; onPress?: () => void }) {
  const pal = useAppearance();
  const content = (
    <View
      style={[
        styles.card,
        { backgroundColor: pal.card, borderColor: pal.border, ...shadow(pal) },
        style,
      ]}
    >
      {children}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.99 : 1 }] }]}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

export function SectionTitle({ text, style }: { text: string; style?: object }) {
  const pal = useAppearance();
  return <Text style={[styles.sectionTitle, { color: pal.sub }, style]}>{text}</Text>;
}

export function StatTile({
  label,
  value,
  sub,
  color,
  align = 'left',
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  align?: 'left' | 'right' | 'center';
}) {
  const pal = useAppearance();
  return (
    <View
      style={[
        styles.statTile,
        { backgroundColor: pal.bg, borderColor: pal.border },
        align === 'right' && { alignItems: 'flex-end' },
        align === 'center' && { alignItems: 'center' },
      ]}
    >
      <Text style={[styles.statLabel, { color: pal.sub }]}>{label}</Text>
      <Text style={[styles.statValue, { color: color ?? pal.text }]}>{value}</Text>
      {sub ? <Text style={[styles.statSub, { color: pal.sub }]}>{sub}</Text> : null}
    </View>
  );
}

export function PnlText({ value, dp = 2, style }: { value: number | null | undefined; dp?: number; style?: object }) {
  const pal = useAppearance();
  const color = value === null || value === undefined || value === 0 ? pal.sub : value > 0 ? pal.up : pal.down;
  return <Text style={[styles.pnl, { color }, style]}>{fmtPnl(value, dp)}</Text>;
}

export function Tag({ text, color }: { text: string; color?: string }) {
  const pal = useAppearance();
  return (
    <View style={[styles.tag, { borderColor: color ?? pal.border, backgroundColor: pal.bg }]}>
      <Text style={[styles.tagText, { color: color ?? pal.sub }]}>{text}</Text>
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  disabled,
  loading,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const pal = useAppearance();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: disabled ? pal.border : pal.accent, opacity: disabled ? 0.55 : pressed ? 0.9 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{title}</Text>}
    </Pressable>
  );
}

export function GhostButton({ title, onPress }: { title: string; onPress: () => void }) {
  const pal = useAppearance();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.btnGhost, { borderColor: pal.border }, pressed && { opacity: 0.8 }]}>
      <Text style={[styles.btnGhostText, { color: pal.text }]}>{title}</Text>
    </Pressable>
  );
}

/** 统一空状态：圆形图标底 + 主文案 + 可选引导 */
export function Empty({ text, hint, icon = 'folder-open-outline' }: { text: string; hint?: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const pal = useAppearance();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: pal.bg, borderColor: pal.border }]}>
        <Ionicons name={icon} size={30} color={pal.sub} />
      </View>
      <Text style={[styles.emptyText, { color: pal.sub }]}>{text}</Text>
      {hint ? <Text style={[styles.emptyHint, { color: pal.sub }]}>{hint}</Text> : null}
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const pal = useAppearance();
  return (
    <View style={[styles.seg, { backgroundColor: pal.bg, borderColor: pal.border }]}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[styles.segItem, active && { backgroundColor: pal.card, ...shadow(pal) }, active && pal.dark && { backgroundColor: '#1C2330' }]}
          >
            <Text style={[styles.segText, { color: active ? pal.accent : pal.sub }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 数据源选择器：横向滚动 chip，「全部」+ 各连接（用于按 API/账户切换数据） */
export function ConnPicker({
  choices,
  value,
  onChange,
}: {
  choices: { id: string; name: string; exchange: string }[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const pal = useAppearance();
  if (choices.length === 0) return null;
  const chips: { id: string | null; label: string }[] = [
    { id: null, label: '全部' },
    ...choices.map((c) => ({ id: c.id, label: c.name })),
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.connPicker}
      contentContainerStyle={styles.connPickerInner}
    >
      {chips.map((c) => {
        const active = c.id === value;
        return (
          <Pressable
            key={c.id ?? '__all__'}
            onPress={() => onChange(c.id)}
            style={[
              styles.chip,
              { borderColor: active ? pal.accent : pal.border, backgroundColor: active ? pal.accent : pal.card },
            ]}
          >
            <Text style={[styles.chipText, { color: active ? '#fff' : pal.sub }]} numberOfLines={1}>
              {c.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Input({
  value,
  onChangeText,
  placeholder,
  secure,
  multiline,
  autoCapitalize,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secure?: boolean;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  const pal = useAppearance();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={pal.sub}
      secureTextEntry={secure}
      multiline={multiline}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      style={[
        styles.input,
        { backgroundColor: pal.card, borderColor: pal.border, color: pal.text },
        multiline && { height: 96, textAlignVertical: 'top' },
      ]}
    />
  );
}

export function Row({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  const pal = useAppearance();
  return (
    <View style={[styles.row, { borderBottomColor: pal.border }]}>
      <Text style={[styles.rowLabel, { color: pal.sub }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: color ?? pal.text }]}>{value}</Text>
    </View>
  );
}

export function Spinner({ pal }: { pal: Palette }) {
  return <ActivityIndicator color={pal.accent} />;
}

/** 轻投影：亮色主题浅阴影，暗色主题仅提亮描边不加阴影 */
function shadow(pal: Palette) {
  if (pal.dark) return {};
  return {
    shadowColor: '#0B0E14',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  };
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginTop: 12, marginBottom: 8, letterSpacing: 0.8 },
  statTile: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1 },
  statLabel: { fontSize: 12 },
  statValue: { fontSize: 21, fontWeight: '800', marginTop: 3 },
  statSub: { fontSize: 11, marginTop: 3 },
  pnl: { fontWeight: '700' },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginRight: 6, marginBottom: 6 },
  tagText: { fontSize: 11, fontWeight: '600' },
  btn: { borderRadius: 13, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.3 },
  btnGhost: { borderRadius: 13, paddingVertical: 13, alignItems: 'center', borderWidth: 1, marginTop: 8 },
  btnGhostText: { fontWeight: '600', fontSize: 15 },
  empty: { padding: 36, alignItems: 'center' },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 22, fontWeight: '500' },
  emptyHint: { fontSize: 12, textAlign: 'center', marginTop: 6, opacity: 0.7 },
  seg: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3, marginBottom: 12 },
  segItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  segText: { fontSize: 13, fontWeight: '700' },
  connPicker: { flexGrow: 0, marginBottom: 10 },
  connPickerInner: { gap: 8, paddingRight: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, maxWidth: 160 },
  chipText: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
});
