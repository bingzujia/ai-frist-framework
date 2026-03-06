import 'reflect-metadata';
import { Service, Transactional } from '@ai-first/core';
import { Autowired } from '@ai-first/di/server';
import { validateDto } from '@ai-first/validation';
import { Cacheable, CachePut, CacheEvict } from '@ai-first/cache';
import { User } from '../entity/user.entity.js';
import { UserMapper } from '../mapper/user.mapper.js';
import { CreateUserDto, UpdateUserDto } from '../dto/user.dto.js';

@Service()
export class UserService {
  @Autowired()
  private userMapper!: UserMapper;

  /**
   * 查询单个用户（带缓存）
   * Java: @Cacheable(value = "user", key = "#id")
   */
  @Cacheable({ key: 'user', ttl: 300 })
  async getUserById(id: number): Promise<User | null> {
    return this.userMapper.selectById(id);
  }

  /**
   * 分页查询用户列表（带缓存）
   * Java: @Cacheable(value = "user:page")
   */
  @Cacheable({ key: 'user:page', ttl: 60 })
  async getUserList(page = 1, pageSize = 10) {
    return this.userMapper.selectPage({ pageNo: page, pageSize });
  }

  /**
   * 查询所有用户（带缓存）
   * Java: @Cacheable(value = "user:list")
   */
  @Cacheable({ key: 'user:list', ttl: 60 })
  async getAllUsers(): Promise<User[]> {
    return this.userMapper.selectList();
  }

  /**
   * 创建用户（清除列表缓存）
   * Java: @CacheEvict(value = "user:list", allEntries = true)
   */
  @Transactional()
  @CacheEvict({ key: 'user:list', allEntries: true })
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
   * 更新用户（更新单条缓存，同时清除列表缓存）
   * Java: @CachePut(value = "user", key = "#id")
   */
  @Transactional()
  @CachePut({ key: 'user', ttl: 300, keyGenerator: (id: unknown) => String(id as number) })
  @CacheEvict({ key: 'user:list', allEntries: true })
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
   * 删除用户（清除单条缓存及列表缓存）
   * Java: @CacheEvict(value = "user", key = "#id")
   */
  @Transactional()
  @CacheEvict({ key: 'user' })
  @CacheEvict({ key: 'user:list', allEntries: true })
  async deleteUser(id: number): Promise<boolean> {
    const user = await this.userMapper.selectById(id);
    if (!user) {
      throw new Error('用户不存在');
    }
    return this.userMapper.deleteById(id);
  }
}
