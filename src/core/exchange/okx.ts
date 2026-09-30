import { hmacSha256Base64 } from './crypto';

/**
 * OKX v5 REST 客户端（React Native 版）。
 * 传输层用 RN 全局 fetch（手机上由 Clash VPN 接管代理，无需在应用内配置）。
 * 签名规则：OK-ACCESS-SIGN = Base64(HMAC-SHA256(secret, timestamp + method + requestPath + body))。
 * 文档：https://www.okx.com/docs-v5/en/
 */

export type OkxCredentials = {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  flag?: '0' | '1'; // 0 = 实盘（默认），1 = 模拟盘
};

export type OkxResponse<T> = { code: string; msg: string; data: T };

const OKX_BASE = 'https://www.okx.com';

/** 常见错误码的中文排查提示 */
const OKX_ERROR_HINTS: Record<string, string> = {
  '50102': '手机时间与服务器偏差过大，请校准系统时间后重试',
  '50111': 'API Key 无效，请核对是否复制完整',
  '50112': 'IP 不在白名单：请到 OKX 后台「API → 编辑」把手机当前网络出口 IP 加入白名单（用 VPN 时填 VPN 节点出口 IP），或改用不限 IP 的只读密钥',
  '50113': '签名校验失败：请检查 Secret Key / Passphrase 是否正确',
  '50110': '该 API Key 已被删除或失效，请到 OKX 后台重新生成',
  '50121': '该密钥没有读取行情/账户权限，请勾选「读取」权限',
};

async function okxError(res: Response, fallback: string): Promise<Error> {
  let msg = fallback;
  let code = '';
  try {
    const j = (await res.json()) as OkxResponse<unknown>;
    code = j.code ?? '';
    msg = `${code}: ${j.msg || fallback}`;
  } catch {
    if (res.status === 401) msg = '401: 认证失败，请检查密钥';
    else if (res.status === 403) msg = '403: 被拒绝（多为 IP 白名单限制）';
    else msg = `${res.status}: 网络请求失败（检查网络/VPN 是否可用）`;
  }
  const hint = OKX_ERROR_HINTS[code];
  return new Error(hint ? `OKX ${msg} —— ${hint}` : `OKX ${msg}`);
}

function sign(secretKey: string, timestamp: string, method: string, requestPath: string, body = ''): string {
  return hmacSha256Base64(secretKey, `${timestamp}${method}${requestPath}${body}`);
}

function authHeaders(cred: OkxCredentials, method: string, requestPath: string, body = ''): Record<string, string> {
  const timestamp = new Date().toISOString();
  const headers: Record<string, string> = {
    'OK-ACCESS-KEY': cred.apiKey,
    'OK-ACCESS-SIGN': sign(cred.secretKey, timestamp, method, requestPath, body),
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': cred.passphrase,
    'Content-Type': 'application/json',
  };
  if (cred.flag === '1') headers['x-simulated-trading'] = '1';
  return headers;
}

async function okxGet<T>(requestPath: string, cred: OkxCredentials): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${OKX_BASE}${requestPath}`, { headers: authHeaders(cred, 'GET', requestPath) });
  } catch {
    throw new Error('无法连接 www.okx.com：请检查手机网络，以及 VPN/代理是否已开启');
  }
  const json = (await res.json().catch(() => null)) as OkxResponse<T> | null;
  if (!json) throw new Error(`OKX 返回异常（HTTP ${res.status}）`);
  if (json.code !== '0') throw await okxError(res, json.msg || '请求失败');
  return json.data;
}

async function okxPostRaw(
  requestPath: string,
  cred: OkxCredentials,
  body: string,
): Promise<OkxResponse<unknown>> {
  let res: Response;
  try {
    res = await fetch(`${OKX_BASE}${requestPath}`, {
      method: 'POST',
      headers: authHeaders(cred, 'POST', requestPath, body),
      body,
    });
  } catch {
    return { code: '-2', msg: '无法连接 www.okx.com（检查网络/VPN）', data: null };
  }
  try {
    return (await res.json()) as OkxResponse<unknown>;
  } catch {
    return { code: '-1', msg: `非 JSON 响应（HTTP ${res.status}）`, data: null };
  }
}

/** 无权限错误码：POST /api/v5/trade/order 返回 50120 = 无此权限（安全） */
const NO_PERMISSION_CODE = '50120';

export interface PermissionProbe {
  readOnly: boolean;
  read: { ok: boolean; code?: string; msg?: string };
  trade: { granted: boolean; code?: string; msg?: string };
  withdraw: { granted: boolean; code?: string; msg?: string };
  checkedAt: string;
}

/**
 * 只读校验：向交易/提币接口发送必然被参数校验拒绝的请求（sz=0 / 空参数），不可能真的下单或提币。
 * 返回 50120 → 无该权限（安全）；其他 → 具备该权限（风险）。
 */
export async function probePermissions(cred: OkxCredentials): Promise<PermissionProbe> {
  const checkedAt = new Date().toISOString();

  let read: PermissionProbe['read'];
  try {
    await okxGet<unknown[]>('/api/v5/account/balance?ccy=USDT', cred);
    read = { ok: true };
  } catch (e) {
    read = { ok: false, msg: e instanceof Error ? e.message : String(e) };
  }

  let trade: PermissionProbe['trade'];
  try {
    const body = JSON.stringify({
      instId: 'BTC-USDT-SWAP',
      tdMode: 'cross',
      side: 'buy',
      ordType: 'limit',
      sz: '0',
      px: '1',
    });
    const res = await okxPostRaw('/api/v5/trade/order', cred, body);
    trade = { granted: res.code !== NO_PERMISSION_CODE, code: res.code, msg: res.msg };
  } catch (e) {
    trade = { granted: false, msg: e instanceof Error ? e.message : String(e) };
  }

  let withdraw: PermissionProbe['withdraw'];
  try {
    const body = JSON.stringify({ ccy: 'USDT', amt: '0', dest: '4', toAddr: '' });
    const res = await okxPostRaw('/api/v5/asset/withdrawal', cred, body);
    withdraw = { granted: res.code !== NO_PERMISSION_CODE, code: res.code, msg: res.msg };
  } catch (e) {
    withdraw = { granted: false, msg: e instanceof Error ? e.message : String(e) };
  }

  return {
    readOnly: read.ok && !trade.granted && !withdraw.granted,
    read,
    trade,
    withdraw,
    checkedAt,
  };
}

/** 公共行情接口（无需签名）：instId -> 每张合约面值（ctVal） */
export async function fetchSwapCtValMap(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const res = await fetch(`${OKX_BASE}/api/v5/public/instruments?instType=SWAP`);
    const json = (await res.json()) as OkxResponse<{ instId: string; ctVal: string }[]>;
    if (json.code === '0') for (const it of json.data) map.set(it.instId, Number(it.ctVal) || 1);
  } catch {
    // 拉不到面值就退化为「张」为单位，不阻断同步
  }
  return map;
}

export type OkxPositionHistoryRow = {
  posId: string;
  instType: string;
  instId: string;
  mgnMode: string;
  type: string;
  direction: string;
  posSide: string;
  openAvgPx: string;
  closeAvgPx: string;
  closeTotalPos: string;
  openMaxPos: string;
  lever: string;
  realizedPnl: string;
  pnl: string;
  fee: string;
  fundingFee: string;
  liqPenalty: string;
  settledPnl: string;
  pnlRatio: string;
  ccy: string;
  cTime: string;
  uTime: string;
};

export type OkxPositionRow = {
  instType: string;
  mgnMode: string;
  posId: string;
  posSide: string;
  pos: string;
  baseCcy: string;
  quoteCcy: string;
  ccy: string;
  avgPx: string;
  markPx: string;
  upl: string;
  uplRatio: string;
  lever: string;
  liqPx: string;
  imr: string;
  margin: string;
  mmr: string;
  notionalUsd: string;
  adl: string;
  last: string;
  cTime: string;
  uTime: string;
  instId: string;
};

export async function fetchOpenPositions(
  cred: OkxCredentials,
  opts: { instType?: string } = {},
): Promise<OkxPositionRow[]> {
  const instType = opts.instType ?? 'SWAP';
  const rows = await okxGet<OkxPositionRow[]>(`/api/v5/account/positions?instType=${instType}`, cred);
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => Math.abs(Number(r.pos) || 0) > 0);
}

export async function fetchPositionsHistory(
  cred: OkxCredentials,
  opts: { instType?: string; maxPages?: number } = {},
): Promise<OkxPositionHistoryRow[]> {
  const instType = opts.instType ?? 'SWAP';
  const maxPages = opts.maxPages ?? 30;
  const out: OkxPositionHistoryRow[] = [];
  const seen = new Set<string>();
  let after = '';
  for (let page = 0; page < maxPages; page++) {
    const qs = `/api/v5/account/positions-history?instType=${instType}&limit=100${after ? `&after=${after}` : ''}`;
    const rows = await okxGet<OkxPositionHistoryRow[]>(qs, cred);
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const r of rows) {
      const key = `${r.posId}:${r.uTime}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(r);
      }
    }
    if (rows.length < 100) break;
    const oldest = rows[rows.length - 1].uTime;
    if (!oldest || oldest === after) break;
    after = oldest;
  }
  return out;
}
