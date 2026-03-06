/**
 * Cache 功能测试
 *
 * 验证 @ai-first/cache 中三个核心缓存注解的行为：
 * - @Cacheable  — 读通缓存（cache-aside）
 * - @CachePut   — 写通缓存
 * - @CacheEvict — 缓存失效
 *
 * 测试使用内存缓存后端（MapCacheManager），无需 Redis 服务。
 * 通过 vi.spyOn / vi.fn 跟踪"数据库层"调用次数，验证缓存是否生效。
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Service } from '@ai-first/core';
import {
  Cacheable,
  CachePut,
  CacheEvict,
  setCacheManager,
  clearCacheManager,
} from '@ai-first/cache';
import { MapCacheManager } from './in-memory-cache.js';

// ==================== 测试用实体 ====================

interface User {
  id: number;
  name: string;
  email: string;
}

// ==================== 测试用 Service ====================

/**
 * 简化版用户缓存服务，用于独立验证各缓存注解。
 *
 * 与生产代码不同，此处直接接受 dbFn 函数作为"数据库层"，
 * 便于在测试中注入 spy 并统计实际调用次数。
 */
@Service()
class TestUserCacheService {
  constructor(
    private readonly fetchById: (id: number) => Promise<User | null>,
    private readonly fetchAll: () => Promise<User[]>,
    private readonly saveUser: (user: User) => Promise<User>,
    private readonly removeUser: (id: number) => Promise<boolean>,
  ) {}

  /** @Cacheable：先查缓存，未命中则执行方法并回填 */
  @Cacheable({ key: 'user', ttl: 300 })
  async getUserById(id: number): Promise<User | null> {
    return this.fetchById(id);
  }

  /** @Cacheable：无参数时 entryKey 为空字符串，退化为命名空间缓存 */
  @Cacheable({ key: 'user:list', ttl: 60 })
  async getAllUsers(): Promise<User[]> {
    return this.fetchAll();
  }

  /** @CachePut：总是执行方法，然后更新缓存 */
  @CachePut({ key: 'user', ttl: 300, keyGenerator: (u: unknown) => String((u as User).id) })
  async saveAndCacheUser(user: User): Promise<User> {
    return this.saveUser(user);
  }

  /** @CacheEvict：执行方法后删除单条缓存 */
  @CacheEvict({ key: 'user' })
  async deleteUser(id: number): Promise<boolean> {
    return this.removeUser(id);
  }

  /** @CacheEvict(allEntries)：清空整个命名空间 */
  @CacheEvict({ key: 'user:list', allEntries: true })
  async invalidateUserList(): Promise<void> {
    // 仅用于清空列表缓存，无底层操作
  }

  /** @CacheEvict(beforeInvocation)：在方法执行前清除缓存 */
  @CacheEvict({ key: 'user', beforeInvocation: true })
  async deleteUserBeforeEvict(id: number): Promise<boolean> {
    return this.removeUser(id);
  }

  /** @Cacheable(condition)：条件为 false 时跳过缓存 */
  @Cacheable({ key: 'user', ttl: 300, condition: (id: unknown) => (id as number) > 0 })
  async getUserByIdWithCondition(id: number): Promise<User | null> {
    return this.fetchById(id);
  }
}

// ==================== 测试套件 ====================

describe('@ai-first/cache — 缓存注解单元测试', () => {
  let cacheManager: MapCacheManager;
  let fetchById: ReturnType<typeof vi.fn<[number], Promise<User | null>>>;
  let fetchAll: ReturnType<typeof vi.fn<[], Promise<User[]>>>;
  let saveUser: ReturnType<typeof vi.fn<[User], Promise<User>>>;
  let removeUser: ReturnType<typeof vi.fn<[number], Promise<boolean>>>;
  let svc: TestUserCacheService;

  const USER_1: User = { id: 1, name: '张三', email: 'zhangsan@example.com' };
  const USER_2: User = { id: 2, name: '李四', email: 'lisi@example.com' };

  beforeEach(() => {
    cacheManager = new MapCacheManager();
    setCacheManager(cacheManager);

    fetchById = vi.fn(async (id: number) => (id === 1 ? USER_1 : id === 2 ? USER_2 : null));
    fetchAll = vi.fn(async () => [USER_1, USER_2]);
    saveUser = vi.fn(async (u: User) => u);
    removeUser = vi.fn(async () => true);

    svc = new TestUserCacheService(fetchById, fetchAll, saveUser, removeUser);
  });

  afterEach(() => {
    clearCacheManager();
    vi.restoreAllMocks();
  });

  // ──────────────────────────────────────────────
  // @Cacheable
  // ──────────────────────────────────────────────

  describe('@Cacheable', () => {
    it('第一次调用时访问数据库并将结果写入缓存', async () => {
      const result = await svc.getUserById(1);

      expect(result).toEqual(USER_1);
      expect(fetchById).toHaveBeenCalledTimes(1);

      // 确认数据已写入缓存
      const userCache = cacheManager.getCacheIfExists('user');
      expect(userCache?.has('1')).toBe(true);
    });

    it('第二次调用同一 key 时命中缓存，不再访问数据库', async () => {
      await svc.getUserById(1); // 第一次 — 访问 DB
      const result = await svc.getUserById(1); // 第二次 — 命中缓存

      expect(result).toEqual(USER_1);
      expect(fetchById).toHaveBeenCalledTimes(1); // 只调用了一次
    });

    it('不同参数使用不同 key，各自独立缓存', async () => {
      await svc.getUserById(1);
      await svc.getUserById(2);
      await svc.getUserById(1); // 命中缓存
      await svc.getUserById(2); // 命中缓存

      // 两个不同 id 各只访问一次数据库
      expect(fetchById).toHaveBeenCalledTimes(2);
    });

    it('无参数方法缓存整个命名空间（entryKey 退化为空字符串）', async () => {
      await svc.getAllUsers(); // 第一次 — 访问 DB
      const result = await svc.getAllUsers(); // 第二次 — 命中缓存

      expect(result).toEqual([USER_1, USER_2]);
      expect(fetchAll).toHaveBeenCalledTimes(1);
    });

    it('方法返回 null 时不写入缓存', async () => {
      fetchById.mockResolvedValueOnce(null);

      const result1 = await svc.getUserById(99); // 返回 null，不缓存
      const result2 = await svc.getUserById(99); // 再次调用，应再次访问 DB

      expect(result1).toBeNull();
      expect(result2).toBeNull();
      expect(fetchById).toHaveBeenCalledTimes(2);
    });

    it('condition 为 false 时跳过缓存，每次都访问数据库', async () => {
      // id <= 0 时 condition 返回 false，不走缓存
      fetchById.mockResolvedValue({ id: 0, name: 'Guest', email: '' });

      await svc.getUserByIdWithCondition(0);
      await svc.getUserByIdWithCondition(0);

      expect(fetchById).toHaveBeenCalledTimes(2);
    });

    it('condition 为 true 时正常使用缓存', async () => {
      const firstResult = await svc.getUserByIdWithCondition(1);
      const cachedResult = await svc.getUserByIdWithCondition(1);

      expect(firstResult).toEqual(USER_1);
      expect(cachedResult).toEqual(USER_1);
      expect(fetchById).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────
  // @CachePut
  // ──────────────────────────────────────────────

  describe('@CachePut', () => {
    it('每次都执行方法（不跳过），并将结果写入缓存', async () => {
      const updatedUser: User = { ...USER_1, name: '张三（已更新）' };
      saveUser.mockResolvedValue(updatedUser);

      const result = await svc.saveAndCacheUser(USER_1);

      expect(result).toEqual(updatedUser);
      expect(saveUser).toHaveBeenCalledTimes(1);

      // 数据应写入缓存
      const userCache = cacheManager.getCacheIfExists('user');
      expect(userCache?.has(String(USER_1.id))).toBe(true);
    });

    it('多次调用均执行方法，且缓存始终保持最新值', async () => {
      const v1 = { ...USER_1, name: 'v1' };
      const v2 = { ...USER_1, name: 'v2' };
      saveUser.mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);

      await svc.saveAndCacheUser(USER_1);
      await svc.saveAndCacheUser(USER_1);

      // 两次都执行了方法
      expect(saveUser).toHaveBeenCalledTimes(2);

      // 缓存中存储的是最后一次结果
      const userCache = cacheManager.getCacheIfExists('user');
      const cached = await userCache!.get(String(USER_1.id));
      expect(JSON.parse(cached!)).toEqual(v2);
    });

    it('@CachePut 写入的值可被 @Cacheable 直接命中', async () => {
      // 先通过 @CachePut 将用户写入缓存
      const updatedUser: User = { ...USER_1, name: '已更新' };
      saveUser.mockResolvedValue(updatedUser);
      await svc.saveAndCacheUser(USER_1);

      // 随后 @Cacheable 应命中缓存，不访问 DB
      const result = await svc.getUserById(USER_1.id);
      expect(result).toEqual(updatedUser);
      expect(fetchById).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // @CacheEvict
  // ──────────────────────────────────────────────

  describe('@CacheEvict', () => {
    it('删除单条：清除指定 key 的缓存条目', async () => {
      // 先缓存用户
      await svc.getUserById(1);
      expect(cacheManager.getCacheIfExists('user')?.has('1')).toBe(true);

      // 执行删除后清除缓存
      await svc.deleteUser(1);
      expect(cacheManager.getCacheIfExists('user')?.has('1')).toBe(false);
    });

    it('删除后再次查询时重新访问数据库', async () => {
      await svc.getUserById(1); // 缓存
      await svc.deleteUser(1); // 清除缓存
      await svc.getUserById(1); // 缓存失效，重新访问 DB

      expect(fetchById).toHaveBeenCalledTimes(2);
    });

    it('只清除指定 key，不影响其他 key', async () => {
      await svc.getUserById(1);
      await svc.getUserById(2);

      await svc.deleteUser(1); // 只清除 key=1 的缓存

      expect(cacheManager.getCacheIfExists('user')?.has('1')).toBe(false);
      expect(cacheManager.getCacheIfExists('user')?.has('2')).toBe(true);
    });

    it('allEntries: 清空整个命名空间', async () => {
      // 先缓存列表
      await svc.getAllUsers();
      expect(cacheManager.getCacheIfExists('user:list')?.size()).toBeGreaterThan(0);

      // 清空整个命名空间
      await svc.invalidateUserList();
      expect(cacheManager.getCacheIfExists('user:list')?.size()).toBe(0);
    });

    it('allEntries 清空后，下次查询重新访问数据库', async () => {
      await svc.getAllUsers(); // 缓存
      await svc.invalidateUserList(); // 清空命名空间
      await svc.getAllUsers(); // 重新访问 DB

      expect(fetchAll).toHaveBeenCalledTimes(2);
    });

    it('beforeInvocation: 在方法执行前清除缓存', async () => {
      // 先缓存用户 1
      await svc.getUserById(1);
      expect(cacheManager.getCacheIfExists('user')?.has('1')).toBe(true);

      // beforeInvocation=true 的 @CacheEvict 应在方法执行前就清除缓存
      await svc.deleteUserBeforeEvict(1);
      expect(cacheManager.getCacheIfExists('user')?.has('1')).toBe(false);
      expect(removeUser).toHaveBeenCalledOnce();
    });
  });

  // ──────────────────────────────────────────────
  // 无 CacheManager 时的降级行为
  // ──────────────────────────────────────────────

  describe('降级行为（无 CacheManager）', () => {
    beforeEach(() => {
      clearCacheManager(); // 移除 CacheManager
    });

    it('@Cacheable：无 CacheManager 时每次都访问数据库（不缓存）', async () => {
      await svc.getUserById(1);
      await svc.getUserById(1);

      expect(fetchById).toHaveBeenCalledTimes(2);
    });

    it('@CachePut：无 CacheManager 时直接返回方法结果', async () => {
      saveUser.mockResolvedValue(USER_1);

      const result = await svc.saveAndCacheUser(USER_1);

      expect(result).toEqual(USER_1);
      expect(saveUser).toHaveBeenCalledTimes(1);
    });

    it('@CacheEvict：无 CacheManager 时正常执行方法，不报错', async () => {
      await expect(svc.deleteUser(1)).resolves.toBe(true);
      expect(removeUser).toHaveBeenCalledTimes(1);
    });
  });
});
