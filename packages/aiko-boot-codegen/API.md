# API 文档

本文档提供了 @ai-partner-x/aiko-boot-codegen 的完整 API 类型参考。

## 目录

- [核心 API](#核心-api)
- [类型定义](#类型定义)
- [插件 API](#插件-api)
- [缓存 API](#缓存-api)
- [构建工具 API](#构建工具-api)
- [常量](#常量)
- [错误处理](#错误处理)

---

## 核心 API

### transpile

将 TypeScript 源代码转换为 Java 代码。

**签名：**

```typescript
function transpile(
  sourceCode: string,
  options: TranspilerOptions
): Map<string, string>
```

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sourceCode` | `string` | 是 | TypeScript 源代码字符串 |
| `options` | `TranspilerOptions` | 是 | 转换选项 |

**返回值：**

返回 `Map<string, string>`，键为 Java 文件名（如 `User.java`），值为生成的 Java 代码字符串。

**示例：**

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
  }
);

console.log(result.get('User.java'));
```

---

### parseSourceFile

解析 TypeScript 源文件，提取类信息列表（不含接口、导入等）。

**签名：**

```typescript
function parseSourceFile(
  sourceCode: string,
  fileName?: string
): ParsedClass[]
```

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sourceCode` | `string` | 是 | TypeScript 源代码 |
| `fileName` | `string` | 否 | 文件名（默认 `'source.ts'`） |

**返回值：**

返回 `ParsedClass[]` 数组。

**示例：**

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

### parseSourceFileFull

解析 TypeScript 源文件，返回完整信息（导入、类、接口、注释等）。

**签名：**

```typescript
function parseSourceFileFull(
  sourceCode: string,
  fileName?: string
): ParsedSourceFile
```

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sourceCode` | `string` | 是 | TypeScript 源代码 |
| `fileName` | `string` | 否 | 文件名（默认 `'source.ts'`） |

**返回值：**

返回 `ParsedSourceFile` 对象。

**示例：**

```typescript
import { parseSourceFileFull } from '@ai-partner-x/aiko-boot-codegen';

const result = parseSourceFileFull(sourceCode);
console.log(result.imports);    // 导入信息
console.log(result.classes);    // 类信息
console.log(result.interfaces); // 接口信息
console.log(result.comments);   // 注释
```

---

### generateJavaClass

根据解析后的类信息生成 Java 类代码。

**签名：**

```typescript
function generateJavaClass(
  parsedClass: ParsedClass,
  options: GeneratorOptions
): string
```

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `parsedClass` | `ParsedClass` | 是 | 解析的类信息 |
| `options` | `GeneratorOptions` | 是 | 生成器选项 |

**返回值：**

返回生成的 Java 代码字符串。

---

### generateApiClient

从 `src/entity/`、`src/dto/`、`src/controller/` 目录生成前端 API Client。

**签名：**

```typescript
function generateApiClient(options?: CodegenOptions): void
```

**`CodegenOptions` 参数：**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `srcDir` | `string` | `'./src'` | 源目录 |
| `outDir` | `string` | `'./dist/client'` | 输出目录 |
| `silent` | `boolean` | `false` | 是否静默模式（不输出日志） |
| `force` | `boolean` | `false` | 强制全量生成（忽略增量检查） |

**示例：**

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

### watchApiClient

Watch 模式：监听源文件变化，自动触发增量生成。

**签名：**

```typescript
function watchApiClient(options?: WatchOptions): void
```

**`WatchOptions` 参数（继承 `CodegenOptions`）：**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `srcDir` | `string` | `'./src'` | 源目录 |
| `outDir` | `string` | `'./dist/client'` | 输出目录 |
| `silent` | `boolean` | `false` | 是否静默模式 |
| `force` | `boolean` | `false` | 是否强制全量生成 |
| `debounce` | `number` | `200` | 文件变化防抖时间（毫秒） |

**示例：**

```typescript
import { watchApiClient } from '@ai-partner-x/aiko-boot-codegen';

watchApiClient({
  srcDir: './src',
  outDir: './dist/client',
  debounce: 300,
});
```

---

## 类型定义

### TranspilerOptions

转换器选项。

```typescript
interface TranspilerOptions {
  /** 输出目录（必填） */
  outDir: string;
  /** Java 包名（必填） */
  packageName: string;
  /** Java 版本，默认 '17' */
  javaVersion?: '11' | '17' | '21';
  /** Spring Boot 版本，默认 '3.2.0' */
  springBootVersion?: string;
  /** 是否生成 Lombok 注解，默认 false */
  useLombok?: boolean;
}
```

### GeneratorOptions

生成器选项，与 `TranspilerOptions` 完全相同。

```typescript
type GeneratorOptions = TranspilerOptions;
```

### CodegenOptions

API Client 生成选项。

```typescript
interface CodegenOptions {
  /** 源目录，默认 './src' */
  srcDir?: string;
  /** 输出目录，默认 './dist/client' */
  outDir?: string;
  /** 是否静默模式，默认 false */
  silent?: boolean;
  /** 强制全量生成，默认 false */
  force?: boolean;
}
```

### WatchOptions

Watch 模式选项，继承自 `CodegenOptions`。

```typescript
interface WatchOptions extends CodegenOptions {
  /** 文件变化防抖时间（毫秒），默认 200 */
  debounce?: number;
}
```

### ParsedSourceFile

解析的源文件信息。

```typescript
interface ParsedSourceFile {
  /** 文件路径 */
  filePath: string;
  /** 导入声明 */
  imports: ParsedImport[];
  /** 类 */
  classes: ParsedClass[];
  /** 接口（会被转换为 Java DTO 类） */
  interfaces: ParsedInterface[];
  /** 顶层注释 */
  comments: ParsedComment[];
}
```

### ParsedClass

解析的类信息。

```typescript
interface ParsedClass {
  /** 类名 */
  name: string;
  /** 类级装饰器 */
  decorators: ParsedDecorator[];
  /** 字段 */
  fields: ParsedField[];
  /** 方法 */
  methods: ParsedMethod[];
  /** 构造函数 */
  constructor?: ParsedConstructor;
  /** 类级注释 */
  comment?: ParsedComment;
}
```

### ParsedDecorator

解析的装饰器信息。

```typescript
interface ParsedDecorator {
  /** 装饰器名称（不含 `@`） */
  name: string;
  /** 装饰器参数（键值对） */
  args: Record<string, any>;
}
```

### ParsedField

解析的字段信息。

```typescript
interface ParsedField {
  /** 字段名 */
  name: string;
  /** TypeScript 类型字符串 */
  type: string;
  /** 字段级装饰器 */
  decorators: ParsedDecorator[];
  /** 是否为可选字段（带 `?`） */
  optional: boolean;
  /** 字段注释 */
  comment?: ParsedComment;
}
```

### ParsedMethod

解析的方法信息。

```typescript
interface ParsedMethod {
  /** 方法名 */
  name: string;
  /** 返回类型字符串 */
  returnType: string;
  /** 参数列表 */
  parameters: ParsedParameter[];
  /** 方法级装饰器 */
  decorators: ParsedDecorator[];
  /** 是否为 async 方法 */
  isAsync: boolean;
  /** 方法体语句（用于代码转换） */
  body?: ParsedStatement[];
  /** 方法注释 */
  comment?: ParsedComment;
}
```

### ParsedParameter

解析的方法参数信息。

```typescript
interface ParsedParameter {
  /** 参数名 */
  name: string;
  /** TypeScript 类型字符串 */
  type: string;
  /** 参数级装饰器 */
  decorators: ParsedDecorator[];
}
```

### ParsedImport

解析的导入声明。

```typescript
interface ParsedImport {
  /** 模块路径，如 '@ai-partner-x/aiko-boot' */
  modulePath: string;
  /** 具名导入，如 ['Service', 'Autowired'] */
  namedImports: string[];
  /** 默认导入，如 'React' */
  defaultImport?: string;
  /** 命名空间导入，如 '* as fs' */
  namespaceImport?: string;
  /** 是否为 type-only 导入 */
  isTypeOnly: boolean;
}
```

### ParsedInterface

解析的接口信息（转换为 Java DTO 类）。

```typescript
interface ParsedInterface {
  /** 接口名 */
  name: string;
  /** 接口属性 */
  properties: ParsedInterfaceProperty[];
  /** 接口级装饰器 */
  decorators: ParsedDecorator[];
  /** 接口注释 */
  comment?: ParsedComment;
  /** 是否导出 */
  isExported: boolean;
}
```

### ParsedInterfaceProperty

解析的接口属性。

```typescript
interface ParsedInterfaceProperty {
  /** 属性名 */
  name: string;
  /** TypeScript 类型字符串 */
  type: string;
  /** 是否可选 */
  optional: boolean;
  /** 属性注释 */
  comment?: string;
}
```

### ParsedComment

解析的注释。

```typescript
interface ParsedComment {
  /** 注释类型 */
  type: 'jsdoc' | 'line' | 'block';
  /** 注释文本（不含分隔符） */
  text: string;
  /** JSDoc 标签（仅 jsdoc 类型有效） */
  tags?: { tag: string; text: string }[];
}
```

### ParsedConstructor

解析的构造函数。

```typescript
interface ParsedConstructor {
  parameters: ParsedParameter[];
}
```

---

## 插件 API

### TranspilePlugin

插件接口。

```typescript
interface TranspilePlugin {
  /** 插件名称（必填，用于去重） */
  name: string;
  
  /**
   * 插件优先级（数字越大越先执行），默认 0
   * 内置插件优先级参考：entity-plugin/mapper-plugin/service-plugin/controller-plugin 为 10，
   * validation-plugin/date-plugin/querywrapper-plugin 为 5
   */
  priority?: number;
  
  /** 装饰器转换钩子 */
  transformDecorator?: (decorator: ParsedDecorator, context: TransformContext) => ParsedDecorator;
  
  /** 类型转换钩子 */
  transformType?: (tsType: string, context: TransformContext) => string;
  
  /** 方法转换钩子 */
  transformMethod?: (method: ParsedMethod, context: TransformContext) => ParsedMethod;
  
  /** 类转换钩子 */
  transformClass?: (cls: ParsedClass, context: TransformContext) => ParsedClass;
  
  /** 后处理钩子（在 Java 代码生成完毕后调用） */
  postProcess?: (javaCode: string, context: TransformContext) => string;
  
  /** 生成额外代码钩子（返回 null 表示不生成） */
  generateAdditional?: (cls: ParsedClass, context: TransformContext) => string | null;
}
```

### TransformContext

传递给所有插件钩子的上下文对象。

```typescript
interface TransformContext {
  /** 源文件路径 */
  sourceFile: string;
  /** 当前正在处理的类名 */
  className: string;
  /** 根据装饰器推断的类类型 */
  classType: 'entity' | 'repository' | 'service' | 'controller' | 'dto'
           | 'redis' | 'mq' | 'security' | 'admin' | 'unknown';
  /** 转换器选项 */
  options: TranspilerOptions;
  /** 当前文件中的所有解析类 */
  allClasses: ParsedClass[];
}
```

### PluginRegistry

插件注册表，管理多个插件的注册与协调调用。

```typescript
class PluginRegistry {
  /** 注册单个插件（同名插件自动忽略） */
  register(plugin: TranspilePlugin): void;
  
  /** 批量注册插件 */
  registerAll(plugins: TranspilePlugin[]): void;
  
  /** 获取所有已注册插件（按优先级降序排列） */
  getPlugins(): TranspilePlugin[];
  
  /** 依次调用所有插件的 transformDecorator 钩子 */
  applyDecoratorTransform(decorator: ParsedDecorator, context: TransformContext): ParsedDecorator;
  
  /** 依次调用所有插件的 transformType 钩子 */
  applyTypeTransform(tsType: string, context: TransformContext): string;
  
  /** 依次调用所有插件的 transformMethod 钩子 */
  applyMethodTransform(method: ParsedMethod, context: TransformContext): ParsedMethod;
  
  /** 依次调用所有插件的 transformClass 钩子 */
  applyClassTransform(cls: ParsedClass, context: TransformContext): ParsedClass;
  
  /** 依次调用所有插件的 postProcess 钩子 */
  applyPostProcess(javaCode: string, context: TransformContext): string;
}
```

### defaultPluginRegistry

全局默认插件注册表实例（不含内置插件，按需使用）。

```typescript
const defaultPluginRegistry: PluginRegistry;
```

### getBuiltinPlugins

获取所有内置插件的函数。

**签名：**

```typescript
function getBuiltinPlugins(): TranspilePlugin[]
```

**返回：** 包含全部内置插件的数组（entity、mapper、validation、date、service、controller、querywrapper 及各组件插件）。

### getPluginsByName

按名称获取内置插件子集。

**签名：**

```typescript
function getPluginsByName(names: string[]): TranspilePlugin[]
```

**可用名称：** `'entity-plugin'`、`'mapper-plugin'`、`'validation-plugin'`、`'date-plugin'`、`'service-plugin'`、`'controller-plugin'`、`'querywrapper-plugin'`

---

## 缓存 API

### calculateHash

计算字符串内容的 SHA-256 哈希值。

**签名：**

```typescript
function calculateHash(content: string): string
```

### loadCache

从磁盘加载缓存文件（`.codegen-cache.json`）。

**签名：**

```typescript
function loadCache(): Record<string, { hash: string; timestamp: number }>
```

### saveCache

将缓存数据写入磁盘。

**签名：**

```typescript
function saveCache(cache: Record<string, { hash: string; timestamp: number }>): void
```

### hasFileChanged

检查文件内容自上次生成以来是否已变更。

**签名：**

```typescript
function hasFileChanged(filePath: string, content: string): boolean
```

**返回：** 文件已变更返回 `true`，否则返回 `false`。

### updateCacheEntry

更新指定文件的缓存条目。

**签名：**

```typescript
function updateCacheEntry(filePath: string, content: string): void
```

### removeCacheEntry

删除指定文件的缓存条目。

**签名：**

```typescript
function removeCacheEntry(filePath: string): void
```

### clearCache

清除全部缓存（删除 `.codegen-cache.json` 文件）。

**签名：**

```typescript
function clearCache(): void
```

### getCacheStats

获取缓存统计信息。

**签名：**

```typescript
function getCacheStats(): { total: number; stale: number }
```

**返回：** `total` 为缓存总条目数，`stale` 为超过 7 天的过期条目数。

### cleanupStaleCache

清理超过 7 天的过期缓存条目。

**签名：**

```typescript
function cleanupStaleCache(): void
```

---

## 构建工具 API

### decoratorGenericPlugin

创建 esbuild/tsup 插件，在构建时自动将 `@Mapper()` + `extends BaseMapper<User>` 转换为 `@Mapper(User)`。

**签名：**

```typescript
function decoratorGenericPlugin(): EsbuildPlugin
```

**示例（`tsup.config.ts`）：**

```typescript
import { defineConfig } from 'tsup';
import { decoratorGenericPlugin } from '@ai-partner-x/aiko-boot-codegen';

export default defineConfig({
  esbuildPlugins: [decoratorGenericPlugin()],
});
```

### createDecoratorGenericTransformer

创建 TypeScript 编译器 Transformer，实现装饰器泛型参数自动填充。

**签名：**

```typescript
function createDecoratorGenericTransformer(): ts.TransformerFactory<ts.SourceFile>
```

**示例：**

```typescript
import * as ts from 'typescript';
import { createDecoratorGenericTransformer } from '@ai-partner-x/aiko-boot-codegen';

const result = ts.transform(sourceFile, [createDecoratorGenericTransformer()]);
```

### transformSourceCode

在内存中对 TypeScript 源代码执行装饰器泛型参数填充，返回转换后的代码字符串。

**签名：**

```typescript
function transformSourceCode(sourceCode: string, fileName?: string): string
```

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sourceCode` | `string` | 是 | TypeScript 源代码字符串 |
| `fileName` | `string` | 否 | 文件名（影响错误信息），默认 `'input.ts'` |

**示例：**

```typescript
import { transformSourceCode } from '@ai-partner-x/aiko-boot-codegen';

const output = transformSourceCode(`
  @Mapper()
  export class UserMapper extends BaseMapper<User> {}
`);
// output: '@Mapper(User)\nexport class UserMapper extends BaseMapper<User> {}\n'
```

---

## 常量

### TYPE_MAPPING

TypeScript 到 Java 类型映射表。

```typescript
const TYPE_MAPPING: Record<string, string> = {
  'number':    'Integer',
  'string':    'String',
  'boolean':   'Boolean',
  'Date':      'LocalDateTime',
  'any':       'Object',
  'void':      'void',
  'null':      'null',
  'undefined': 'null',
};
```

### ID_TYPE_MAPPING

ID 字段类型映射（按组件场景区分）。

```typescript
const ID_TYPE_MAPPING: Record<string, string> = {
  default: 'Long',   // 数据库主键
  redis:   'String', // Redis 实体 ID
};
```

### DECORATOR_MAPPING

TypeScript 装饰器到 Java 注解名的映射表（不含 `@` 前缀）。

```typescript
const DECORATOR_MAPPING: Record<string, string> = {
  'Entity':          '@TableName',
  'Repository':      '@Repository',
  'Service':         '@Service',
  'RestController':  '@RestController',
  'RedisHash':       '@RedisHash',
  'MqListener':      '@StreamListener',
  'PreAuthorize':    '@PreAuthorize',
  // ... 更多映射见 types.ts
};
```

### IMPORT_MAPPING

TypeScript 模块/具名导入到 Java import 语句的映射。

```typescript
const IMPORT_MAPPING: Record<string, string[]> = {
  '@ai-partner-x/aiko-boot': [
    'org.springframework.stereotype.Service',
    'org.springframework.web.bind.annotation.RestController',
    'org.springframework.beans.factory.annotation.Autowired',
    'org.springframework.transaction.annotation.Transactional',
  ],
  '@ai-partner-x/aiko-boot-starter-orm': [
    'com.baomidou.mybatisplus.core.conditions.query.QueryWrapper',
    'com.baomidou.mybatisplus.core.mapper.BaseMapper',
    'com.baomidou.mybatisplus.annotation.*',
    // ...
  ],
  // ... 更多映射见 types.ts
};
```

---

## 错误处理

### 错误类型

| 类型 | 说明 |
|------|------|
| `parse` | TypeScript 语法解析错误 |
| `type` | 类型推断或映射错误 |
| `other` | 其他运行时错误 |

### 错误报告文件格式

CLI 运行后如有错误，会在当前目录生成 `codegen-errors.json`：

```json
[
  {
    "file": "src/entity/user.entity.ts",
    "error": "Unexpected token",
    "type": "parse"
  }
]
```

---

## 更多信息

- [README.md](./README.md) — 使用手册
- [PLUGIN_DEVELOPMENT.md](./PLUGIN_DEVELOPMENT.md) — 二次开发手册
- GitHub: https://github.com/ai-partner-x/ai-first-framework
