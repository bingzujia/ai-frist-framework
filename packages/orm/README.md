# @ai-first/orm

**AI-First Framework - ORM 模块**

提供与 MyBatis-Plus 风格兼容的 TypeScript ORM 装饰器系统，底层基于 [Kysely](https://kysely.dev/) 查询构建器，支持 PostgreSQL、SQLite、MySQL 多种数据库。

---

## 目录

- [功能概述](#功能概述)
- [开发思路](#开发思路)
- [技术实现](#技术实现)
- [安装](#安装)
- [快速开始](#快速开始)
- [API 参考](#api-参考)
- [数据库适配器](#数据库适配器)
- [QueryWrapper 条件构造器](#querywrapper-条件构造器)
- [依赖注入集成](#依赖注入集成)

---

## 功能概述

`@ai-first/orm` 提供以下核心功能：

| 功能 | 描述 |
|------|------|
| **实体装饰器** | `@Entity`/`@TableName`、`@TableId`、`@TableField`/`@Column` |
| **Mapper 装饰器** | `@Mapper` 自动注册到 DI 容器并注入适配器 |
| **BaseMapper** | 开箱即用的 CRUD 操作（selectById、insert、updateById 等） |
| **QueryWrapper** | MyBatis-Plus 风格的链式条件构造器 |
| **多数据库支持** | PostgreSQL、SQLite、MySQL（通过 Kysely） |
| **InMemoryAdapter** | 内存适配器，用于测试和开发原型 |

---

## 开发思路

### 1. MyBatis-Plus API 兼容性

框架的核心目标是让 TypeScript 代码尽可能与 Java MyBatis-Plus 的 API 风格一致，以便：

- AI 能够基于对 Java MyBatis-Plus 的理解来生成/优化 TypeScript 代码
- TypeScript 代码可以被代码生成工具转换为等价的 Java MyBatis-Plus 代码

```typescript
// TypeScript（本框架）
@Entity({ table: 'sys_user' })
class User {
  @TableId({ type: 'AUTO' })
  id!: number;

  @TableField({ column: 'user_name' })
  name!: string;
}

// 等价的 Java MyBatis-Plus
@Data
@TableName("sys_user")
public class User {
  @TableId(type = IdType.AUTO)
  private Long id;

  @TableField("user_name")
  private String name;
}
```

### 2. 适配器模式（Adapter Pattern）

数据库操作通过 `IMapperAdapter<T>` 接口抽象，`BaseMapper<T>` 只依赖接口，不直接耦合具体数据库：

```
BaseMapper<T>
    │ uses
    ▼
IMapperAdapter<T>  ◄──── KyselyAdapter<T>   (生产环境：PostgreSQL/SQLite/MySQL)
                   ◄──── InMemoryAdapter<T>  (测试/开发环境)
                   ◄──── 自定义适配器
```

这样：
- 单元测试使用 `InMemoryAdapter`，不依赖真实数据库
- 生产环境使用 `KyselyAdapter`，连接实际数据库
- 可扩展自定义适配器支持其他 ORM（如 Prisma、TypeORM）

### 3. 元数据驱动（Metadata-Driven）

利用 `reflect-metadata` 在装饰器执行时将表名、字段映射等信息存储到类的 metadata 中。`@Mapper` 自动从 `@Entity`/`@TableField` 读取这些 metadata 来创建适配器，无需手动配置：

```typescript
// 只需定义实体和 Mapper，适配器配置自动完成
@Entity({ table: 'users' })
class User { ... }

@Mapper(User)
class UserMapper extends BaseMapper<User> {}
```

### 4. 全局数据库单例

`createKyselyDatabase()` 创建全局 Kysely 实例，`@Mapper` 装饰器在实例化时自动获取该实例创建适配器，业务代码无需手动传递数据库连接。

---

## 技术实现

### 核心文件结构

```
src/
├── index.ts              # 统一导出入口
├── decorators.ts         # @Entity/@TableName/@TableId/@TableField/@Mapper 装饰器
├── base-mapper.ts        # BaseMapper<T> 抽象类 + IMapperAdapter<T> 接口
├── wrapper.ts            # QueryWrapper<T> / LambdaQueryWrapper<T> 条件构造器
├── database.ts           # 多数据库工厂（createKyselyDatabase）
├── config.ts             # 全局配置（createAdapterFromEntity）
└── adapters/
    ├── index.ts          # 适配器导出
    ├── kysely-adapter.ts # 基于 Kysely 的生产数据库适配器
    └── in-memory-adapter.ts  # 内存适配器（测试用）
```

### 装饰器实现（`decorators.ts`）

- **`@Entity(options)`** / **`@TableName`**：类装饰器，将 `{ tableName, className, ... }` 写入 `ENTITY_METADATA`
- **`@TableId(options)`**：属性装饰器，将主键信息写入 `TABLE_ID_METADATA`
- **`@TableField(options)`** / **`@Column`**：属性装饰器，将字段映射写入 `TABLE_FIELD_METADATA`
- **`@Mapper(entity)`**：类装饰器，执行以下操作：
  1. 写入 `MAPPER_METADATA`
  2. 调用 `@ai-first/di` 的 `Injectable()` 和 `Singleton()` 注册到 DI 容器
  3. 包装构造函数：实例化时若数据库已初始化，自动从 `@Entity` metadata 创建 `KyselyAdapter` 并调用 `setAdapter()`

### BaseMapper 实现（`base-mapper.ts`）

抽象类，提供以下 CRUD 方法（均委托给 `IMapperAdapter`）：

| 方法 | 对应 MyBatis-Plus |
|------|------------------|
| `selectById(id)` | `selectById` |
| `selectBatchIds(ids)` | `selectBatchIds` |
| `selectOne(condition)` | `selectOne` |
| `selectList(condition, orderBy?)` | `selectList` |
| `selectPage(page, condition?, orderBy?)` | `selectPage` |
| `selectCount(condition?)` | `selectCount` |
| `insert(entity)` | `insert` |
| `insertBatch(entities)` | `insertBatch` |
| `updateById(entity)` | `updateById` |
| `update(data, condition)` | `update` |
| `deleteById(id)` | `deleteById` |
| `deleteBatchIds(ids)` | `deleteBatchIds` |
| `delete(condition)` | `delete` |
| `selectListByWrapper(wrapper)` | `selectList(wrapper)` |
| `selectOneByWrapper(wrapper)` | `selectOne(wrapper)` |
| `selectCountByWrapper(wrapper)` | `selectCount(wrapper)` |
| `updateByWrapper(data, wrapper)` | `update(entity, wrapper)` |
| `deleteByWrapper(wrapper)` | `delete(wrapper)` |

### QueryWrapper 实现（`wrapper.ts`）

链式 API，内部维护 `Condition[]` 数组，由适配器在执行时翻译为 SQL。

条件类型：
- `compare`：`=`、`!=`、`>`、`>=`、`<`、`<=`、`like`、`not like`
- `between`：BETWEEN / NOT BETWEEN
- `in`：IN / NOT IN
- `null`：IS NULL / IS NOT NULL
- `or` / `and`：嵌套条件组合

### KyselyAdapter 实现（`adapters/kysely-adapter.ts`）

将 `IMapperAdapter` 接口方法转换为 Kysely 查询：
- 字段映射（TS 属性名 → 数据库列名）通过 `fieldMapping` 双向转换
- `applyConditions()` 递归将 `Condition[]` 翻译为 Kysely `where` 子句
- 支持 `returningAll()` 获取插入/更新后的完整记录（PostgreSQL/SQLite）

### 数据库工厂（`database.ts`）

`createKyselyDatabase(config)` 根据 `config.type` 动态 `import` 对应数据库驱动：
- `postgres`：`pg` + `PostgresDialect`
- `sqlite`：`better-sqlite3` + `SqliteDialect`
- `mysql`：`mysql2/promise` + `MysqlDialect`

驱动均作为 peer dependency，按需安装，不强制引入所有驱动。

---

## 安装

```bash
# 安装核心包
pnpm add @ai-first/orm

# 按需安装数据库驱动
pnpm add pg          # PostgreSQL
pnpm add better-sqlite3  # SQLite
pnpm add mysql2      # MySQL
```

---

## 快速开始

### 第一步：连接数据库

```typescript
import { createKyselyDatabase } from '@ai-first/orm';

// SQLite（开发/测试推荐）
await createKyselyDatabase({
  type: 'sqlite',
  filename: ':memory:', // 内存数据库
});

// PostgreSQL（生产环境）
await createKyselyDatabase({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'mydb',
});
```

### 第二步：定义实体

```typescript
import { Entity, TableId, TableField } from '@ai-first/orm';

@Entity({ table: 'sys_user', description: '系统用户表' })
export class User {
  @TableId({ type: 'AUTO' })
  id!: number;

  @TableField({ column: 'user_name' })
  name!: string;

  @TableField()
  email!: string;

  @TableField()
  status!: 'ACTIVE' | 'INACTIVE';

  @TableField({ exist: false }) // 非数据库字段
  fullName?: string;
}
```

### 第三步：定义 Mapper

```typescript
import { Mapper, BaseMapper } from '@ai-first/orm';

@Mapper(User)
export class UserMapper extends BaseMapper<User> {}
```

### 第四步：使用 Mapper

```typescript
const userMapper = new UserMapper();

// 插入
const user = await userMapper.insert({ name: '张三', email: 'zs@example.com', status: 'ACTIVE' });

// 根据 ID 查询
const found = await userMapper.selectById(1);

// 条件查询
const activeUsers = await userMapper.selectList({ status: 'ACTIVE' });

// 分页查询
const page = await userMapper.selectPage(
  { pageNo: 1, pageSize: 10 },
  { status: 'ACTIVE' },
  [{ field: 'name', direction: 'asc' }]
);

// 更新
user.email = 'new@example.com';
const updated = await userMapper.updateById(user);

// 删除
await userMapper.deleteById(1);
```

### 使用 QueryWrapper

```typescript
import { QueryWrapper } from '@ai-first/orm';

// 查询活跃且年龄大于 18 的用户，按创建时间降序排列
const users = await userMapper.selectListByWrapper(
  new QueryWrapper<User>()
    .eq('status', 'ACTIVE')
    .gt('age', 18)
    .orderByDesc('createdAt')
    .limit(20)
);

// OR 条件
const result = await userMapper.selectListByWrapper(
  new QueryWrapper<User>()
    .or(w => w.eq('name', '张三').eq('name', '李四'))
);

// LIKE 模糊查询
const matched = await userMapper.selectListByWrapper(
  new QueryWrapper<User>().like('name', '张')
);

// 条件更新
const count = await userMapper.updateByWrapper(
  { status: 'INACTIVE' },
  new QueryWrapper<User>().lt('lastLoginAt', thirtyDaysAgo)
);
```

---

## API 参考

### 装饰器

#### `@Entity(options?)` / `@TableName(options?)`

标记实体类，设置数据库表信息。

| 选项 | 类型 | 说明 |
|------|------|------|
| `table` | `string` | 表名（默认：类名小写 + 's'） |
| `tableName` | `string` | 表名别名 |
| `description` | `string` | 表描述 |
| `schema` | `string` | Schema 名称 |

#### `@TableId(options?)`

标记主键字段。

| 选项 | 类型 | 说明 |
|------|------|------|
| `type` | `'AUTO' \| 'INPUT' \| 'ASSIGN_ID' \| 'ASSIGN_UUID'` | 主键生成策略（默认：`'AUTO'`） |
| `column` | `string` | 数据库列名 |

#### `@TableField(options?)` / `@Column(options?)`

标记普通字段。

| 选项 | 类型 | 说明 |
|------|------|------|
| `column` | `string` | 数据库列名（默认：属性名） |
| `exist` | `boolean` | 是否为数据库字段（默认：`true`） |
| `fill` | `'INSERT' \| 'UPDATE' \| 'INSERT_UPDATE'` | 自动填充策略 |
| `select` | `boolean` | 是否参与查询 |
| `jdbcType` | `string` | JDBC 类型提示 |

#### `@Mapper(entity?)`

标记 Mapper 类，自动：
1. 注册到 DI 容器（`@Injectable` + `@Singleton`）
2. 实例化时从 `@Entity` metadata 创建并注入 `KyselyAdapter`

---

## 数据库适配器

### KyselyAdapter（生产环境）

```typescript
import { KyselyAdapter, getKyselyDatabase } from '@ai-first/orm';

const adapter = new KyselyAdapter<User>({
  tableName: 'users',
  db: getKyselyDatabase(),
  fieldMapping: {
    name: 'user_name',    // TS 属性名 -> 数据库列名
    createdAt: 'created_at',
  },
});
userMapper.setAdapter(adapter);
```

### InMemoryAdapter（测试/开发）

无需数据库连接，数据存储在内存中。

```typescript
import { InMemoryAdapter } from '@ai-first/orm';

const userMapper = new UserMapper();
userMapper.setAdapter(new InMemoryAdapter<User>());

// 测试辅助方法
const adapter = new InMemoryAdapter<User>();
adapter.clear();       // 清空所有数据
adapter.getAll();      // 获取所有数据
adapter.size();        // 获取数据条数
```

---

## QueryWrapper 条件构造器

### 比较条件

```typescript
wrapper.eq('field', value)       // =
wrapper.ne('field', value)       // !=
wrapper.gt('field', value)       // >
wrapper.ge('field', value)       // >=
wrapper.lt('field', value)       // <
wrapper.le('field', value)       // <=
```

### 模糊查询

```typescript
wrapper.like('field', 'value')      // LIKE '%value%'
wrapper.notLike('field', 'value')   // NOT LIKE '%value%'
wrapper.likeLeft('field', 'value')  // LIKE '%value'
wrapper.likeRight('field', 'value') // LIKE 'value%'
```

### 范围查询

```typescript
wrapper.between('field', 10, 20)          // BETWEEN 10 AND 20
wrapper.notBetween('field', 10, 20)       // NOT BETWEEN
wrapper.in('field', [1, 2, 3])            // IN (1, 2, 3)
wrapper.notIn('field', [0, -1])           // NOT IN (0, -1)
```

### NULL 判断

```typescript
wrapper.isNull('field')      // IS NULL
wrapper.isNotNull('field')   // IS NOT NULL
```

### 逻辑组合

```typescript
// OR 嵌套
wrapper.or(w => w.eq('name', '张三').eq('name', '李四'))

// AND 嵌套
wrapper.and(w => w.gt('age', 18).lt('age', 30))
```

### 排序与分页

```typescript
wrapper.orderByAsc('field')       // ORDER BY field ASC
wrapper.orderByDesc('field')      // ORDER BY field DESC
wrapper.limit(10)                 // LIMIT 10
wrapper.offset(20)                // OFFSET 20
wrapper.page(2, 10)               // 第2页，每页10条
```

### 字段选择

```typescript
wrapper.select('id', 'name', 'email')  // SELECT id, name, email
wrapper.groupBy('status', 'type')      // GROUP BY status, type
```

---

## 依赖注入集成

`@Mapper` 自动集成 `@ai-first/di` 依赖注入容器：

```typescript
import { createServer } from '@ai-first/web';
import { createKyselyDatabase } from '@ai-first/orm';
import { container } from '@ai-first/di';

// 初始化数据库
await createKyselyDatabase({ type: 'sqlite', filename: './data.db' });

// 从 DI 容器获取 Mapper 实例（自动注入适配器）
const userMapper = container.resolve(UserMapper);

// 或通过构造函数注入
@Service()
class UserService {
  constructor(private userMapper: UserMapper) {}
}
```

---

## 依赖

| 依赖 | 版本 | 说明 |
|------|------|------|
| `kysely` | `^0.28` | SQL 查询构建器（核心） |
| `better-sqlite3` | `^12` | SQLite 驱动 |
| `reflect-metadata` | `^0.2` | 装饰器元数据支持 |
| `pg` *(peer)* | `>=8` | PostgreSQL 驱动（可选） |
| `mysql2` *(peer)* | `>=3` | MySQL 驱动（可选） |
| `@ai-first/core` | `workspace:*` | 核心装饰器 |
| `@ai-first/di` | `workspace:*` | 依赖注入容器 |

---

## License

MIT
