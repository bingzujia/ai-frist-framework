/**
 * CacheManager Registry tests
 *
 * Verifies that setCacheManager / getCacheManager / isCacheManagerInitialized /
 * clearCacheManager behave correctly in isolation.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearCacheManager,
  getCacheManager,
  isCacheManagerInitialized,
  setCacheManager,
} from '../cache-manager-registry.js';
import type { Cache, CacheManager } from '../spi/cache.js';

// ---------------------------------------------------------------------------
// Minimal in-memory Cache / CacheManager stubs for testing
// ---------------------------------------------------------------------------

class MapCache implements Cache {
  private store = new Map<string, { value: string; expiresAt?: number }>();
  constructor(public readonly name: string) {}
  getName() {
    return this.name;
  }
  async get(entryKey: string): Promise<string | null> {
    const entry = this.store.get(entryKey);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(entryKey);
      return null;
    }
    return entry.value;
  }
  async put(entryKey: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(entryKey, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }
  async evict(entryKey: string): Promise<void> {
    this.store.delete(entryKey);
  }
  async clear(): Promise<void> {
    this.store.clear();
  }
}

class InMemoryCacheManager implements CacheManager {
  private caches = new Map<string, MapCache>();
  getCache(name: string): Cache {
    if (!this.caches.has(name)) this.caches.set(name, new MapCache(name));
    return this.caches.get(name)!;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CacheManager Registry', () => {
  afterEach(() => clearCacheManager());

  it('returns null when no manager is registered', () => {
    expect(getCacheManager()).toBeNull();
  });

  it('isCacheManagerInitialized returns false before registration', () => {
    expect(isCacheManagerInitialized()).toBe(false);
  });

  it('setCacheManager registers the manager', () => {
    const manager = new InMemoryCacheManager();
    setCacheManager(manager);
    expect(getCacheManager()).toBe(manager);
  });

  it('isCacheManagerInitialized returns true after registration', () => {
    setCacheManager(new InMemoryCacheManager());
    expect(isCacheManagerInitialized()).toBe(true);
  });

  it('clearCacheManager resets the registry', () => {
    setCacheManager(new InMemoryCacheManager());
    clearCacheManager();
    expect(getCacheManager()).toBeNull();
    expect(isCacheManagerInitialized()).toBe(false);
  });

  it('allows replacing the manager with a new instance', () => {
    const first = new InMemoryCacheManager();
    const second = new InMemoryCacheManager();
    setCacheManager(first);
    setCacheManager(second);
    expect(getCacheManager()).toBe(second);
  });
});
