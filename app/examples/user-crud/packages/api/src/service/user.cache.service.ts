/**
 * 用户缓存服务
 *
 * 在 UserService 基础上为 CRUD 方法添加 Spring Cache 风格的缓存注解：
 * - @Cacheable — 读通缓存（查询）：先查缓存，命中则直接返回，否则访问数据库并回填缓存
 * - @CachePut  — 写通缓存（更新）：每次都执行方法并将结果更新到缓存
 * - @CacheEvict — 缓存失效（删除）：执行方法后清除相关缓存
 *
 * 对应 Java Spring Boot:
 * ```java
 * @Service
 * public class UserCacheService {
 *   @Autowired
 *   private UserMapper userMapper;
 *
 *   @Cacheable(value = "user", key = "#id")
 *   public User getUserById(Long id) { ... }
 *
 *   @Cacheable(value = "user:list")
 *   public List<User> getUserList() { ... }
 *
 *   @CachePut(value = "user", key = "#result.id")
 *   public User createUser(User user) { ... }
 *
 *   @CachePut(value = "user", key = "#id")
 *   public User updateUser(Long id, User user) { ... }
 *
 *   @CacheEvict(value = "user", key = "#id")
 *   public void deleteUser(Long id) { ... }
 * }
 * ```
 */

import 'reflect-metadata';
import { Service } from '@ai-first/core';
import { Cacheable, CachePut, CacheEvict } from '@ai-first/cache';
import { Autowired } from '@ai-first/di/server';
import { User } from '../entity/user.entity.js';
import { UserMapper } from '../mapper/user.mapper.js';

/**
 * 用户缓存服务
 *
 * 缓存命名空间说明：
 * - `user`      — 单条用户缓存，以 id 为条目 key，TTL 300 秒
 * - `user:list` — 用户列表缓存，TTL 60 秒；写操作时整体失效
 */
@Service({ name: 'UserCacheService' })
export class UserCacheService {
  @Autowired()
  private userMapper!: UserMapper;

  /**
   * 按 ID 查询用户（带缓存）
   *
   * 缓存 key: `user::{id}`
   * 对应 Java: @Cacheable(value = "user", key = "#id")
   */
  @Cacheable({ key: 'user', ttl: 300 })
  async getUserById(id: number): Promise<User | null> {
    return this.userMapper.selectById(id);
  }

  /**
   * 查询全部用户（带缓存）
   *
   * 缓存 key: `user:list`（无参数时 entryKey 为空字符串，退化为命名空间本身）
   * 对应 Java: @Cacheable(value = "user:list")
   */
  @Cacheable({ key: 'user:list', ttl: 60 })
  async getAllUsers(): Promise<User[]> {
    return this.userMapper.selectList();
  }

  /**
   * 创建用户（清除列表缓存）
   *
   * 创建后用户列表发生变化，需清空 user:list 命名空间下的所有缓存。
   * 对应 Java: @CacheEvict(value = "user:list", allEntries = true)
   */
  @CacheEvict({ key: 'user:list', allEntries: true })
  async createUser(data: Omit<User, 'id'>): Promise<User> {
    return this.userMapper.insert(data);
  }

  /**
   * 更新用户（更新单条缓存）
   *
   * 执行更新后将最新数据写入 user::{id} 缓存，保持缓存一致性。
   * 对应 Java: @CachePut(value = "user", key = "#id")
   */
  @CachePut({ key: 'user', ttl: 300, keyGenerator: (id: unknown) => String(id as number) })
  async updateUser(id: number, data: Partial<Omit<User, 'id'>>): Promise<User> {
    const user = await this.userMapper.selectById(id);
    if (!user) throw new Error(`User ${id} not found`);
    const updated: User = { ...user, ...data, updatedAt: new Date() };
    return this.userMapper.updateById(updated);
  }

  /**
   * 删除用户（清除单条用户缓存）
   *
   * 删除用户后清除对应的 user::{id} 条目缓存。
   * 注：user:list 列表缓存会在 TTL（60 秒）到期后自然失效；
   * 若需立即失效，可在上层组合调用 invalidateUserList()。
   *
   * 对应 Java: @CacheEvict(value = "user", key = "#id")
   */
  @CacheEvict({ key: 'user' })
  async deleteUser(id: number): Promise<boolean> {
    return this.userMapper.deleteById(id);
  }
}
