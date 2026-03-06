/**
 * packages/cache 装饰器单元测试
 *
 * 使用内存 CacheManager 实现，无需真实 Redis 连接。
 * 覆盖 @Cacheable、@CachePut、@CacheEvict 的核心行为，
 * 以及 user.service.ts 中典型的缓存集成场景。
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  Cacheable,
  CachePut,
  CacheEvict,
  setCacheManager,
  clearCacheManager,
  isCacheManagerInitialized,
  getCacheComponentMetadata,
} from '../index.js';
import type { Cache, CacheManager } from '../index.js';

// ==================== In-Memory CacheManager (测试用) ====================

class MapCache implements Cache {
  private store = new Map<string, { value: string; expiresAt?: number }>();
  constructor(public readonly name: string) {}

  getName() {
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

  size(): number {
    return this.store.size;
  }
}

class InMemoryCacheManager implements CacheManager {
  private caches = new Map<string, MapCache>();

  getCache(name: string): MapCache {
    if (!this.caches.has(name)) {
      this.caches.set(name, new MapCache(name));
    }
    return this.caches.get(name)!;
  }
}

// ==================== 测试实体 ====================

interface User {
  id: number;
  name: string;
  email: string;
}

// ==================== 测试服务 (模拟 user.service.ts 的缓存模式) ====================

class UserService {
  private db: Map<number, User> = new Map([
    [1, { id: 1, name: '张三', email: 'zhangsan@example.com' }],
    [2, { id: 2, name: '李四', email: 'lisi@example.com' }],
  ]);

  // 记录实际 DB 调用次数（验证缓存命中时不调用 DB）
  dbCallCount = 0;

  /** 查询单个用户 — @Cacheable */
  @Cacheable({ key: 'user', ttl: 300 })
  async getUserById(id: number): Promise<User | null> {
    this.dbCallCount++;
    return this.db.get(id) ?? null;
  }

  /** 查询所有用户 — @Cacheable */
  @Cacheable({ key: 'user:list', ttl: 60 })
  async getAllUsers(): Promise<User[]> {
    this.dbCallCount++;
    return Array.from(this.db.values());
  }

  /** 创建用户 — @CacheEvict(allEntries) */
  @CacheEvict({ key: 'user:list', allEntries: true })
  async createUser(data: Omit<User, 'id'>): Promise<User> {
    const id = this.db.size + 10; // 简单 ID 生成
    const user: User = { id, ...data };
    this.db.set(id, user);
    return user;
  }

  /** 更新用户 — @CachePut */
  @CachePut({ key: 'user', ttl: 300, keyGenerator: (id: unknown) => String(id as number) })
  async updateUser(id: number, data: Partial<Omit<User, 'id'>>): Promise<User> {
    const user = this.db.get(id);
    if (!user) throw new Error('用户不存在');
    const updated = { ...user, ...data };
    this.db.set(id, updated);
    return updated;
  }

  /** 删除用户 — @CacheEvict */
  @CacheEvict({ key: 'user' })
  async deleteUser(id: number): Promise<boolean> {
    return this.db.delete(id);
  }
}

// ==================== 测试套件 ====================

describe('@ai-first/cache 装饰器', () => {
  let manager: InMemoryCacheManager;
  let userService: UserService;

  beforeEach(() => {
    manager = new InMemoryCacheManager();
    setCacheManager(manager);
    userService = new UserService();
  });

  afterEach(() => {
    clearCacheManager();
    vi.restoreAllMocks();
  });

  // ────────────────────────────────────────────
  // CacheManager 注册表
  // ────────────────────────────────────────────

  describe('CacheManager 注册表', () => {
    it('setCacheManager 后 isCacheManagerInitialized 返回 true', () => {
      expect(isCacheManagerInitialized()).toBe(true);
    });

    it('clearCacheManager 后 isCacheManagerInitialized 返回 false', () => {
      clearCacheManager();
      expect(isCacheManagerInitialized()).toBe(false);
    });
  });

  // ────────────────────────────────────────────
  // @Cacheable
  // ────────────────────────────────────────────

  describe('@Cacheable', () => {
    it('第一次查询应访问 DB 并将结果写入缓存', async () => {
      const user = await userService.getUserById(1);
      expect(user).toEqual({ id: 1, name: '张三', email: 'zhangsan@example.com' });
      expect(userService.dbCallCount).toBe(1);

      // 缓存中应有数据
      const cached = await manager.getCache('user').get('1');
      expect(cached).not.toBeNull();
      expect(JSON.parse(cached!)).toEqual(user);
    });

    it('第二次查询应命中缓存，不再访问 DB', async () => {
      await userService.getUserById(1);
      const callsBefore = userService.dbCallCount;

      const user = await userService.getUserById(1);
      expect(user).toEqual({ id: 1, name: '张三', email: 'zhangsan@example.com' });
      expect(userService.dbCallCount).toBe(callsBefore); // 无新的 DB 调用
    });

    it('未命中缓存时（id 不存在）返回 null，不缓存 null', async () => {
      const user = await userService.getUserById(999);
      expect(user).toBeNull();

      // null 不应被缓存
      const cached = await manager.getCache('user').get('999');
      expect(cached).toBeNull();
    });

    it('未注册 CacheManager 时直接调用原方法（graceful degradation）', async () => {
      clearCacheManager();

      const user = await userService.getUserById(1);
      expect(user).toEqual({ id: 1, name: '张三', email: 'zhangsan@example.com' });
      expect(userService.dbCallCount).toBe(1);
    });

    it('condition 为 false 时跳过缓存', async () => {
      class ConditionalService {
        callCount = 0;

        @Cacheable({
          key: 'cond',
          ttl: 60,
          condition: (id: unknown) => (id as number) > 0,
        })
        async fetch(id: number): Promise<number> {
          this.callCount++;
          return id;
        }
      }

      const svc = new ConditionalService();

      // id = -1 不满足 condition，不缓存
      await svc.fetch(-1);
      await svc.fetch(-1);
      expect(svc.callCount).toBe(2);

      // id = 1 满足 condition，第二次命中缓存
      await svc.fetch(1);
      await svc.fetch(1);
      expect(svc.callCount).toBe(3);
    });
  });

  // ────────────────────────────────────────────
  // @CachePut
  // ────────────────────────────────────────────

  describe('@CachePut', () => {
    it('执行方法后将返回值写入缓存', async () => {
      const updated = await userService.updateUser(1, { name: '张三（已更新）' });
      expect(updated.name).toBe('张三（已更新）');

      const cached = await manager.getCache('user').get('1');
      expect(cached).not.toBeNull();
      expect(JSON.parse(cached!).name).toBe('张三（已更新）');
    });

    it('@CachePut 后 @Cacheable 应读取更新后的缓存', async () => {
      // 先写入旧缓存
      await userService.getUserById(1);

      // 更新并写入新缓存
      await userService.updateUser(1, { name: '新名字' });

      // 再次查询应直接读取新缓存，不访问 DB
      const callsBefore = userService.dbCallCount;
      const user = await userService.getUserById(1);
      expect(user?.name).toBe('新名字');
      expect(userService.dbCallCount).toBe(callsBefore);
    });
  });

  // ────────────────────────────────────────────
  // @CacheEvict
  // ────────────────────────────────────────────

  describe('@CacheEvict', () => {
    it('删除用户后缓存条目应被清除', async () => {
      // 先缓存用户 2
      await userService.getUserById(2);
      expect(await manager.getCache('user').get('2')).not.toBeNull();

      // 删除后缓存应清除
      await userService.deleteUser(2);
      expect(await manager.getCache('user').get('2')).toBeNull();
    });

    it('allEntries=true 应清空整个命名空间缓存', async () => {
      // 先缓存列表
      await userService.getAllUsers();
      expect((manager.getCache('user:list') as MapCache).size()).toBeGreaterThan(0);

      // 创建新用户后列表缓存应被清空
      await userService.createUser({ name: '王五', email: 'wangwu@example.com' });
      expect((manager.getCache('user:list') as MapCache).size()).toBe(0);
    });

    it('清除后再次查询应重新访问 DB', async () => {
      await userService.getAllUsers();
      const callsBefore = userService.dbCallCount;

      // 清除缓存
      await userService.createUser({ name: '王五', email: 'wangwu@example.com' });

      // 重新查询应访问 DB
      await userService.getAllUsers();
      expect(userService.dbCallCount).toBeGreaterThan(callsBefore);
    });
  });

  // ────────────────────────────────────────────
  // 元数据
  // ────────────────────────────────────────────

  describe('CACHE_COMPONENT_METADATA 自动标记', () => {
    it('使用缓存装饰器的类应自动携带缓存组件元数据', () => {
      const meta = getCacheComponentMetadata(UserService);
      expect(meta).toBeDefined();
      expect(meta?.className).toBe('UserService');
    });
  });

  // ────────────────────────────────────────────
  // 集成场景：模拟 user.service.ts 的完整 CRUD 流程
  // ────────────────────────────────────────────

  describe('集成场景：CRUD 缓存联动', () => {
    it('查询 → 更新 → 再查询：缓存始终保持最新', async () => {
      // 1. 首次查询，访问 DB
      const user = await userService.getUserById(1);
      expect(user?.name).toBe('张三');

      // 2. 更新用户
      await userService.updateUser(1, { name: '张三v2' });

      // 3. 再次查询，应读取更新后的缓存
      const updated = await userService.getUserById(1);
      expect(updated?.name).toBe('张三v2');
    });

    it('查询 → 删除 → 再查询：缓存失效后重新访问 DB', async () => {
      // 1. 首次查询并缓存
      await userService.getUserById(2);
      const callsBefore = userService.dbCallCount;

      // 2. 删除，清除缓存
      await userService.deleteUser(2);

      // 3. 再次查询，缓存已失效，访问 DB（DB 中已删除，返回 null）
      const result = await userService.getUserById(2);
      expect(result).toBeNull();
      expect(userService.dbCallCount).toBeGreaterThan(callsBefore);
    });
  });
});
