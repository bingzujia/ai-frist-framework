# @ai-partner-x/aiko-boot-codegen 使用手册

`@ai-partner-x/aiko-boot-codegen` 是一款专为 Aiko Boot 框架设计的 TypeScript → Java 代码生成工具，同时也能将 TypeScript 控制器/实体自动生成前端可用的 API Client。

---

## 目录

- [功能特性](#功能特性)
- [安装](#安装)
- [快速开始](#快速开始)
  - [TypeScript to Java（CLI）](#typescript-to-javacli)
  - [前端 API Client 生成（编程 API）](#前端-api-client-生成编程-api)
  - [tsup / esbuild 插件](#tsup--esbuild-插件)
- [CLI 命令参考](#cli-命令参考)
- [编程 API 参考](#编程-api-参考)
- [支持的装饰器与组件](#支持的装饰器与组件)
- [类型映射](#类型映射)
- [内置插件](#内置插件)
- [增量生成与缓存](#增量生成与缓存)
- [错误处理](#错误处理)
- [测试](#测试)
- [更多资源](#更多资源)

---

## 功能特性

| 特性 | 说明 |
|------|------|
| **TypeScript → Java** | 将实体类、仓库接口、服务类、控制器类、DTO 等一键转为 Java 代码 |
| **前端 API Client 生成** | 从控制器/实体/DTO 自动生成带 `fetch` 实现的 TypeScript API 客户端 |
| **多组件支持** | 支持 ORM（MyBatis-Plus）、Redis、消息队列、Spring Security、Admin 等组件 |
| **插件系统** | 可扩展的插件架构，支持自定义装饰器转换、类型映射、代码后处理等 |
| **增量生成** | 基于 SHA-256 文件哈希的增量生成，仅重新生成变更的文件 |
| **Watch 模式** | 监听源文件变化，自动触发增量生成 |
| **tsup/esbuild 插件** | 内置 esbuild 插件，构建时自动填充装饰器泛型参数 |
| **类型映射** | 自动将 TypeScript 类型映射到对应的 Java 类型 |
| **装饰器转换** | 自动将 TypeScript 装饰器转换为 Java 注解 |

---

## 安装

```bash
# npm
npm install @ai-partner-x/aiko-boot-codegen

# pnpm
pnpm add @ai-partner-x/aiko-boot-codegen
```

---

## 快速开始

### TypeScript to Java（CLI）

#### 第 1 步：编写 TypeScript 源码

**实体类（`src/entity/user.entity.ts`）**

```typescript
import { Entity, TableId, TableField } from '@ai-partner-x/aiko-boot-starter-orm';

@Entity
class User {
  @TableId
  id: number;

  @TableField('user_name')
  name: string;

  @TableField('user_email')
  email: string;

  createdAt: Date;
}
```

**仓库接口（`src/mapper/user.mapper.ts`）**

```typescript
import { Mapper } from '@ai-partner-x/aiko-boot-starter-orm';
import { BaseMapper } from '@ai-partner-x/aiko-boot-starter-orm';
import { User } from '../entity/user.entity';

@Mapper()
class UserMapper extends BaseMapper<User> {}
```

**服务类（`src/service/user.service.ts`）**

```typescript
import { Service, Autowired, Transactional } from '@ai-partner-x/aiko-boot';

@Service
class UserService {
  @Autowired
  private userMapper: UserMapper;

  @Transactional
  getUser(id: number): User {
    return this.userMapper.selectById(id);
  }

  @Transactional
  createUser(user: User): void {
    this.userMapper.insert(user);
  }

  getAllUsers(): User[] {
    return this.userMapper.selectList(null);
  }
}
```

**控制器类（`src/controller/user.controller.ts`）**

```typescript
import { RestController, Autowired, GetMapping, PostMapping, PathVariable, RequestBody } from '@ai-partner-x/aiko-boot';

@RestController
class UserController {
  @Autowired
  private userService: UserService;

  @GetMapping('/users/:id')
  getUser(@PathVariable('id') id: number): User {
    return this.userService.getUser(id);
  }

  @GetMapping('/users')
  getUsers(): User[] {
    return this.userService.getAllUsers();
  }

  @PostMapping('/users')
  createUser(@RequestBody user: User): void {
    this.userService.createUser(user);
  }
}
```

#### 第 2 步：运行 CLI

```bash
# 生成所有文件（默认输出到 ./gen，包名 com.example）
aiko-codegen transpile ./src --out ./gen --package com.example

# 启用 Lombok 注解
aiko-codegen transpile ./src --out ./gen --package com.example --lombok

# 指定 Java 版本
aiko-codegen transpile ./src --out ./gen --package com.example --java-version 21

# 增量生成（仅重新生成变更的文件）
aiko-codegen transpile ./src --out ./gen --package com.example --incremental

# 预览将要生成的文件（不实际写入）
aiko-codegen transpile ./src --out ./gen --package com.example --dry-run

# 显示详细日志
aiko-codegen transpile ./src --out ./gen --package com.example --verbose
```

#### 第 3 步：查看生成结果

```
gen/
├── entity/
│   └── User.java
├── mapper/
│   └── UserMapper.java
├── service/
│   └── UserService.java
└── controller/
    └── UserController.java
```

生成的 `User.java` 示例：

```java
package com.example.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableField;
import java.time.LocalDateTime;

@TableName
public class User {
    @TableId
    private Long id;

    @TableField("user_name")
    private String name;

    @TableField("user_email")
    private String email;

    private LocalDateTime createdAt;
}
```

---

### 前端 API Client 生成（编程 API）

`generateApiClient` 可以读取 `src/entity/`、`src/dto/`、`src/controller/` 目录，自动生成带 `fetch` 实现的前端 API 客户端。

```typescript
import { generateApiClient } from '@ai-partner-x/aiko-boot-codegen';

// 一次性生成
generateApiClient({
  srcDir: './src',   // 源目录，默认 './src'
  outDir: './dist/client', // 输出目录，默认 './dist/client'
  silent: false,     // 是否静默模式，默认 false
  force: false,      // 是否强制全量生成（忽略增量检查），默认 false
});
```

生成结果示例（`dist/client/`）：

```
dist/client/
├── user.entity.ts    # 从 src/entity/user.entity.ts 提取的 TS interface
├── user.dto.ts       # 从 src/dto/user.dto.ts 提取的 TS interface
├── user.api.ts       # 从 src/controller/user.controller.ts 生成的 API 类
└── index.ts          # 统一导出入口
```

**Watch 模式（持续监听）**

```typescript
import { watchApiClient } from '@ai-partner-x/aiko-boot-codegen';

watchApiClient({
  srcDir: './src',
  outDir: './dist/client',
  debounce: 200,   // 防抖时间（毫秒），默认 200
});
```

Watch 模式会：
1. 首次启动时强制全量生成一次
2. 监听 `entity/`、`dto/`、`controller/` 目录的 `.ts`/`.tsx` 文件变化
3. 文件变化后按防抖时间触发增量生成

---

### tsup / esbuild 插件

`decoratorGenericPlugin` 是一个 esbuild 插件，在构建时自动将形如 `@Mapper()` + `extends BaseMapper<User>` 的写法转换为 `@Mapper(User)`，使运行时装饰器能获取到正确的实体类型。

**在 `tsup.config.ts` 中使用：**

```typescript
import { defineConfig } from 'tsup';
import { decoratorGenericPlugin } from '@ai-partner-x/aiko-boot-codegen';

export default defineConfig({
  entry: ['src/index.ts'],
  esbuildPlugins: [decoratorGenericPlugin()],
});
```

**转换示例：**

```typescript
// 输入（开发时书写简洁）
@Mapper()
export class UserMapper extends BaseMapper<User> {}

// 输出（构建后，运行时可获取实体类型）
@Mapper(User)
export class UserMapper extends BaseMapper<User> {}
```

---

## CLI 命令参考

### `transpile` — TypeScript 转 Java

```bash
aiko-codegen transpile <source> [options]
```

**参数：**

| 参数 | 说明 |
|------|------|
| `<source>` | 源目录或单个 `.ts` 文件路径（必填） |

**选项：**

| 选项 | 简写 | 默认值 | 说明 |
|------|------|--------|------|
| `--out <dir>` | `-o` | `./gen` | Java 文件输出目录 |
| `--package <name>` | `-p` | `com.example` | Java 根包名 |
| `--lombok` | | `false` | 生成 Lombok 注解（`@Data` 等） |
| `--java-version <ver>` | | `17` | 目标 Java 版本，可选 `11`、`17`、`21` |
| `--spring-boot <ver>` | | `3.2.0` | Spring Boot 版本（影响导入语句） |
| `--dry-run` | | `false` | 仅显示将要生成的文件，不实际写入 |
| `--verbose` | `-v` | `false` | 显示详细日志 |
| `--incremental` | | `false` | 启用增量生成（基于文件哈希缓存） |

> **注意：** 测试文件（`*.spec.ts`、`*.test.ts`）和声明文件（`*.d.ts`）会自动跳过。

---

### `validate` — 验证 Java 兼容性

```bash
aiko-codegen validate <source> [options]
```

验证源文件中是否存在 Java 不兼容的写法。建议配合 ESLint 插件使用：

```bash
npx eslint --config .eslintrc.java-compat.json src/
```

---

## 编程 API 参考

### `transpile(sourceCode, options)`

将 TypeScript 源代码字符串转换为 Java 代码，返回文件名→内容的 `Map`。

```typescript
import { transpile } from '@ai-partner-x/aiko-boot-codegen';

const result = transpile(
  `
    import { Entity, TableId, TableField } from '@ai-partner-x/aiko-boot-starter-orm';

    @Entity
    class User {
      @TableId
      id: number;

      @TableField('user_name')
      name: string;
    }
  `,
  {
    outDir: './gen',
    packageName: 'com.example.entity',
    useLombok: false,
    javaVersion: '17',
    springBootVersion: '3.2.0',
  }
);

console.log(result.get('User.java')); // 输出生成的 Java 代码
```

**`TranspilerOptions` 参数：**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `outDir` | `string` | 是 | — | 输出目录 |
| `packageName` | `string` | 是 | — | Java 包名 |
| `javaVersion` | `'11' \| '17' \| '21'` | 否 | `'17'` | 目标 Java 版本 |
| `springBootVersion` | `string` | 否 | `'3.2.0'` | Spring Boot 版本 |
| `useLombok` | `boolean` | 否 | `false` | 是否生成 Lombok 注解 |

---

### `parseSourceFile(sourceCode, fileName?)`

解析 TypeScript 源代码，返回 `ParsedClass[]`（仅包含类信息）。

```typescript
import { parseSourceFile } from '@ai-partner-x/aiko-boot-codegen';

const classes = parseSourceFile(`
  @Entity
  class User {
    id: number;
  }
`);
console.log(classes[0].name);       // 'User'
console.log(classes[0].decorators); // [{ name: 'Entity', args: {} }]
```

---

### `parseSourceFileFull(sourceCode, fileName?)`

解析 TypeScript 源代码，返回 `ParsedSourceFile`（包含导入、类、接口、注释等完整信息）。

```typescript
import { parseSourceFileFull } from '@ai-partner-x/aiko-boot-codegen';

const result = parseSourceFileFull(sourceCode);
console.log(result.imports);    // 导入信息
console.log(result.classes);    // 类信息
console.log(result.interfaces); // 接口信息（将生成 Java DTO 类）
console.log(result.comments);   // 顶层注释
```

---

### `generateJavaClass(parsedClass, options)`

根据 `ParsedClass` 生成 Java 类代码字符串。

```typescript
import { generateJavaClass } from '@ai-partner-x/aiko-boot-codegen';

const javaCode = generateJavaClass(
  {
    name: 'User',
    decorators: [{ name: 'Entity', args: {} }],
    fields: [
      { name: 'id', type: 'number', decorators: [{ name: 'TableId', args: {} }], optional: false },
      { name: 'name', type: 'string', decorators: [], optional: false },
    ],
    methods: [],
  },
  {
    outDir: './gen',
    packageName: 'com.example.entity',
  }
);
```

---

### `generateApiClient(options?)`

从 `src/entity/`、`src/dto/`、`src/controller/` 生成前端 API Client。

```typescript
import { generateApiClient } from '@ai-partner-x/aiko-boot-codegen';

generateApiClient({
  srcDir: './src',
  outDir: './dist/client',
  silent: false,
  force: false,
});
```

---

### `watchApiClient(options?)`

Watch 模式：监听源文件变化，自动触发增量生成。

```typescript
import { watchApiClient } from '@ai-partner-x/aiko-boot-codegen';

watchApiClient({
  srcDir: './src',
  outDir: './dist/client',
  debounce: 200,
});
```

---

### `decoratorGenericPlugin()`

创建 esbuild 插件，在构建时自动填充装饰器泛型参数（如 `@Mapper()` → `@Mapper(User)`）。

```typescript
import { decoratorGenericPlugin } from '@ai-partner-x/aiko-boot-codegen';

// 在 tsup.config.ts 中使用
export default defineConfig({
  esbuildPlugins: [decoratorGenericPlugin()],
});
```

---

### `transformSourceCode(sourceCode, fileName?)`

在内存中对 TypeScript 源代码执行装饰器泛型参数填充转换，返回转换后的代码字符串。

```typescript
import { transformSourceCode } from '@ai-partner-x/aiko-boot-codegen';

const output = transformSourceCode(`
  @Mapper()
  export class UserMapper extends BaseMapper<User> {}
`, 'user.mapper.ts');

console.log(output); // @Mapper(User) ...
```

---

## 支持的装饰器与组件

### ORM 组件（MyBatis-Plus）

| TypeScript 装饰器 | Java 注解 | 说明 |
|------------------|-----------|------|
| `@Entity` | `@TableName` | 实体类映射数据库表 |
| `@TableName` | `@TableName` | 同上，直接使用 MyBatis-Plus 注解名 |
| `@TableId` | `@TableId` | 主键字段 |
| `@TableField('col')` | `@TableField("col")` | 数据库字段 |
| `@Mapper()` / `@Repository` | `@Mapper` / `@Repository` | 数据访问层接口 |

### Redis 组件（Spring Data Redis）

| TypeScript 装饰器 | Java 注解 |
|------------------|-----------|
| `@RedisHash` | `@RedisHash` |
| `@RedisKey` / `@Id` | `@Id` |
| `@RedisValue` / `@Indexed` | `@Indexed` |
| `@RedisRepository` / `@RedisRepo` | `@Repository` |

### 消息队列组件（Spring Cloud Stream）

| TypeScript 装饰器 | Java 注解 |
|------------------|-----------|
| `@EnableBinding` / `@MqBinding` | `@EnableBinding` |
| `@StreamListener` / `@MqListener` | `@StreamListener` |
| `@Output` / `@MqSender` | `@Output` |

### 安全认证组件（Spring Security）

| TypeScript 装饰器 | Java 注解 |
|------------------|-----------|
| `@EnableGlobalMethodSecurity` | `@EnableGlobalMethodSecurity` |
| `@PreAuthorize` | `@PreAuthorize` |
| `@PostAuthorize` | `@PostAuthorize` |
| `@Secured` | `@Secured` |
| `@RolesAllowed` | `@RolesAllowed` |
| `@AuthenticationPrincipal` | `@AuthenticationPrincipal` |

### Admin 框架组件

| TypeScript 装饰器 | Java 注解 |
|------------------|-----------|
| `@AdminModule` | `@AdminModule` |
| `@AdminMenu` | `@AdminMenu` |
| `@AdminRoute` | `@AdminRoute` |
| `@AdminPermission` | `@AdminPermission` |

### Web 请求映射

| TypeScript 装饰器 | Java 注解 |
|------------------|-----------|
| `@GetMapping(path)` | `@GetMapping(path)` |
| `@PostMapping(path)` | `@PostMapping(path)` |
| `@PutMapping(path)` | `@PutMapping(path)` |
| `@DeleteMapping(path)` | `@DeleteMapping(path)` |
| `@PatchMapping(path)` | `@PatchMapping(path)` |
| `@PathVariable('id')` | `@PathVariable("id")` |
| `@RequestParam` | `@RequestParam` |
| `@RequestBody` | `@RequestBody` |

> **路径参数格式自动转换：** `:id` → `{id}`（由 `controllerPlugin` 完成）

---

## 类型映射

| TypeScript 类型 | Java 类型 |
|----------------|-----------|
| `number` | `Integer` |
| `string` | `String` |
| `boolean` | `Boolean` |
| `Date` | `LocalDateTime` |
| `any` | `Object` |
| `void` | `void` |
| `null` / `undefined` | `null` |
| `T[]` / `Array<T>` | `List<T>` |

**ID 字段类型映射（按场景区分）：**

| 场景 | Java 类型 |
|------|-----------|
| 默认数据库主键 | `Long` |
| Redis 实体 ID | `String` |

---

## 内置插件

CLI 默认自动加载以下内置插件（无需手动注册）：

| 插件名 | 说明 |
|--------|------|
| `entity-plugin` | `@Entity` → `@TableName` 转换 |
| `mapper-plugin` | `@Mapper(User)` 参数清理（Java 通过泛型推断类型） |
| `validation-plugin` | `@Required` → `@NotNull`、`@MinLength`/`@MaxLength` → `@Size` 等 |
| `date-plugin` | `Date` 类型 → `LocalDateTime` |
| `service-plugin` | `@Service` 类处理 |
| `controller-plugin` | `@RestController` 路径参数格式转换（`:id` → `{id}`） |
| `querywrapper-plugin` | `QueryWrapper<T>` 类型保持原样 |
| `redis`（组件插件） | Redis 相关装饰器转换 |
| `mq`（组件插件） | 消息队列装饰器转换 |
| `security`（组件插件） | Spring Security 装饰器转换 |
| `admin`（组件插件） | Admin 框架装饰器转换 |

---

## 增量生成与缓存

当使用 `--incremental` 标志时，CLI 会：

1. 计算每个源文件的 **SHA-256** 哈希值
2. 与缓存文件（`.codegen-cache.json`）中的哈希值比较
3. 仅对**哈希值变化**的文件重新生成
4. 自动清理 **7 天**以上的过期缓存条目

**缓存文件格式（`.codegen-cache.json`）：**

```json
{
  "src/entity/user.entity.ts": {
    "hash": "a1b2c3d4...",
    "timestamp": 1710000000000
  }
}
```

> `.codegen-cache.json` 建议加入 `.gitignore`。

---

## 错误处理

转换过程中遇到的错误会汇总写入 `codegen-errors.json`：

```json
[
  {
    "file": "src/entity/user.entity.ts",
    "error": "Unexpected token at line 5",
    "type": "parse"
  }
]
```

**错误类型：**

| 类型 | 说明 |
|------|------|
| `parse` | TypeScript 语法解析错误 |
| `type` | 类型推断或映射错误 |
| `other` | 其他错误 |

---

## 测试

```bash
npm test
# 或
pnpm test
```

测试覆盖：

- 解析器单元测试（`parser.test.ts`）
- 插件系统测试（`plugins.test.ts`）
- 代码生成集成测试（`integration.test.ts`）
- 生成器测试（`generator.test.ts`）

---

## 更多资源

- [API.md](./API.md) — 完整 API 类型参考
- [PLUGIN_DEVELOPMENT.md](./PLUGIN_DEVELOPMENT.md) — 二次开发手册（插件、Transformer、esbuild 插件开发）
- GitHub Issues: https://github.com/ai-partner-x/ai-first-framework/issues
