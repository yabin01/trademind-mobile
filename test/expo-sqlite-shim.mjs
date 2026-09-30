// 测试用 expo-sqlite 替身：用 Node 内置 node:sqlite 实现 expo-sqlite 的同步 API。
// 关键：node:sqlite 与 expo-sqlite 一样，返回的行键是「列名」（snake_case），不自动转驼峰。
// 这样能在桌面端真实复现移动端的 rowToTrade 字段映射问题。
import { DatabaseSync } from 'node:sqlite';

class ExpDb {
  constructor() {
    this._db = new DatabaseSync(':memory:');
  }
  execSync(sql) {
    this._db.exec(sql);
  }
  runSync(sql, params) {
    const stmt = this._db.prepare(sql);
    if (Array.isArray(params)) stmt.run(...params.map((v) => (v === undefined ? null : v)));
    else if (params != null) stmt.run(params);
    else stmt.run();
  }
  getAllSync(sql, params) {
    const stmt = this._db.prepare(sql);
    if (Array.isArray(params)) return stmt.all(...params.map((v) => (v === undefined ? null : v)));
    if (params != null) return stmt.all(params);
    return stmt.all();
  }
  getFirstSync(sql, params) {
    const stmt = this._db.prepare(sql);
    let row;
    if (Array.isArray(params)) row = stmt.get(...params.map((v) => (v === undefined ? null : v)));
    else if (params != null) row = stmt.get(params);
    else row = stmt.get();
    return row === undefined ? null : row;
  }
  withTransactionSync(fn) {
    this._db.exec('BEGIN');
    try {
      fn();
      this._db.exec('COMMIT');
    } catch (e) {
      try { this._db.exec('ROLLBACK'); } catch {}
      throw e;
    }
  }
}

export function openDatabaseSync() {
  return new ExpDb();
}
