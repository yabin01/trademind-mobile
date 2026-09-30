import * as SQLite from 'expo-sqlite';
import type { UnifiedTrade } from '@trademind/trading-core';
import { dedupeTrades, dedupKey } from '@trademind/trading-core';
import type {
  AccountRow,
  ConnectionRow,
  DiaryNoteRow,
  PositionNoteRow,
  RuleRow,
  StrategyRow,
  TradeRow,
} from './schema';

export const expoDb = SQLite.openDatabaseSync('trademind.db', { enableChangeListener: true });

const MIGRATION = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY, connection_id TEXT, name TEXT NOT NULL, exchange TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'PERPETUAL', currency TEXT NOT NULL DEFAULT 'USDT',
  starting_balance REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY, exchange TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'CONNECTED',
  credentials_meta TEXT, last_sync_at TEXT, auto_sync INTEGER NOT NULL DEFAULT 0,
  sync_interval_min INTEGER NOT NULL DEFAULT 15, last_error TEXT, permissions TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL, exchange TEXT NOT NULL, symbol TEXT NOT NULL,
  side TEXT NOT NULL, position_side TEXT NOT NULL, entry_price REAL NOT NULL, exit_price REAL,
  quantity REAL NOT NULL, leverage INTEGER NOT NULL DEFAULT 1, stop_loss REAL, take_profit REAL,
  open_time TEXT NOT NULL, close_time TEXT, gross_pnl REAL NOT NULL DEFAULT 0, fees REAL NOT NULL DEFAULT 0,
  funding REAL NOT NULL DEFAULT 0, net_pnl REAL NOT NULL DEFAULT 0, risk REAL, reward REAL, rr REAL,
  strategy_id TEXT, tags TEXT NOT NULL DEFAULT '[]', entry_tags TEXT NOT NULL DEFAULT '[]',
  exit_tags TEXT NOT NULL DEFAULT '[]', archived INTEGER NOT NULL DEFAULT 0, mistakes TEXT NOT NULL DEFAULT '[]',
  confidence INTEGER, market_condition TEXT, notes TEXT, screenshots TEXT NOT NULL DEFAULT '[]',
  external_trade_id TEXT, chanlun TEXT, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS trades_account_close_idx ON trades(account_id, close_time);
CREATE UNIQUE INDEX IF NOT EXISTS trades_external_uq ON trades(exchange, account_id, external_trade_id);
CREATE TABLE IF NOT EXISTS strategies (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, color TEXT, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS strategies_name_uq ON strategies(name);
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY, name TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS tags_name_uq ON tags(name);
CREATE TABLE IF NOT EXISTS mistakes (
  id TEXT PRIMARY KEY, name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
  params TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trade_violations (
  id TEXT PRIMARY KEY, trade_id TEXT NOT NULL, rule_id TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS trade_violations_trade_rule_uq ON trade_violations(trade_id, rule_id);
CREATE TABLE IF NOT EXISTS position_notes (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL, symbol TEXT NOT NULL, position_side TEXT NOT NULL,
  entry_tags TEXT NOT NULL DEFAULT '[]', tags TEXT NOT NULL DEFAULT '[]', notes TEXT, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS position_notes_key_uq ON position_notes(account_id, symbol, position_side);
CREATE TABLE IF NOT EXISTS diary_notes (
  id TEXT PRIMARY KEY, scope TEXT NOT NULL, period_key TEXT NOT NULL, rating INTEGER, content TEXT, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS diary_notes_scope_period_uq ON diary_notes(scope, period_key);
CREATE TABLE IF NOT EXISTS coach_sessions (
  id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '新对话', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS coach_messages (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
  intent TEXT, meta TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS coach_messages_session_idx ON coach_messages(session_id);
CREATE TABLE IF NOT EXISTS coach_memory (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, content TEXT NOT NULL, metric TEXT, threshold REAL,
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS filter_presets (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, filter TEXT NOT NULL DEFAULT '{}', favorite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
`;

let migrated = false;
export function migrate(): void {
  if (migrated) return;
  expoDb.execSync(MIGRATION);
  // 自愈：上次进程被杀可能把连接留在 SYNCING 状态，启动时不可能真有同步在跑
  expoDb.runSync(
    "UPDATE connections SET status = 'FAILED', last_error = '上次同步被中断，请重新同步' WHERE status = 'SYNCING'",
  );
  migrated = true;
}

// ---------- 通用 JSON 辅助 ----------
const j = (v: unknown): string => (v === undefined || v === null ? '{}' : JSON.stringify(v));
const jArr = (v: unknown[] | undefined): string => JSON.stringify(v ?? []);
const pj = <T>(s: string | null): T => (s ? (JSON.parse(s) as T) : ({} as T));
const pjArr = <T>(s: string | null): T[] => (s ? (JSON.parse(s) as T[]) : []);

function uid(): string {
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------- 账户 ----------
export function getAccounts(): AccountRow[] {
  return expoDb.getAllSync<AccountRow>('SELECT * FROM accounts ORDER BY created_at');
}

export function ensureAccount(connectionId: string, name: string, exchange: string, currency = 'USDT'): AccountRow {
  const existing = expoDb.getFirstSync<AccountRow>('SELECT * FROM accounts WHERE connection_id = ?', [connectionId]);
  if (existing) return existing;
  const id = uid();
  const now = new Date().toISOString();
  expoDb.runSync(
    'INSERT INTO accounts (id, connection_id, name, exchange, type, currency, starting_balance, created_at) VALUES (?,?,?,?,?,?,?,?)',
    [id, connectionId, name, exchange, 'PERPETUAL', currency, 0, now],
  );
  return { id, connectionId, name, exchange, type: 'PERPETUAL', currency, startingBalance: 0, createdAt: now };
}

// ---------- 连接 ----------
export function listConnections(): ConnectionRow[] {
  return expoDb.getAllSync<ConnectionRow>('SELECT * FROM connections ORDER BY created_at');
}

export function insertConnection(row: Omit<ConnectionRow, 'createdAt'> & { createdAt?: string }): ConnectionRow {
  const createdAt = row.createdAt ?? new Date().toISOString();
  expoDb.runSync(
    'INSERT INTO connections (id, exchange, name, status, credentials_meta, last_sync_at, auto_sync, sync_interval_min, last_error, permissions, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [
      row.id,
      row.exchange,
      row.name,
      row.status,
      row.credentialsMeta ?? null,
      row.lastSyncAt ?? null,
      row.autoSync ? 1 : 0,
      row.syncIntervalMin,
      row.lastError ?? null,
      row.permissions ?? null,
      createdAt,
    ],
  );
  return { ...row, createdAt };
}

/** camelCase 字段名 -> snake_case 列名（connections/trades 均为 snake_case 列） */
function toColumn(k: string): string {
  return k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export function updateConnection(id: string, patch: Partial<ConnectionRow>): void {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    sets.push(`${toColumn(k)} = ?`);
    vals.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
  }
  if (sets.length === 0) return;
  expoDb.runSync(`UPDATE connections SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);
}

export function deleteConnectionCascade(id: string): void {
  const accs = expoDb.getAllSync<AccountRow>('SELECT id FROM accounts WHERE connection_id = ?', [id]);
  for (const a of accs) expoDb.runSync('DELETE FROM trades WHERE account_id = ?', [a.id]);
  expoDb.runSync('DELETE FROM accounts WHERE connection_id = ?', [id]);
  expoDb.runSync('DELETE FROM connections WHERE id = ?', [id]);
}

// ---------- 交易 ----------
export interface TradeFilter {
  accountId?: string;
  exchange?: string;
  symbol?: string;
  side?: string;
  positionSide?: string;
  search?: string;
  archived?: boolean;
  dateFrom?: string; // ISO
  dateTo?: string; // ISO
  closedOnly?: boolean;
  limit?: number;
  offset?: number;
  order?: 'ASC' | 'DESC';
}

export function getTrades(filter: TradeFilter = {}): TradeRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.accountId) {
    where.push('account_id = ?');
    params.push(filter.accountId);
  }
  if (filter.exchange) {
    where.push('exchange = ?');
    params.push(filter.exchange);
  }
  if (filter.symbol) {
    where.push('symbol = ?');
    params.push(filter.symbol.toUpperCase());
  }
  if (filter.side) {
    where.push('side = ?');
    params.push(filter.side);
  }
  if (filter.positionSide) {
    where.push('position_side = ?');
    params.push(filter.positionSide);
  }
  if (filter.archived !== undefined) {
    where.push('archived = ?');
    params.push(filter.archived ? 1 : 0);
  }
  if (filter.closedOnly) {
    where.push('close_time IS NOT NULL');
  }
  if (filter.dateFrom) {
    where.push('open_time >= ?');
    params.push(filter.dateFrom);
  }
  if (filter.dateTo) {
    where.push('open_time <= ?');
    params.push(filter.dateTo);
  }
  if (filter.search) {
    where.push('(symbol LIKE ? OR notes LIKE ? OR market_condition LIKE ?)');
    const s = `%${filter.search}%`;
    params.push(s, s, s);
  }
  const order = filter.order ?? 'DESC';
  const limit = filter.limit ?? 200;
  const offset = filter.offset ?? 0;
  const sql = `SELECT * FROM trades ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY open_time ${order} LIMIT ? OFFSET ?`;
  return expoDb.getAllSync<TradeRow>(sql, [...params, limit, offset]);
}

export function getTradeById(id: string): TradeRow | null {
  return expoDb.getFirstSync<TradeRow>('SELECT * FROM trades WHERE id = ?', [id]) ?? null;
}

export function updateTrade(id: string, patch: Partial<TradeRow>): void {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || k === 'id') continue;
    sets.push(`${toColumn(k)} = ?`);
    vals.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
  }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  vals.push(new Date().toISOString());
  expoDb.runSync(`UPDATE trades SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);
}

export interface ImportResult {
  inserted: number;
  skipped: number;
}

/** 批量导入：先组内去重，再按 externalTradeId（API 源）或 dedupKey（CSV/手动）去重后入库 */
export function importTrades(incoming: UnifiedTrade[]): ImportResult {
  const deduped = dedupeTrades(incoming).trades;
  const existingExt = new Set(
    expoDb.getAllSync<{ externalTradeId: string; exchange: string; accountId: string }>(
      'SELECT external_trade_id AS externalTradeId, exchange, account_id AS accountId FROM trades WHERE external_trade_id IS NOT NULL',
    ).map((r) => `${r.exchange}:${r.accountId}:${r.externalTradeId}`),
  );
  const existingManual = new Set(
    expoDb
      .getAllSync<{ exchange: string; accountId: string; openTime: string; closeTime: string | null; symbol: string; side: string }>(
        'SELECT exchange, account_id AS accountId, open_time AS openTime, close_time AS closeTime, symbol, side FROM trades WHERE external_trade_id IS NULL',
      )
      .map((r) => [r.exchange, r.accountId, r.openTime, r.closeTime ?? 'OPEN', r.symbol, r.side].join(':')),
  );

  const toInsert = deduped.filter((t) => {
    if (t.externalTradeId) {
      return !existingExt.has(`${t.exchange}:${t.accountId}:${t.externalTradeId}`);
    }
    return !existingManual.has(dedupKey(t));
  });

  expoDb.withTransactionSync(() => {
    for (const t of toInsert) {
      expoDb.runSync(
        `INSERT OR IGNORE INTO trades (
          id, account_id, exchange, symbol, side, position_side, entry_price, exit_price, quantity, leverage,
          stop_loss, take_profit, open_time, close_time, gross_pnl, fees, funding, net_pnl, risk, reward, rr,
          strategy_id, tags, entry_tags, exit_tags, archived, mistakes, confidence, market_condition, notes,
          screenshots, external_trade_id, chanlun, metadata, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          t.id,
          t.accountId,
          t.exchange,
          t.symbol,
          t.side,
          t.positionSide,
          t.entryPrice,
          t.exitPrice,
          t.quantity,
          t.leverage,
          t.stopLoss,
          t.takeProfit,
          t.openTime,
          t.closeTime,
          t.grossPnl,
          t.fees,
          t.funding,
          t.netPnl,
          t.risk,
          t.reward,
          t.rr,
          t.strategyId,
          jArr(t.tags),
          jArr(t.entryTags),
          jArr(t.exitTags),
          t.archived ? 1 : 0,
          jArr(t.mistakes),
          t.confidence,
          t.marketCondition,
          t.notes,
          jArr(t.screenshots),
          t.externalTradeId,
          t.chanlun ? j(t.chanlun) : null,
          j(t.metadata),
          t.createdAt ?? new Date().toISOString(),
          t.updatedAt ?? new Date().toISOString(),
        ],
      );
    }
  });
  return { inserted: toInsert.length, skipped: deduped.length - toInsert.length };
}

/** 行 -> 统一交易模型（解析 JSON 列）。
 * 重要：expo-sqlite 返回的行键是「列名」（snake_case，如 account_id / close_time），不会自动转驼峰，
 * 因此这里必须按 snake_case 读取；camelCase 作为兜底（兼容不同 SQLite 驱动行为）。 */
export function rowToTrade(r: TradeRow): UnifiedTrade {
  const row = r as unknown as Record<string, unknown>;
  const pick = (camel: string, snake: string): unknown => {
    const a = row[camel];
    if (a !== undefined && a !== null) return a;
    return row[snake];
  };
  const str = (camel: string, snake: string): string | null => {
    const v = pick(camel, snake);
    return v == null ? null : String(v);
  };
  const num = (camel: string, snake: string): number | null => {
    const v = pick(camel, snake);
    return v == null ? null : Number(v);
  };
  const str2 = (snake: string): string | null => str(snake, snake);
  return {
    id: str2('id') as string,
    workspaceId: 'local',
    accountId: str2('account_id') as string,
    exchange: str2('exchange') as UnifiedTrade['exchange'],
    symbol: str2('symbol') as string,
    side: str2('side') as UnifiedTrade['side'],
    positionSide: str2('position_side') as UnifiedTrade['positionSide'],
    entryPrice: Number(pick('entryPrice', 'entry_price') ?? 0),
    exitPrice: num('exitPrice', 'exit_price'),
    quantity: Number(pick('quantity', 'quantity') ?? 0),
    leverage: Number(pick('leverage', 'leverage') ?? 1),
    stopLoss: num('stopLoss', 'stop_loss'),
    takeProfit: num('takeProfit', 'take_profit'),
    openTime: str2('open_time') as string,
    closeTime: str2('close_time'),
    grossPnl: Number(pick('grossPnl', 'gross_pnl') ?? 0),
    fees: Number(pick('fees', 'fees') ?? 0),
    funding: Number(pick('funding', 'funding') ?? 0),
    netPnl: Number(pick('netPnl', 'net_pnl') ?? 0),
    risk: num('risk', 'risk'),
    reward: num('reward', 'reward'),
    rr: num('rr', 'rr'),
    strategyId: str2('strategy_id'),
    tags: pjArr<string>(str2('tags')),
    entryTags: pjArr<string>(str2('entry_tags')),
    exitTags: pjArr<string>(str2('exit_tags')),
    archived: !!Number(pick('archived', 'archived') ?? 0),
    mistakes: pjArr<string>(str2('mistakes')),
    confidence: num('confidence', 'confidence'),
    marketCondition: str2('market_condition'),
    notes: str2('notes'),
    screenshots: pjArr<string>(str2('screenshots')),
    externalTradeId: str2('external_trade_id'),
    chanlun: pick('chanlun', 'chanlun') == null ? null : pj(str2('chanlun') as string),
    metadata: pj(str2('metadata') as string),
    createdAt: str2('created_at') as string,
    updatedAt: str2('updated_at') as string,
  };
}

export function getTradesAsModels(filter: TradeFilter = {}): UnifiedTrade[] {
  return getTrades(filter).map(rowToTrade);
}

// ---------- 策略 ----------
export function listStrategies(): StrategyRow[] {
  return expoDb.getAllSync<StrategyRow>('SELECT * FROM strategies ORDER BY name');
}
export function ensureStrategyByName(name: string): StrategyRow {
  const existing = expoDb.getFirstSync<StrategyRow>('SELECT * FROM strategies WHERE name = ?', [name]);
  if (existing) return existing;
  const id = uid();
  const now = new Date().toISOString();
  expoDb.runSync('INSERT INTO strategies (id, name, description, color, created_at) VALUES (?,?,?,?,?)', [
    id,
    name,
    null,
    null,
    now,
  ]);
  return { id, name, description: null, color: null, createdAt: now };
}

// ---------- 规则 / 违规 ----------
export function listRules(): RuleRow[] {
  return expoDb.getAllSync<RuleRow>('SELECT * FROM rules ORDER BY created_at');
}
export function insertRule(rule: Omit<RuleRow, 'createdAt'>): void {
  expoDb.runSync('INSERT INTO rules (id, name, type, enabled, params, created_at) VALUES (?,?,?,?,?,?)', [
    rule.id,
    rule.name,
    rule.type,
    rule.enabled ? 1 : 0,
    rule.params,
    new Date().toISOString(),
  ]);
}

// ---------- 持仓标注 ----------
export function getPositionNote(accountId: string, symbol: string, positionSide: string): PositionNoteRow | null {
  return (
    expoDb.getFirstSync<PositionNoteRow>(
      'SELECT * FROM position_notes WHERE account_id = ? AND symbol = ? AND position_side = ?',
      [accountId, symbol, positionSide],
    ) ?? null
  );
}
export function upsertPositionNote(note: {
  accountId: string;
  symbol: string;
  positionSide: string;
  entryTags?: string[];
  tags?: string[];
  notes?: string | null;
}): void {
  const existing = getPositionNote(note.accountId, note.symbol, note.positionSide);
  const now = new Date().toISOString();
  if (existing) {
    expoDb.runSync('UPDATE position_notes SET entry_tags = ?, tags = ?, notes = ?, updated_at = ? WHERE id = ?', [
      jArr(note.entryTags ?? pjArr<string>(existing.entryTags)),
      jArr(note.tags ?? pjArr<string>(existing.tags)),
      note.notes ?? existing.notes,
      now,
      existing.id,
    ]);
  } else {
    expoDb.runSync(
      'INSERT INTO position_notes (id, account_id, symbol, position_side, entry_tags, tags, notes, updated_at) VALUES (?,?,?,?,?,?,?,?)',
      [
        uid(),
        note.accountId,
        note.symbol,
        note.positionSide,
        jArr(note.entryTags ?? []),
        jArr(note.tags ?? []),
        note.notes ?? null,
        now,
      ],
    );
  }
}

// ---------- 日记复盘 ----------
export function getDiaryNote(scope: string, periodKey: string): DiaryNoteRow | null {
  return (
    expoDb.getFirstSync<DiaryNoteRow>('SELECT * FROM diary_notes WHERE scope = ? AND period_key = ?', [
      scope,
      periodKey,
    ]) ?? null
  );
}
export function upsertDiaryNote(note: {
  scope: string;
  periodKey: string;
  rating?: number | null;
  content?: string | null;
}): void {
  const existing = getDiaryNote(note.scope, note.periodKey);
  const now = new Date().toISOString();
  if (existing) {
    expoDb.runSync('UPDATE diary_notes SET rating = ?, content = ?, updated_at = ? WHERE id = ?', [
      note.rating ?? existing.rating,
      note.content ?? existing.content,
      now,
      existing.id,
    ]);
  } else {
    expoDb.runSync(
      'INSERT INTO diary_notes (id, scope, period_key, rating, content, updated_at) VALUES (?,?,?,?,?,?)',
      [uid(), note.scope, note.periodKey, note.rating ?? null, note.content ?? null, now],
    );
  }
}

export { uid, j, jArr, pj, pjArr };
