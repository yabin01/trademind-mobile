import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * TradeMind 移动端 Schema（SQLite / expo-sqlite）。
 * 与桌面端 PostgreSQL schema 字段一一对应，仅做方言适配：
 *   uuid      -> text（应用层生成，存字符串）
 *   jsonb     -> text（JSON.stringify 落库，repo 层解析）
 *   double    -> real
 *   timestamp -> text（ISO8601 UTC 字符串，全库统一 UTC）
 *   boolean   -> integer（0/1）
 *   date      -> text（YYYY-MM-DD）
 * 单用户单机：去掉 workspace_id 维度（数据不出手机）。
 */

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    connectionId: text('connection_id'),
    name: text('name').notNull(),
    exchange: text('exchange').notNull(),
    type: text('type').notNull().default('PERPETUAL'),
    currency: text('currency').notNull().default('USDT'),
    startingBalance: real('starting_balance').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({ connIdx: index('accounts_conn_idx').on(t.connectionId) }),
);

export const connections = sqliteTable('connections', {
  id: text('id').primaryKey(),
  exchange: text('exchange').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull().default('CONNECTED'),
  /** 凭证不在这里（存 expo-secure-store），这里只存脱敏元信息 */
  credentialsMeta: text('credentials_meta'),
  lastSyncAt: text('last_sync_at'),
  autoSync: integer('auto_sync', { mode: 'boolean' }).notNull().default(false),
  syncIntervalMin: integer('sync_interval_min').notNull().default(15),
  lastError: text('last_error'),
  permissions: text('permissions'),
  createdAt: text('created_at').notNull(),
});

export const trades = sqliteTable(
  'trades',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    exchange: text('exchange').notNull(),
    symbol: text('symbol').notNull(),
    side: text('side').notNull(),
    positionSide: text('position_side').notNull(),

    entryPrice: real('entry_price').notNull(),
    exitPrice: real('exit_price'),
    quantity: real('quantity').notNull(),
    leverage: integer('leverage').notNull().default(1),
    stopLoss: real('stop_loss'),
    takeProfit: real('take_profit'),

    openTime: text('open_time').notNull(),
    closeTime: text('close_time'),

    grossPnl: real('gross_pnl').notNull().default(0),
    fees: real('fees').notNull().default(0),
    funding: real('funding').notNull().default(0),
    netPnl: real('net_pnl').notNull().default(0),

    risk: real('risk'),
    reward: real('reward'),
    rr: real('rr'),

    strategyId: text('strategy_id'),
    tags: text('tags').notNull().default('[]'),
    entryTags: text('entry_tags').notNull().default('[]'),
    exitTags: text('exit_tags').notNull().default('[]'),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    mistakes: text('mistakes').notNull().default('[]'),
    confidence: integer('confidence'),
    marketCondition: text('market_condition'),
    notes: text('notes'),
    screenshots: text('screenshots').notNull().default('[]'),

    externalTradeId: text('external_trade_id'),
    chanlun: text('chanlun'),
    metadata: text('metadata').notNull().default('{}'),

    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    accountCloseIdx: index('trades_account_close_idx').on(t.accountId, t.closeTime),
    externalUq: uniqueIndex('trades_external_uq').on(t.exchange, t.accountId, t.externalTradeId),
  }),
);

export const strategies = sqliteTable(
  'strategies',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color'),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({ nameUq: uniqueIndex('strategies_name_uq').on(t.name) }),
);

export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
  },
  (t) => ({ nameUq: uniqueIndex('tags_name_uq').on(t.name) }),
);

export const mistakes = sqliteTable(
  'mistakes',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
  },
  (t) => ({ nameUq: uniqueIndex('mistakes_name_uq').on(t.name) }),
);

export const rules = sqliteTable(
  'rules',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    params: text('params').notNull().default('{}'),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({ idx: index('rules_idx').on(t.type) }),
);

export const tradeViolations = sqliteTable(
  'trade_violations',
  {
    id: text('id').primaryKey(),
    tradeId: text('trade_id').notNull(),
    ruleId: text('rule_id').notNull(),
    detail: text('detail'),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    uq: uniqueIndex('trade_violations_trade_rule_uq').on(t.tradeId, t.ruleId),
    idx: index('trade_violations_idx').on(t.tradeId),
  }),
);

/** 持仓标注：实时持仓不落库，这里只持久化用户标注（键 = accountId+symbol+positionSide） */
export const positionNotes = sqliteTable(
  'position_notes',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    symbol: text('symbol').notNull(),
    positionSide: text('position_side').notNull(),
    entryTags: text('entry_tags').notNull().default('[]'),
    tags: text('tags').notNull().default('[]'),
    notes: text('notes'),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    uq: uniqueIndex('position_notes_key_uq').on(t.accountId, t.symbol, t.positionSide),
  }),
);

export const diaryNotes = sqliteTable(
  'diary_notes',
  {
    id: text('id').primaryKey(),
    scope: text('scope').notNull(),
    periodKey: text('period_key').notNull(),
    rating: integer('rating'),
    content: text('content'),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({ uq: uniqueIndex('diary_notes_scope_period_uq').on(t.scope, t.periodKey) }),
);

export const coachSessions = sqliteTable('coach_sessions', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default('新对话'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const coachMessages = sqliteTable(
  'coach_messages',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    role: text('role').notNull(),
    content: text('content').notNull(),
    intent: text('intent'),
    meta: text('meta').notNull().default('{}'),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({ sessIdx: index('coach_messages_session_idx').on(t.sessionId) }),
);

export const coachMemory = sqliteTable('coach_memory', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  content: text('content').notNull(),
  metric: text('metric'),
  threshold: real('threshold'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
});

export const filterPresets = sqliteTable('filter_presets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  filter: text('filter').notNull().default('{}'),
  favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});

export type AccountRow = typeof accounts.$inferSelect;
export type ConnectionRow = typeof connections.$inferSelect;
export type TradeRow = typeof trades.$inferSelect;
export type StrategyRow = typeof strategies.$inferSelect;
export type RuleRow = typeof rules.$inferSelect;
export type PositionNoteRow = typeof positionNotes.$inferSelect;
export type DiaryNoteRow = typeof diaryNotes.$inferSelect;
export type CoachSessionRow = typeof coachSessions.$inferSelect;
export type CoachMessageRow = typeof coachMessages.$inferSelect;
export type CoachMemoryRow = typeof coachMemory.$inferSelect;
