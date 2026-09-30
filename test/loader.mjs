// 测试用模块解析 loader：把项目里的 @trademind/* / @tm/* 别名和 expo-sqlite 指向真实源码 / 替身。
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve as pathResolve } from 'node:path';
import { existsSync } from 'node:fs';

const ROOT = 'D:/repos/trademind-mobile';

export async function resolve(specifier, context, next) {
  if (specifier === 'expo-sqlite') {
    return { url: pathToFileURL(pathResolve(ROOT, 'test/expo-sqlite-shim.mjs')).href, shortCircuit: true };
  }
  if (specifier === '@trademind/trading-core') {
    return { url: pathToFileURL(pathResolve(ROOT, 'src/core/trading-core/src/index.ts')).href, shortCircuit: true };
  }
  if (specifier === '@trademind/analytics') {
    return { url: pathToFileURL(pathResolve(ROOT, 'src/core/analytics/src/index.ts')).href, shortCircuit: true };
  }
  if (specifier.startsWith('@tm/')) {
    let p = pathResolve(ROOT, 'src', specifier.slice(4));
    if (!p.endsWith('.ts')) {
      if (existsSync(p + '.ts')) p += '.ts';
      else p = pathResolve(p, 'index.ts');
    }
    return { url: pathToFileURL(p).href, shortCircuit: true };
  }
  // 相对导入缺少扩展名时补 .ts（Node ESM 要求显式扩展名）
  if (specifier.startsWith('.') && !/\.(ts|tsx|mjs|js|json)$/.test(specifier)) {
    const asTs = new URL(specifier + '.ts', context.parentURL);
    if (existsSync(fileURLToPath(asTs))) return { url: asTs.href, shortCircuit: true };
  }
  return next(specifier, context);
}
