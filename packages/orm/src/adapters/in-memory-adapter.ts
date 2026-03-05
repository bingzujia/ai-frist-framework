/**
 * InMemoryAdapter - 内存数据库适配器
 *
 * 用于测试和开发环境，数据存储在内存中，无需真实数据库连接。
 * 支持完整的 CRUD 操作和 QueryWrapper 条件查询。
 */

import type {
  IMapperAdapter,
  PageParams,
  PageResult,
  QueryCondition,
  OrderBy,
} from '../base-mapper.js';
import type { QueryWrapper, Condition } from '../wrapper.js';

/**
 * InMemoryAdapter<T> - 基于内存的 Mapper 适配器
 *
 * 主要用于：
 * - 单元测试（无需启动数据库）
 * - 本地开发原型验证
 * - 示例代码演示
 *
 * @example
 * ```typescript
 * const userMapper = new UserMapper();
 * userMapper.setAdapter(new InMemoryAdapter<User>());
 * ```
 */
export class InMemoryAdapter<T extends { id?: number | string }>
  implements IMapperAdapter<T>
{
  private store: Map<number | string, T> = new Map();
  private nextId = 1;

  // ==================== 工具方法 ====================

  private generateId(): number {
    return this.nextId++;
  }

  private matchCondition(entity: T, condition: QueryCondition<T>): boolean {
    for (const [key, value] of Object.entries(condition)) {
      if (value !== undefined && (entity as any)[key] !== value) {
        return false;
      }
    }
    return true;
  }

  private matchWrapperConditions(entity: T, conditions: Condition[]): boolean {
    for (const condition of conditions) {
      if (!this.evaluateCondition(entity, condition)) {
        return false;
      }
    }
    return true;
  }

  private evaluateCondition(entity: T, condition: Condition): boolean {
    const value = (entity as any)[condition.column!];

    switch (condition.type) {
      case 'compare': {
        switch (condition.operator) {
          case '=':
            return value === condition.value;
          case '!=':
            return value !== condition.value;
          case '>':
            return value > (condition.value as any);
          case '>=':
            return value >= (condition.value as any);
          case '<':
            return value < (condition.value as any);
          case '<=':
            return value <= (condition.value as any);
          case 'like': {
            const pattern = String(condition.value);
            const prefix = pattern.startsWith('%');
            const suffix = pattern.endsWith('%');
            const inner = pattern.replace(/^%|%$/g, '');
            if (prefix && suffix) return String(value).includes(inner);
            if (prefix) return String(value).endsWith(inner);
            if (suffix) return String(value).startsWith(inner);
            return String(value) === inner;
          }
          case 'not like': {
            const pattern = String(condition.value);
            const prefix = pattern.startsWith('%');
            const suffix = pattern.endsWith('%');
            const inner = pattern.replace(/^%|%$/g, '');
            if (prefix && suffix) return !String(value).includes(inner);
            if (prefix) return !String(value).endsWith(inner);
            if (suffix) return !String(value).startsWith(inner);
            return String(value) !== inner;
          }
          default:
            return true;
        }
      }

      case 'between': {
        const [lo, hi] = condition.values as [any, any];
        if (condition.operator === 'not between') {
          return value < lo || value > hi;
        }
        return value >= lo && value <= hi;
      }

      case 'in': {
        const vals = condition.values as unknown[];
        return condition.operator === 'not in'
          ? !vals.includes(value)
          : vals.includes(value);
      }

      case 'null': {
        return condition.operator === 'is null'
          ? value === null || value === undefined
          : value !== null && value !== undefined;
      }

      case 'or': {
        return (condition.conditions || []).some(c =>
          this.evaluateCondition(entity, c)
        );
      }

      case 'and': {
        return (condition.conditions || []).every(c =>
          this.evaluateCondition(entity, c)
        );
      }

      default:
        return true;
    }
  }

  private sortEntities(entities: T[], orderBy: OrderBy[]): T[] {
    if (orderBy.length === 0) return entities;
    return [...entities].sort((a, b) => {
      for (const { field, direction } of orderBy) {
        const av = (a as any)[field];
        const bv = (b as any)[field];
        if (av < bv) return direction === 'asc' ? -1 : 1;
        if (av > bv) return direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  // ==================== 查询操作 ====================

  async findById(id: number | string): Promise<T | null> {
    return this.store.get(id) ?? null;
  }

  async findByIds(ids: (number | string)[]): Promise<T[]> {
    return ids.flatMap(id => {
      const entity = this.store.get(id);
      return entity ? [entity] : [];
    });
  }

  async findOne(condition: QueryCondition<T>): Promise<T | null> {
    for (const entity of this.store.values()) {
      if (this.matchCondition(entity, condition)) {
        return entity;
      }
    }
    return null;
  }

  async findList(
    condition: QueryCondition<T>,
    orderBy?: OrderBy[]
  ): Promise<T[]> {
    const matched = Array.from(this.store.values()).filter(e =>
      this.matchCondition(e, condition)
    );
    return orderBy ? this.sortEntities(matched, orderBy) : matched;
  }

  async findPage(
    page: PageParams,
    condition: QueryCondition<T>,
    orderBy?: OrderBy[]
  ): Promise<PageResult<T>> {
    const all = await this.findList(condition, orderBy);
    const total = all.length;
    const offset = (page.pageNo - 1) * page.pageSize;
    const records = all.slice(offset, offset + page.pageSize);

    return {
      records,
      total,
      pageNo: page.pageNo,
      pageSize: page.pageSize,
      totalPages: Math.ceil(total / page.pageSize),
    };
  }

  async count(condition: QueryCondition<T>): Promise<number> {
    const matched = Array.from(this.store.values()).filter(e =>
      this.matchCondition(e, condition)
    );
    return matched.length;
  }

  // ==================== QueryWrapper 查询 ====================

  async selectListByWrapper(wrapper: QueryWrapper<T>): Promise<T[]> {
    let results = Array.from(this.store.values()).filter(e =>
      this.matchWrapperConditions(e, wrapper.getConditions())
    );

    // 排序
    const orderBy = wrapper.getOrderBy();
    if (orderBy.length > 0) {
      results = [...results].sort((a, b) => {
        for (const { column, direction } of orderBy) {
          const av = (a as any)[column];
          const bv = (b as any)[column];
          if (av < bv) return direction === 'asc' ? -1 : 1;
          if (av > bv) return direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    // 分页
    const offset = wrapper.getOffset();
    const limit = wrapper.getLimit();
    if (offset !== undefined) results = results.slice(offset);
    if (limit !== undefined) results = results.slice(0, limit);

    // 字段选择（仅保留指定列）
    const selectCols = wrapper.getSelect();
    if (selectCols.length > 0) {
      results = results.map(e => {
        const partial: Partial<T> = {};
        for (const col of selectCols) {
          (partial as any)[col] = (e as any)[col];
        }
        return partial as T;
      });
    }

    return results;
  }

  async selectOneByWrapper(wrapper: QueryWrapper<T>): Promise<T | null> {
    const results = await this.selectListByWrapper(wrapper.limit(1));
    return results.length > 0 ? results[0] : null;
  }

  async selectCountByWrapper(wrapper: QueryWrapper<T>): Promise<number> {
    const matched = Array.from(this.store.values()).filter(e =>
      this.matchWrapperConditions(e, wrapper.getConditions())
    );
    return matched.length;
  }

  async updateByWrapper(
    data: Partial<T>,
    wrapper: QueryWrapper<T>
  ): Promise<number> {
    const matched = Array.from(this.store.entries()).filter(([, e]) =>
      this.matchWrapperConditions(e, wrapper.getConditions())
    );
    for (const [id, entity] of matched) {
      this.store.set(id, { ...entity, ...data });
    }
    return matched.length;
  }

  async deleteByWrapper(wrapper: QueryWrapper<T>): Promise<number> {
    const matched = Array.from(this.store.entries()).filter(([, e]) =>
      this.matchWrapperConditions(e, wrapper.getConditions())
    );
    for (const [id] of matched) {
      this.store.delete(id);
    }
    return matched.length;
  }

  // ==================== 插入操作 ====================

  async insert(entity: T): Promise<T> {
    const id = entity.id ?? this.generateId();
    const newEntity = { ...entity, id } as T;
    this.store.set(id as number | string, newEntity);
    return newEntity;
  }

  async insertBatch(entities: T[]): Promise<T[]> {
    return Promise.all(entities.map(e => this.insert(e)));
  }

  // ==================== 更新操作 ====================

  async updateById(id: number | string, data: Partial<T>): Promise<T> {
    const existing = this.store.get(id);
    if (!existing) {
      throw new Error(`Entity with id ${id} not found`);
    }
    const updated = { ...existing, ...data, id } as T;
    this.store.set(id, updated);
    return updated;
  }

  async updateByCondition(
    data: Partial<T>,
    condition: QueryCondition<T>
  ): Promise<number> {
    let count = 0;
    for (const [id, entity] of this.store.entries()) {
      if (this.matchCondition(entity, condition)) {
        this.store.set(id, { ...entity, ...data });
        count++;
      }
    }
    return count;
  }

  // ==================== 删除操作 ====================

  async deleteById(id: number | string): Promise<boolean> {
    return this.store.delete(id);
  }

  async deleteByIds(ids: (number | string)[]): Promise<number> {
    let count = 0;
    for (const id of ids) {
      if (this.store.delete(id)) count++;
    }
    return count;
  }

  async deleteByCondition(condition: QueryCondition<T>): Promise<number> {
    const toDelete: (number | string)[] = [];
    for (const [id, entity] of this.store.entries()) {
      if (this.matchCondition(entity, condition)) {
        toDelete.push(id);
      }
    }
    for (const id of toDelete) {
      this.store.delete(id);
    }
    return toDelete.length;
  }

  // ==================== 测试辅助方法 ====================

  /**
   * 清空所有数据（测试用）
   */
  clear(): void {
    this.store.clear();
    this.nextId = 1;
  }

  /**
   * 获取所有数据（测试用）
   */
  getAll(): T[] {
    return Array.from(this.store.values());
  }

  /**
   * 获取当前数据条数（测试用）
   */
  size(): number {
    return this.store.size;
  }
}
