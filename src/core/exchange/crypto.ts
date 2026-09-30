import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';
import { fromByteArray } from 'base64-js';

/**
 * OKX 签名：Base64(HMAC-SHA256(secret, timestamp + method + requestPath + body))。
 * 用 @noble/hashes（纯 JS）替代 node:crypto，避免 RN 原生模块依赖。
 */
export function hmacSha256Base64(secret: string, message: string): string {
  const sig = hmac(sha256, utf8ToBytes(secret), utf8ToBytes(message));
  return fromByteArray(sig);
}
