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
import { useAppearance, type Palette } from '@tm/lib/appearance';
import { fmtPnl } from '@tm/lib/format';

export function Screen({ children, style }: { children: React.ReactNode; style?: object }) {
  const pal = useAppearance();
  return (
    <ScrollView style={[styles.screen, { backgroundColor: pal.bg }]} contentContainerStyle={[{ padding: 16, paddingBottom: 40 }, style]}>
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: object; onPress?: () => void }) {
  const pal = useAppearance();
  const content = (
    <View style={[styles.card, { backgroundColor: pal.card, borderColor: pal.border }, style]}>{children}</View>
  );
  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}

export function SectionTitle({ text }: { text: string }) {
  const pal = useAppearance();
  return <Text style={[styles.sectionTitle, { color: pal.sub }]}>{text}</Text>;
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
    <View style={[styles.statTile, align === 'right' && { alignItems: 'flex-end' }, align === 'center' && { alignItems: 'center' }]}>
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
      style={[styles.btn, { backgroundColor: disabled ? pal.border : pal.accent, opacity: disabled ? 0.6 : 1 }]}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{title}</Text>}
    </Pressable>
  );
}

export function GhostButton({ title, onPress }: { title: string; onPress: () => void }) {
  const pal = useAppearance();
  return (
    <Pressable onPress={onPress} style={[styles.btnGhost, { borderColor: pal.border }]}>
      <Text style={[styles.btnGhostText, { color: pal.text }]}>{title}</Text>
    </Pressable>
  );
}

export function Empty({ text }: { text: string }) {
  const pal = useAppearance();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyText, { color: pal.sub }]}>{text}</Text>
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
            style={[styles.segItem, active && { backgroundColor: pal.accent }]}
          >
            <Text style={[styles.segText, { color: active ? '#fff' : pal.sub }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Input({
  value,
  onChangeText,
  placeholder,
  secure,
  multiline,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secure?: boolean;
  multiline?: boolean;
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
      style={[
        styles.input,
        { backgroundColor: pal.bg, borderColor: pal.border, color: pal.text },
        multiline && { height: 96, textAlignVertical: 'top' },
      ]}
    />
  );
}

export function Row({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  const pal = useAppearance();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: pal.sub }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: color ?? pal.text }]}>{value}</Text>
    </View>
  );
}

export function Spinner({ pal }: { pal: Palette }) {
  return <ActivityIndicator color={pal.accent} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '600', marginTop: 8, marginBottom: 8, letterSpacing: 0.5 },
  statTile: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: 'transparent' },
  statLabel: { fontSize: 12 },
  statValue: { fontSize: 20, fontWeight: '700', marginTop: 2 },
  statSub: { fontSize: 11, marginTop: 2 },
  pnl: { fontWeight: '700' },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginRight: 6, marginBottom: 6 },
  tagText: { fontSize: 11 },
  btn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnGhost: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, marginTop: 8 },
  btnGhostText: { fontWeight: '600', fontSize: 15 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 14, textAlign: 'center' },
  seg: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, padding: 3, marginBottom: 12 },
  segItem: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 8 },
  segText: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#00000010' },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
});
