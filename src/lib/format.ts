/**
 * 时间统一口径（与桌面端一致）：
 *   - 数据库 / 接口 / 引擎全程 UTC（ISO8601 字符串）
 *   - 前端显示一律北京时间 UTC+8
 * 严禁直接 slice ISO 字符串当显示用。
 */

const BEIJING_OFFSET_MS = 8 * 3600 * 1000;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 北京时间格式化：默认 'MM-DD HH:mm'，带年用 opts.withYear */
export function fmtTs(iso: string | null | undefined, withYear = false): string {
  if (!iso) return '—';
  const d = new Date(new Date(iso).getTime() + BEIJING_OFFSET_MS);
  if (Number.isNaN(d.getTime())) return '—';
  const hm = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  if (withYear) return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${hm}`;
  return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${hm}`;
}

/** 北京时间日期：'YYYY-MM-DD' */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(new Date(iso).getTime() + BEIJING_OFFSET_MS);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 北京时间日期键（用于日历/分组）：'YYYY-MM-DD' */
export function dayKeyBeijing(iso: string): string {
  const d = new Date(new Date(iso).getTime() + BEIJING_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 数字千分位 + 固定小数 */
export function fmtNum(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** 盈亏带符号 */
export function fmtPnl(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const s = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${s}${fmtNum(Math.abs(n), dp)}`;
}

export function fmtPct(n: number | null | undefined, dp = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(dp)}%`;
}

/** 盈亏颜色（红涨绿跌） */
export function pnlColor(n: number | null | undefined, up: string, down: string, flat: string): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n === 0) return flat;
  return n > 0 ? up : down;
}

/** 时间窗 -> 过滤用的 from ISO（to 用当前时间） */
export function rangeFromIso(days: number | null): string | null {
  if (days === null) return null;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
