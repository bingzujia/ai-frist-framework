/**
 * Cache Decorators tests
 *
 * Uses an in-memory CacheManager (no Redis required) to verify:
 * - @Cacheable: cache miss → DB call; cache hit → no DB call; null not cached
 * - @Cacheable: condition and unless options
 * - @CachePut: always writes to cache; result coherent with subsequent @Cacheable
 * - @CacheEvict: evicts single entry; allEntries clears namespace; re-fetch hits DB
 * - CACHE_COMPONENT_METADATA auto-marking
 * - Graceful degradation when no CacheManager is registered
 */
import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CACHE_COMPONENT_METADATA,
  REDIS_COMPONENT_METADATA,
  Cacheable,
  CacheEvict,
  CachePut,
  getCacheComponentMetadata,
} from '../decorators.js';
import { clearCacheManager, setCacheManager } from '../cache-manager-registry.js';
import type { Cache, CacheManager } from '../spi/cache.js';

// ---------------------------------------------------------------------------
// In-memory CacheManager (no external deps)
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
// Sample service used in tests
// ---------------------------------------------------------------------------

interface User {
  id: number;
  name: string;
}

class UserService {
  // Counts raw DB calls (spy target)
  dbCallCount = 0;
  private db: Map<number, User> = new Map([
    [1, { id: 1, name: 'Alice' }],
    [2, { id: 2, name: 'Bob' }],
  ]);

  @Cacheable({ key: 'user', ttl: 60 })
  async getUser(id: number): Promise<User | null> {
    this.dbCallCount++;
    return this.db.get(id) ?? null;
  }

  @Cacheable({ key: 'user', keyGenerator: (id: number) => `custom:${id}` })
  async getUserCustomKey(id: number): Promise<User | null> {
    this.dbCallCount++;
    return this.db.get(id) ?? null;
  }

  @Cacheable({ key: 'user', condition: (id: number) => id > 0 })
  async getUserWithCondition(id: number): Promise<User | null> {
    this.dbCallCount++;
    return this.db.get(id) ?? null;
  }

  @CachePut({ key: 'user', ttl: 60, keyGenerator: (id: number) => String(id) })
  async updateUser(id: number, name: string): Promise<User> {
    this.dbCallCount++;
    const user = { id, name };
    this.db.set(id, user);
    return user;
  }

  @CacheEvict({ key: 'user' })
  async deleteUser(id: number): Promise<void> {
    this.dbCallCount++;
    this.db.delete(id);
  }

  @CacheEvict({ key: 'user', allEntries: true })
  async clearAllUsers(): Promise<void> {
    this.dbCallCount++;
    this.db.clear();
  }

  @CacheEvict({ key: 'user', beforeInvocation: true })
  async deleteUserBeforeInvocation(id: number): Promise<void> {
    this.dbCallCount++;
    this.db.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('@Cacheable', () => {
  let service: UserService;

  beforeEach(() => {
    setCacheManager(new InMemoryCacheManager());
    service = new UserService();
  });

  afterEach(() => clearCacheManager());

  it('cache miss: calls DB and returns value', async () => {
    const user = await service.getUser(1);
    expect(user).toEqual({ id: 1, name: 'Alice' });
    expect(service.dbCallCount).toBe(1);
  });

  it('cache hit: returns cached value without calling DB again', async () => {
    await service.getUser(1);
    const cached = await service.getUser(1);
    expect(cached).toEqual({ id: 1, name: 'Alice' });
    expect(service.dbCallCount).toBe(1); // only one DB call
  });

  it('different keys are cached independently', async () => {
    await service.getUser(1);
    await service.getUser(2);
    expect(service.dbCallCount).toBe(2);
    // Both should now be cached
    await service.getUser(1);
    await service.getUser(2);
    expect(service.dbCallCount).toBe(2);
  });

  it('null result is not cached (re-fetches on next call)', async () => {
    const result = await service.getUser(999); // not in DB
    expect(result).toBeNull();
    expect(service.dbCallCount).toBe(1);

    await service.getUser(999);
    expect(service.dbCallCount).toBe(2); // null was not cached → DB called again
  });

  it('custom keyGenerator is used for the cache key', async () => {
    await service.getUserCustomKey(1);
    await service.getUserCustomKey(1);
    expect(service.dbCallCount).toBe(1); // cache hit with custom key
  });

  it('condition=false skips cache entirely (always calls DB)', async () => {
    await service.getUserWithCondition(-1); // condition: id > 0 → false
    await service.getUserWithCondition(-1);
    expect(service.dbCallCount).toBe(2); // not cached
  });

  it('condition=true uses cache normally', async () => {
    await service.getUserWithCondition(1);
    await service.getUserWithCondition(1);
    expect(service.dbCallCount).toBe(1); // cached
  });

  it('graceful degradation: no CacheManager → still returns value', async () => {
    clearCacheManager();
    const user = await service.getUser(1);
    expect(user).toEqual({ id: 1, name: 'Alice' });
  });
});

describe('@CachePut', () => {
  let service: UserService;

  beforeEach(() => {
    setCacheManager(new InMemoryCacheManager());
    service = new UserService();
  });

  afterEach(() => clearCacheManager());

  it('always calls DB and writes result to cache', async () => {
    const updated = await service.updateUser(1, 'Alice Updated');
    expect(updated).toEqual({ id: 1, name: 'Alice Updated' });
    expect(service.dbCallCount).toBe(1);
  });

  it('subsequent @Cacheable reads the updated value from cache', async () => {
    await service.updateUser(1, 'Alice Updated');
    const cached = await service.getUser(1);
    // @CachePut used default key generator (just the id), so key is "1"
    // @Cacheable also uses the same default key generator for id=1 → "1"
    expect(cached).toEqual({ id: 1, name: 'Alice Updated' });
    expect(service.dbCallCount).toBe(1); // only the updateUser call
  });

  it('graceful degradation: no CacheManager → still returns value', async () => {
    clearCacheManager();
    const updated = await service.updateUser(1, 'No Cache');
    expect(updated).toEqual({ id: 1, name: 'No Cache' });
  });
});

describe('@CacheEvict', () => {
  let service: UserService;

  beforeEach(() => {
    setCacheManager(new InMemoryCacheManager());
    service = new UserService();
  });

  afterEach(() => clearCacheManager());

  it('evicts single entry; next @Cacheable call hits DB', async () => {
    await service.getUser(1); // populate cache
    expect(service.dbCallCount).toBe(1);

    await service.deleteUser(1); // evict + DB delete
    expect(service.dbCallCount).toBe(2);

    await service.getUser(1); // cache miss → DB call (returns null now)
    expect(service.dbCallCount).toBe(3);
  });

  it('allEntries=true clears entire namespace', async () => {
    await service.getUser(1);
    await service.getUser(2);
    expect(service.dbCallCount).toBe(2);

    await service.clearAllUsers();
    expect(service.dbCallCount).toBe(3);

    await service.getUser(1); // both should be cache misses now
    await service.getUser(2);
    expect(service.dbCallCount).toBe(5);
  });

  it('beforeInvocation=true evicts before method executes', async () => {
    await service.getUser(1); // populate cache
    await service.deleteUserBeforeInvocation(1);
    // After this, cache is clear AND DB entry is removed
    const result = await service.getUser(1);
    expect(result).toBeNull(); // DB entry deleted
  });

  it('graceful degradation: no CacheManager → still executes method', async () => {
    clearCacheManager();
    await expect(service.deleteUser(1)).resolves.toBeUndefined();
  });
});

describe('CACHE_COMPONENT_METADATA auto-marking', () => {
  it('class decorated with @Cacheable method is auto-marked', () => {
    expect(getCacheComponentMetadata(UserService)).toBeDefined();
    expect(getCacheComponentMetadata(UserService)?.className).toBe('UserService');
  });

  it('REDIS_COMPONENT_METADATA is the same symbol as CACHE_COMPONENT_METADATA', () => {
    expect(REDIS_COMPONENT_METADATA).toBe(CACHE_COMPONENT_METADATA);
  });

  it('getRedisComponentMetadata is an alias for getCacheComponentMetadata', async () => {
    // Verify they return the same value for the same class
    const { getRedisComponentMetadata } = await import('../decorators.js');
    expect(getRedisComponentMetadata(UserService)).toEqual(getCacheComponentMetadata(UserService));
  });
});

describe('Integration: get → update → get coherence', () => {
  let service: UserService;

  beforeEach(() => {
    setCacheManager(new InMemoryCacheManager());
    service = new UserService();
  });

  afterEach(() => clearCacheManager());

  it('full cache coherence flow: read → update → read', async () => {
    // First read populates cache
    const original = await service.getUser(1);
    expect(original?.name).toBe('Alice');
    expect(service.dbCallCount).toBe(1);

    // Update overwrites cache
    await service.updateUser(1, 'Alice V2');
    expect(service.dbCallCount).toBe(2);

    // Read returns updated value from cache (no DB hit)
    const updated = await service.getUser(1);
    expect(updated?.name).toBe('Alice V2');
    expect(service.dbCallCount).toBe(2);
  });

  it('full cache coherence flow: read → delete → read', async () => {
    await service.getUser(1);
    expect(service.dbCallCount).toBe(1);

    await service.deleteUser(1);
    expect(service.dbCallCount).toBe(2);

    const after = await service.getUser(1);
    expect(after).toBeNull(); // DB entry gone
    expect(service.dbCallCount).toBe(3); // cache was evicted → DB call
  });
});
