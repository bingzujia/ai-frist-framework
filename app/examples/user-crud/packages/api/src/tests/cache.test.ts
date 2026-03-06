/**
 * UserService 缓存集成测试
 *
 * 验证 UserService 中集成的 @ai-first/cache 注解行为：
 * - @Cacheable  — getUserById / getAllUsers：读通缓存（cache-aside）
 * - @CachePut   — updateUser：写通缓存
 * - @CacheEvict — createUser（allEntries）/ deleteUser（单条）：缓存失效
 *
 * 测试策略：
 * - 使用内存缓存后端（MapCacheManager），无需 Redis 服务
 * - 通过 vi.fn() 构造 UserMapper 代理，记录数据库层调用次数
 * - 直接对 UserService 实例注入 mock mapper，绕过 DI 容器
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setCacheManager, clearCacheManager } from '@ai-first/cache';
import { UserService } from '../service/user.service.js';
import { MapCacheManager } from './in-memory-cache.js';
import type { User } from '../entity/user.entity.js';

// ==================== 测试夹具 ====================

/** 构造一个所有方法均为 vi.fn() 的 UserMapper mock */
function createMockMapper() {
  return {
    selectById: vi.fn<[number], Promise<User | null>>(),
    selectList: vi.fn<[], Promise<User[]>>(),
    selectByUsername: vi.fn<[string], Promise<User | null>>(),
    selectByEmail: vi.fn<[string], Promise<User | null>>(),
    selectPage: vi.fn(),
    insert: vi.fn<[Omit<User, 'id'>], Promise<User>>(),
    updateById: vi.fn<[User], Promise<User>>(),
    deleteById: vi.fn<[number], Promise<boolean>>(),
  };
}

type MockMapper = ReturnType<typeof createMockMapper>;

/** 构建一个不依赖 DI 容器的 UserService 实例，注入 mock mapper */
function createService(mapper: MockMapper): UserService {
  const svc = new UserService();
  // injectAutowiredProperties 会尝试从 tsyringe container 解析，
  // 在测试环境下解析失败会打印警告（不会抛出），属性保持 undefined。
  // 此处直接赋值替换，即为完整的 mock 注入。
  (svc as unknown as { userMapper: MockMapper }).userMapper = mapper;
  return svc;
}

// ==================== 常量 ====================

const USER_1: User = {
  id: 1,
  username: 'zhangsan',
  email: 'zhangsan@example.com',
  age: 25,
};

const USER_2: User = {
  id: 2,
  username: 'lisi',
  email: 'lisi@example.com',
  age: 30,
};

/**
 * 返回用户对象的浅拷贝。
 *
 * UserService.updateUser 会就地写入 `updatedAt = new Date()`，若多个测试
 * 共享同一对象引用，这一副作用会污染后续测试的断言。通过始终传入副本
 * 来隔离每个测试的状态。
 */
function copy(user: User): User {
  return { ...user };
}

// ==================== 测试套件 ====================

describe('UserService — 缓存注解集成测试', () => {
  let cacheManager: MapCacheManager;
  let mapper: MockMapper;
  let svc: UserService;

  beforeEach(() => {
    cacheManager = new MapCacheManager();
    setCacheManager(cacheManager);

    mapper = createMockMapper();
    svc = createService(mapper);
  });

  afterEach(() => {
    clearCacheManager();
    vi.restoreAllMocks();
  });

  // ──────────────────────────────────────────────
  // @Cacheable — getUserById
  // ──────────────────────────────────────────────

  describe('getUserById — @Cacheable({ key: "user", ttl: 300 })', () => {
    it('首次查询时访问数据库，并将结果写入缓存', async () => {
      mapper.selectById.mockResolvedValue(USER_1);

      const result = await svc.getUserById(1);

      expect(result).toEqual(USER_1);
      expect(mapper.selectById).toHaveBeenCalledTimes(1);
      // 确认已写入缓存
      expect(cacheManager.getCacheIfExists('user')?.has('1')).toBe(true);
    });

    it('第二次查询命中缓存，不再访问数据库', async () => {
      mapper.selectById.mockResolvedValue(USER_1);

      await svc.getUserById(1); // 第一次 — 访问 DB
      const result = await svc.getUserById(1); // 第二次 — 命中缓存

      expect(result).toEqual(USER_1);
      expect(mapper.selectById).toHaveBeenCalledTimes(1);
    });

    it('不同 id 各自独立缓存', async () => {
      mapper.selectById.mockImplementation(async (id) => (id === 1 ? USER_1 : USER_2));

      await svc.getUserById(1);
      await svc.getUserById(2);
      await svc.getUserById(1); // 命中缓存
      await svc.getUserById(2); // 命中缓存

      expect(mapper.selectById).toHaveBeenCalledTimes(2);
    });

    it('查询结果为 null 时不写入缓存，再次查询重新访问数据库', async () => {
      mapper.selectById.mockResolvedValue(null);

      const r1 = await svc.getUserById(99);
      const r2 = await svc.getUserById(99);

      expect(r1).toBeNull();
      expect(r2).toBeNull();
      expect(mapper.selectById).toHaveBeenCalledTimes(2);
    });
  });

  // ──────────────────────────────────────────────
  // @Cacheable — getAllUsers
  // ──────────────────────────────────────────────

  describe('getAllUsers — @Cacheable({ key: "user:list", ttl: 60 })', () => {
    it('首次查询访问数据库，第二次命中缓存', async () => {
      mapper.selectList.mockResolvedValue([USER_1, USER_2]);

      await svc.getAllUsers(); // DB
      const result = await svc.getAllUsers(); // 缓存

      expect(result).toEqual([USER_1, USER_2]);
      expect(mapper.selectList).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────
  // @CacheEvict(allEntries) — createUser
  // ──────────────────────────────────────────────

  describe('createUser — @CacheEvict({ key: "user:list", allEntries: true })', () => {
    it('创建用户后清空 user:list 缓存', async () => {
      // 先缓存用户列表
      mapper.selectList.mockResolvedValue([USER_1]);
      await svc.getAllUsers();
      expect(cacheManager.getCacheIfExists('user:list')?.size()).toBeGreaterThan(0);

      // createUser：先通过 username 唯一性检查，然后插入
      mapper.selectByUsername.mockResolvedValue(null);
      mapper.insert.mockResolvedValue(USER_2);

      await svc.createUser({ username: 'lisi', email: 'lisi@example.com' });

      // user:list 缓存应被清空
      expect(cacheManager.getCacheIfExists('user:list')?.size()).toBe(0);
    });

    it('清空后再次查询列表时重新访问数据库', async () => {
      mapper.selectList.mockResolvedValue([USER_1]);
      await svc.getAllUsers(); // 缓存

      mapper.selectByUsername.mockResolvedValue(null);
      mapper.insert.mockResolvedValue(USER_2);
      await svc.createUser({ username: 'lisi', email: 'lisi@example.com' }); // 清空缓存

      mapper.selectList.mockResolvedValue([USER_1, USER_2]);
      await svc.getAllUsers(); // 重新访问 DB

      expect(mapper.selectList).toHaveBeenCalledTimes(2);
    });

    it('用户名已存在时抛出错误，不创建用户', async () => {
      mapper.selectByUsername.mockResolvedValue(USER_1);

      await expect(svc.createUser({ username: 'zhangsan', email: 'any@example.com' }))
        .rejects.toThrow('用户名已存在');
    });

    it('DTO 校验失败时抛出 Validation 错误', async () => {
      // 空用户名不符合 @IsNotEmpty + @Length(2, 50)
      await expect(svc.createUser({ username: '', email: 'valid@example.com' }))
        .rejects.toThrow();
    });
  });

  // ──────────────────────────────────────────────
  // @CachePut — updateUser
  // ──────────────────────────────────────────────

  describe('updateUser — @CachePut({ key: "user", ttl: 300 })', () => {
    it('更新用户后将最新数据写入缓存', async () => {
      const updated: User = { ...USER_1, username: 'zhangsan_v2' };
      mapper.selectById.mockResolvedValue(copy(USER_1));
      mapper.updateById.mockResolvedValue(updated);

      const result = await svc.updateUser(1, { username: 'zhangsan_v2' });

      expect(result).toEqual(updated);
      // 验证已写入缓存
      expect(cacheManager.getCacheIfExists('user')?.has('1')).toBe(true);
    });

    it('@CachePut 写入的值可被 @Cacheable 直接命中，不再访问数据库', async () => {
      const updated: User = { ...USER_1, username: 'zhangsan_v2' };
      mapper.selectById.mockResolvedValue(copy(USER_1)); // 返回副本，避免服务内部 updatedAt 赋值污染 USER_1
      mapper.updateById.mockResolvedValue(updated);

      await svc.updateUser(1, { username: 'zhangsan_v2' }); // 写入缓存

      // @Cacheable 应命中 @CachePut 写入的缓存，不再调用 selectById
      mapper.selectById.mockClear(); // 清除之前 updateUser 内部调用的计数
      const cached = await svc.getUserById(1);

      expect(cached).toEqual(updated);
      expect(mapper.selectById).not.toHaveBeenCalled();
    });

    it('多次更新后缓存保持最新值', async () => {
      const v1: User = { ...USER_1, username: 'v1' };
      const v2: User = { ...USER_1, username: 'v2' };

      mapper.selectById.mockImplementation(async () => copy(USER_1)); // 每次返回副本
      mapper.updateById.mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);

      await svc.updateUser(1, { username: 'v1' });
      await svc.updateUser(1, { username: 'v2' });

      // 两次都执行了数据库更新
      expect(mapper.updateById).toHaveBeenCalledTimes(2);

      // 缓存中是最后一次更新的结果
      const userCache = cacheManager.getCacheIfExists('user');
      const raw = await userCache!.get('1');
      expect(JSON.parse(raw!).username).toBe('v2');
    });

    it('用户不存在时抛出错误', async () => {
      mapper.selectById.mockResolvedValue(null);

      await expect(svc.updateUser(999, { username: 'nobody' }))
        .rejects.toThrow('用户不存在');
    });
  });

  // ──────────────────────────────────────────────
  // @CacheEvict — deleteUser
  // ──────────────────────────────────────────────

  describe('deleteUser — @CacheEvict({ key: "user" })', () => {
    it('删除用户后清除对应的缓存条目', async () => {
      // 先缓存用户
      mapper.selectById.mockResolvedValue(USER_1);
      await svc.getUserById(1);
      expect(cacheManager.getCacheIfExists('user')?.has('1')).toBe(true);

      // 删除时 selectById 会再次被调用（存在性检查），deleteById 执行删除
      mapper.deleteById.mockResolvedValue(true);
      await svc.deleteUser(1);

      expect(cacheManager.getCacheIfExists('user')?.has('1')).toBe(false);
    });

    it('删除后再次查询时重新访问数据库', async () => {
      mapper.selectById.mockResolvedValue(USER_1);
      await svc.getUserById(1); // 缓存

      mapper.deleteById.mockResolvedValue(true);
      await svc.deleteUser(1); // 清除缓存

      mapper.selectById.mockClear(); // 重置计数
      mapper.selectById.mockResolvedValue(USER_1);
      await svc.getUserById(1); // 缓存已失效，重新访问 DB

      expect(mapper.selectById).toHaveBeenCalledTimes(1);
    });

    it('只清除被删除的 key，不影响其他 key', async () => {
      mapper.selectById.mockImplementation(async (id) => (id === 1 ? USER_1 : USER_2));
      await svc.getUserById(1);
      await svc.getUserById(2);

      mapper.deleteById.mockResolvedValue(true);
      await svc.deleteUser(1); // 只清除 user::1

      expect(cacheManager.getCacheIfExists('user')?.has('1')).toBe(false);
      expect(cacheManager.getCacheIfExists('user')?.has('2')).toBe(true);
    });

    it('用户不存在时抛出错误，不修改缓存', async () => {
      mapper.selectById.mockResolvedValue(null);

      await expect(svc.deleteUser(999)).rejects.toThrow('用户不存在');
    });
  });

  // ──────────────────────────────────────────────
  // 降级行为（无 CacheManager）
  // ──────────────────────────────────────────────

  describe('降级行为（无 CacheManager）', () => {
    beforeEach(() => {
      clearCacheManager();
    });

    it('@Cacheable：无缓存时每次都访问数据库', async () => {
      mapper.selectById.mockResolvedValue(USER_1);

      await svc.getUserById(1);
      await svc.getUserById(1);

      expect(mapper.selectById).toHaveBeenCalledTimes(2);
    });

    it('@CachePut：无缓存时正常执行方法并返回结果', async () => {
      const updated: User = { ...USER_1, username: 'new' };
      mapper.selectById.mockResolvedValue(copy(USER_1));
      mapper.updateById.mockResolvedValue(updated);

      const result = await svc.updateUser(1, { username: 'new' });

      expect(result).toEqual(updated);
    });

    it('@CacheEvict：无缓存时正常执行方法，不报错', async () => {
      mapper.selectById.mockResolvedValue(USER_1);
      mapper.deleteById.mockResolvedValue(true);

      await expect(svc.deleteUser(1)).resolves.toBe(true);
    });
  });
});

