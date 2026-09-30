import * as SecureStore from 'expo-secure-store';

/**
 * 交易所凭证安全存储：存于安卓 Keystore（expo-secure-store），
 * 比桌面端明文存数据库更安全。数据不出手机，无需服务端鉴权。
 */

// 注意：SecureStore key 只允许字母数字与 . - _，冒号会抛 "Invalid key"
const keyFor = (connectionId: string) => `tm.cred.${connectionId}`;

export async function saveCredential(connectionId: string, value: unknown): Promise<void> {
  await SecureStore.setItemAsync(keyFor(connectionId), JSON.stringify(value));
}

export async function loadCredential<T = unknown>(connectionId: string): Promise<T | null> {
  const raw = await SecureStore.getItemAsync(keyFor(connectionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function deleteCredential(connectionId: string): Promise<void> {
  await SecureStore.deleteItemAsync(keyFor(connectionId));
}
