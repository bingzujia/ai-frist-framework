import 'reflect-metadata';
import { Service, Transactional } from '@ai-first/core';
import { Autowired } from '@ai-first/di/server';
import { validateDto } from '@ai-first/validation';
import { Cacheable, CachePut, CacheEvict } from '@ai-first/cache';
import { User } from '../entity/user.entity.js';
import { UserMapper } from '../mapper/user.mapper.js';
import { CreateUserDto, UpdateUserDto } from '../dto/user.dto.js';

/**
 * 用户服务
 *
 * 在 CRUD 操作基础上整合 Spring Cache 风格缓存注解：
 *
 * 缓存命名空间说明：
 * - `user`      — 单条用户缓存，以 id 为条目 key，TTL 300 秒
 * - `user:list` — 用户列表缓存，TTL 60 秒；写操作时整体失效
 *
 * 对应 Java Spring Boot:
 * ```java
 * @Service
 * public class UserService {
 *   @Cacheable(value = "user", key = "#id")
 *   public User getUserById(Long id) { ... }
 *
 *   @Cacheable(value = "user:list")
 *   public List<User> getAllUsers() { ... }
 *
 *   @CachePut(value = "user", key = "#id")
 *   public User updateUser(Long id, UpdateUserDto dto) { ... }
 *
 *   @CacheEvict(value = "user:list", allEntries = true)
 *   public User createUser(CreateUserDto dto) { ... }
 *
 *   @CacheEvict(value = "user", key = "#id")
 *   public void deleteUser(Long id) { ... }
 * }
 * ```
 */
@Service()
export class UserService {
  @Autowired()
  private userMapper!: UserMapper;

  /**
   * 按 ID 查询单个用户（带缓存）
   *
   * 缓存 key: `user::{id}`，TTL 300 秒
   * 对应 Java: @Cacheable(value = "user", key = "#id")
   */
  @Cacheable({ key: 'user', ttl: 300 })
  async getUserById(id: number): Promise<User | null> {
    return this.userMapper.selectById(id);
  }

  async getUserList(page = 1, pageSize = 10) {
    return this.userMapper.selectPage({ pageNo: page, pageSize });
  }

  /**
   * 查询全部用户（带缓存）
   *
   * 缓存 key: `user:list`（无参数时 entryKey 为空字符串，退化为命名空间本身），TTL 60 秒
   * 对应 Java: @Cacheable(value = "user:list")
   */
  @Cacheable({ key: 'user:list', ttl: 60 })
  async getAllUsers(): Promise<User[]> {
    return this.userMapper.selectList();
  }

  /**
   * 创建用户（清除列表缓存）
   *
   * 创建后用户列表发生变化，清空 user:list 命名空间下的所有缓存。
   * 对应 Java: @CacheEvict(value = "user:list", allEntries = true)
   */
  @CacheEvict({ key: 'user:list', allEntries: true })
  @Transactional()
  async createUser(dto: CreateUserDto): Promise<User> {
    const result = await validateDto(CreateUserDto, dto);
    if (!result.success) {
      throw new Error(result.errors?.map(e => e.message).join(', ') || 'Validation failed');
    }

    const existing = await this.userMapper.selectByUsername(dto.username);
    if (existing) {
      throw new Error('用户名已存在');
    }

    const user: Omit<User, 'id'> = {
      username: dto.username,
      email: dto.email,
      age: dto.age,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return this.userMapper.insert(user);
  }

  /**
   * 更新用户（写通缓存）
   *
   * 执行更新后将最新数据写入 user::{id} 缓存，保持缓存一致性。
   * 对应 Java: @CachePut(value = "user", key = "#id")
   */
  @CachePut({ key: 'user', ttl: 300, keyGenerator: (id: unknown) => String(id as number) })
  @Transactional()
  async updateUser(id: number, dto: UpdateUserDto): Promise<User> {
    const result = await validateDto(UpdateUserDto, dto);
    if (!result.success) {
      throw new Error(result.errors?.map(e => e.message).join(', ') || 'Validation failed');
    }

    const user = await this.userMapper.selectById(id);
    if (!user) {
      throw new Error('用户不存在');
    }

    if (dto.username !== undefined) user.username = dto.username;
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.age !== undefined) user.age = dto.age;
    user.updatedAt = new Date();

    return this.userMapper.updateById(user);
  }

  /**
   * 删除用户（清除单条缓存）
   *
   * 删除后清除对应的 user::{id} 条目缓存。
   * 对应 Java: @CacheEvict(value = "user", key = "#id")
   */
  @CacheEvict({ key: 'user' })
  @Transactional()
  async deleteUser(id: number): Promise<boolean> {
    const user = await this.userMapper.selectById(id);
    if (!user) {
      throw new Error('用户不存在');
    }
    return this.userMapper.deleteById(id);
  }
}

