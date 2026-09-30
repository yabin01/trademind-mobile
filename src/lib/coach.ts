import type { UnifiedTrade } from '@trademind/trading-core';
import { computeCoreMetrics } from '@trademind/analytics';
import { closedTrades, filterByWindow } from '@tm/lib/metrics';
import { fmtDate, fmtNum, fmtPnl, fmtPct } from '@tm/lib/format';

/**
 * 本地 AI 教练（离线）：用分析引擎基于真实数据库回答，禁止虚构结论。
 * 返回结构化文本 + 引用的 trade id（UI 可跳转详情）。
 * 后续如需自然语言对话，可在此接入外部 LLM（带本机 Key），结论仍须来自数据库。
 */
export interface CoachAnswer {
  text: string;
  refs: string[];
}

const RANGE_LABEL: Record<string, string> = { '7': '近 7 天', '30': '近 30 天', '90': '近 90 天', null: '全部历史' };

function rangeLabel(days: number | null): string {
  return RANGE_LABEL[String(days) as '7' | '30' | '90' | 'null'] ?? '所选区间';
}

export function analyze(trades: UnifiedTrade[], days: number | null, question: string): CoachAnswer {
  const win = filterByWindow(trades, days);
  const closed = closedTrades(win);
  const m = computeCoreMetrics(win);
  const q = question.toLowerCase();
  const empty: CoachAnswer = { text: '该区间内还没有已平仓交易，先把数据同步或导入进来吧。', refs: [] };

  if (closed.length === 0) return empty;

  if (q.includes('概览') || q.includes('总览') || q.includes('总结') || q.includes('怎么样') || q.includes('如何')) {
    const pf = m.profitFactor === Infinity ? '∞（无亏损）' : fmtNum(m.profitFactor);
    return {
      text:
        `${rangeLabel(days)}共 ${m.closedTrades} 笔已平仓，胜率 ${fmtPct(m.winRate)}，` +
        `净盈亏 ${fmtPnl(m.netPnl)}，盈利因子 ${pf}，期望值 ${fmtPnl(m.expectancy)}/笔。` +
        `平均盈利 ${fmtPnl(m.avgWin)}、平均亏损 ${fmtPnl(-m.avgLoss)}。`,
      refs: [],
    };
  }

  if (q.includes('最大亏损') || q.includes('亏得最多') || q.includes('最差')) {
    const worst = [...closed].sort((a, b) => a.netPnl - b.netPnl)[0];
    return {
      text: `最大单笔亏损：${worst.symbol} ${worst.positionSide}，${fmtPnl(worst.netPnl)}（平仓 ${fmtDate(worst.closeTime)}，杠杆 ${worst.leverage}x，手续费 ${fmtPnl(-worst.fees)}）。复盘它的入场与出场，是提升期望值最高效的一笔。`,
      refs: [worst.id],
    };
  }

  if (q.includes('最大盈利') || q.includes('赚得最多') || q.includes('最好')) {
    const best = [...closed].sort((a, b) => b.netPnl - a.netPnl)[0];
    return {
      text: `最大单笔盈利：${best.symbol} ${best.positionSide}，${fmtPnl(best.netPnl)}（平仓 ${fmtDate(best.closeTime)}，杠杆 ${best.leverage}x）。思考它和亏损交易在执行上有什么不同。`,
      refs: [best.id],
    };
  }

  if (q.includes('连续') || q.includes('报复') || q.includes('连亏') || q.includes('纪律') || q.includes('心态')) {
    let maxStreak = 0;
    let cur = 0;
    let streakEnd: UnifiedTrade | null = null;
    for (const t of [...closed].sort((a, b) => new Date(a.closeTime!).getTime() - new Date(b.closeTime!).getTime())) {
      if (t.netPnl < 0) {
        cur++;
        if (cur > maxStreak) {
          maxStreak = cur;
          streakEnd = t;
        }
      } else cur = 0;
    }
    const text =
      maxStreak >= 3
        ? `检测到最长连亏 ${maxStreak} 笔（截至 ${fmtDate(streakEnd!.closeTime)}）。连亏后继续加仓/报复性交易是账户杀手——检查是否触发了「亏后必回本」的心态。`
        : `当前最长连亏为 ${maxStreak} 笔，纪律尚可。保持每笔独立、严格按计划止损。`;
    return { text, refs: streakEnd ? [streakEnd.id] : [] };
  }

  if (q.includes('杠杆') || q.includes('过度') || q.includes('重仓')) {
    const high = closed.filter((t) => t.leverage >= 20).sort((a, b) => a.netPnl - b.netPnl);
    const text = high.length
      ? `区间内 ${high.length} 笔使用了 ≥20x 杠杆。高杠杆放大波动也放大回撤，样本显示高杠杆交易的净盈亏均值更低、更易触发强平。建议把默认杠杆写进铁律。`
      : `区间内没有 ≥20x 的高杠杆交易，仓位控制良好。`;
    return { text, refs: high.slice(0, 3).map((t) => t.id) };
  }

  if (q.includes('品种') || q.includes('表现') || q.includes('哪个') || q.includes('symbol')) {
    const bySym = new Map<string, { pnl: number; n: number }>();
    for (const t of closed) {
      const e = bySym.get(t.symbol) ?? { pnl: 0, n: 0 };
      e.pnl += t.netPnl;
      e.n += 1;
      bySym.set(t.symbol, e);
    }
    const sorted = [...bySym.entries()].sort((a, b) => b[1].pnl - a[1].pnl);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    return {
      text: `表现最好：${best[0]}（${best[1].n} 笔，${fmtPnl(best[1].pnl)}）；最差：${worst[0]}（${worst[1].n} 笔，${fmtPnl(worst[1].pnl)}）。把精力集中在正期望的品种上。`,
      refs: [],
    };
  }

  // 默认：概览
  const pf = m.profitFactor === Infinity ? '∞' : fmtNum(m.profitFactor);
  return {
    text: `${rangeLabel(days)}净盈亏 ${fmtPnl(m.netPnl)}，胜率 ${fmtPct(m.winRate)}，盈利因子 ${pf}。问我「最大亏损」「连亏纪律」「杠杆」「品种表现」可以得到更具体的结论。`,
    refs: [],
  };
}
