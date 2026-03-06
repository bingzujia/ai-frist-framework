/**
 * 内存缓存后端工具 — 测试专用
 *
 * 实现 Cache / CacheManager SPI，以纯 Map 替代 Redis，
 * 使缓存相关单元测试无需启动任何外部服务。
 *
 * 对应缓存 SPI 文档中的内存缓存实现示例：
 * @see packages/cache/src/spi/cache.ts
 */

import type { Cache, CacheManager } from '@ai-first/cache';

// ==================== MapCache ====================

/**
 * 单个缓存命名空间的内存实现
 *
 * 支持可选的 TTL 过期机制（基于时间戳比较）。
 */
export class MapCache implements Cache {
  private readonly store = new Map<string, { value: string; expiresAt?: number }>();

  constructor(private readonly name: string) {}

  getName(): string {
    return this.name;
  }

  async get(entryKey: string): Promise<string | null> {
    const entry = this.store.get(entryKey);
    if (!entry) return null;
    if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
      this.store.delete(entryKey);
      return null;
    }
    return entry.value;
  }

  async put(entryKey: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(entryKey, {
      value,
      expiresAt: ttlSeconds !== undefined ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async evict(entryKey: string): Promise<void> {
    this.store.delete(entryKey);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  /** 测试辅助：返回当前存储的条目数（不含已过期） */
  size(): number {
    return this.store.size;
  }

  /** 测试辅助：以同步方式检查指定条目是否存在（用于断言） */
  has(entryKey: string): boolean {
    return this.store.has(entryKey);
  }
}

// ==================== MapCacheManager ====================

/**
 * 内存缓存管理器
 *
 * 按需创建并缓存 MapCache 实例（懒加载）。
 */
export class MapCacheManager implements CacheManager {
  private readonly caches = new Map<string, MapCache>();

  getCache(name: string): MapCache {
    let cache = this.caches.get(name);
    if (!cache) {
      cache = new MapCache(name);
      this.caches.set(name, cache);
    }
    return cache;
  }

  /** 测试辅助：直接获取已存在的 MapCache（若不存在则返回 undefined） */
  getCacheIfExists(name: string): MapCache | undefined {
    return this.caches.get(name);
  }
}
