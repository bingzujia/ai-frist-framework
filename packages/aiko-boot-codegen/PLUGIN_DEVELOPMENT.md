# 二次开发手册

本手册面向希望扩展 `@ai-partner-x/aiko-boot-codegen` 功能的开发者，涵盖**插件开发**、**TypeScript Transformer 开发**和 **esbuild/tsup 插件开发**三个层面。

---

## 目录

- [架构概览](#架构概览)
- [插件开发](#插件开发)
  - [插件接口](#插件接口)
  - [插件生命周期](#插件生命周期)
  - [插件优先级](#插件优先级)
  - [插件钩子详解](#插件钩子详解)
  - [注册与使用插件](#注册与使用插件)
  - [插件示例](#插件示例)
  - [插件测试](#插件测试)
- [TypeScript Transformer 开发](#typescript-transformer-开发)
  - [Transformer 接口](#transformer-接口)
  - [自定义 Transformer 示例](#自定义-transformer-示例)
- [esbuild / tsup 插件开发](#esbuild--tsup-插件开发)
  - [内置 decoratorGenericPlugin 原理](#内置-decoratorgenericplugin-原理)
  - [自定义 esbuild 插件示例](#自定义-esbuild-插件示例)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)

---

## 架构概览

```
aiko-boot-codegen
├── parser.ts          ← 解析 TypeScript AST → ParsedSourceFile
├── generator.ts       ← ParsedClass → Java 代码字符串
├── plugins.ts         ← TranspilePlugin 接口 + PluginRegistry
├── builtin-plugins.ts ← 内置插件（entity、mapper、date 等）
├── component-plugins.ts ← 组件插件（redis、mq、security、admin）
├── transformer.ts     ← TypeScript Transformer（装饰器泛型填充）
├── tsup-plugin.ts     ← esbuild/tsup 插件（使用 transformer）
├── cache-manager.ts   ← 增量生成缓存
├── client-generator.ts← 前端 API Client 生成
└── cli/
    ├── index.ts       ← CLI 入口（commander）
    └── transpile.ts   ← transpile 命令逻辑
```

**扩展点总结：**

| 扩展层 | 接口/机制 | 适用场景 |
|--------|-----------|----------|
| **插件系统** | `TranspilePlugin` + `PluginRegistry` | 自定义装饰器转换、类型映射、代码后处理 |
| **TypeScript Transformer** | `ts.TransformerFactory<ts.SourceFile>` | 在 TS AST 层面对源码进行修改 |
| **esbuild/tsup 插件** | `EsbuildPlugin` | 构建时对 `.ts` 文件进行预处理 |

---

## 插件开发

### 插件接口

```typescript
import type { TranspilePlugin, TransformContext, ParsedDecorator, ParsedMethod, ParsedClass } from '@ai-partner-x/aiko-boot-codegen';

const myPlugin: TranspilePlugin = {
  // 必填：唯一名称，同名插件只会注册一次
  name: 'my-plugin',
  
  // 可选：优先级，数字越大越先执行，默认 0
  priority: 10,
  
  // 钩子（全部可选，只需实现需要的钩子）
  transformDecorator(decorator, context) { return decorator; },
  transformType(tsType, context) { return tsType; },
  transformMethod(method, context) { return method; },
  transformClass(cls, context) { return cls; },
  postProcess(javaCode, context) { return javaCode; },
  generateAdditional(cls, context) { return null; },
};
```

### 插件生命周期

对于每个被处理的类，插件钩子按以下顺序依次调用：

```
解析 TypeScript AST
        ↓
transformClass   ── 对整个类进行转换（先于其他钩子）
        ↓
transformDecorator ── 对类/字段/方法上的每个装饰器转换
        ↓
transformType    ── 对每个类型引用转换
        ↓
transformMethod  ── 对每个方法转换
        ↓
生成 Java 代码
        ↓
postProcess      ── 对生成的完整 Java 代码字符串进行处理
        ↓
generateAdditional ── 生成额外辅助代码（追加到类体内）
```

每个钩子按**优先级从高到低**依次调用所有插件，上一个插件的输出作为下一个插件的输入（链式处理）。

### 插件优先级

| 优先级范围 | 建议用途 |
|-----------|----------|
| `100+` | 核心转换，需要最先执行 |
| `10–99` | 框架/组件特定转换 |
| `1–9` | 辅助功能（验证、日志等） |
| `0`（默认） | 通用兜底转换 |

内置插件的优先级参考：

| 插件 | 优先级 |
|------|--------|
| `entity-plugin` / `mapper-plugin` / `service-plugin` / `controller-plugin` | 10（默认，代码中未显式设置） |
| `validation-plugin` / `date-plugin` / `querywrapper-plugin` | 0（默认） |

### 插件钩子详解

#### `transformDecorator`

转换**单个装饰器**，对类装饰器、字段装饰器、方法装饰器和参数装饰器都生效。

```typescript
transformDecorator(decorator: ParsedDecorator, context: TransformContext): ParsedDecorator
```

- 返回新的 `ParsedDecorator` 对象（不要修改原对象）
- 如果不需要修改，直接 `return decorator`
- 修改 `decorator.name` 可以改变生成的 Java 注解名
- 修改 `decorator.args` 可以改变注解的参数

```typescript
// 示例：将 @ApiIgnore 转为 Java 的 @ApiIgnore
transformDecorator(decorator, context) {
  if (decorator.name === 'ApiIgnore') {
    return { ...decorator, name: 'ApiIgnore', args: {} };
  }
  return decorator;
}
```

#### `transformType`

转换**类型字符串**（字段类型、方法返回类型、参数类型）。

```typescript
transformType(tsType: string, context: TransformContext): string
```

- 输入为 TypeScript 类型字符串，如 `'number'`、`'User[]'`、`'Promise<User>'`
- 返回目标 Java 类型字符串
- 已有内置映射（见 `TYPE_MAPPING`），此钩子可覆盖或扩展

```typescript
// 示例：将自定义类型 Money 映射为 BigDecimal
transformType(tsType, context) {
  if (tsType === 'Money') return 'BigDecimal';
  if (tsType === 'UUID') return 'String';
  return tsType;
}
```

#### `transformMethod`

转换**整个方法**（含装饰器、参数、返回类型）。

```typescript
transformMethod(method: ParsedMethod, context: TransformContext): ParsedMethod
```

```typescript
// 示例：为 service 的写操作方法自动添加 @Transactional
transformMethod(method, context) {
  if (context.classType !== 'service') return method;
  const isWrite = ['create', 'update', 'delete', 'save', 'remove']
    .some(prefix => method.name.startsWith(prefix));
  if (!isWrite) return method;
  return {
    ...method,
    decorators: [...method.decorators, { name: 'Transactional', args: {} }],
  };
}
```

#### `transformClass`

转换**整个类**（含所有字段和方法），是最高级别的转换钩子。

```typescript
transformClass(cls: ParsedClass, context: TransformContext): ParsedClass
```

```typescript
// 示例：为实体类所有非空字符串字段添加 @NotBlank
transformClass(cls, context) {
  if (context.classType !== 'entity') return cls;
  const fields = cls.fields.map(field => {
    if (field.type === 'string' && !field.optional) {
      return {
        ...field,
        decorators: [...field.decorators, { name: 'NotBlank', args: {} }],
      };
    }
    return field;
  });
  return { ...cls, fields };
}
```

#### `postProcess`

在 Java 代码**字符串生成完毕后**进行最终处理，适合添加额外的 import 语句或格式调整。

```typescript
postProcess(javaCode: string, context: TransformContext): string
```

```typescript
// 示例：为实体类添加 Lombok 导入
postProcess(javaCode, context) {
  if (context.classType !== 'entity') return javaCode;
  const imports = 'import lombok.Data;\nimport lombok.NoArgsConstructor;\n';
  return imports + '\n' + javaCode;
}
```

#### `generateAdditional`

生成**额外的辅助代码**（如内部类、Builder 模式），返回字符串将被追加到 Java 类体内。

```typescript
generateAdditional(cls: ParsedClass, context: TransformContext): string | null
```

```typescript
// 示例：为实体类生成静态 Builder 内部类
generateAdditional(cls, context) {
  if (context.classType !== 'entity') return null;
  const fields = cls.fields
    .map(f => `    private ${f.type} ${f.name};`)
    .join('\n');
  return `
  public static class Builder {
${fields}

    public ${cls.name} build() {
      return new ${cls.name}();
    }
  }`;
}
```

### 注册与使用插件

#### 方式一：通过编程 API 使用

```typescript
import { transpile, PluginRegistry } from '@ai-partner-x/aiko-boot-codegen';
import myPlugin from './my-plugin';

// 创建注册表并注册插件
const registry = new PluginRegistry();
registry.register(myPlugin);

// 目前 transpile() 内部使用内置插件注册表，暂不接受外部 registry 参数。
// 如需集成自定义插件，可在生成后对结果进行 postProcess，
// 或直接调用 generateJavaClass 并将 registry 传入 options（见下文）。
const result = transpile(sourceCode, {
  outDir: './gen',
  packageName: 'com.example',
});
```

> **提示：** 如果你需要在代码生成流程中完整使用自定义插件，建议通过 CLI 的自定义入口脚本（见下方示例）。

#### 方式二：自定义 CLI 入口脚本

当需要在 CLI 模式下注入自定义插件时，可以创建一个包装脚本：

```typescript
#!/usr/bin/env node
// scripts/codegen.mts
import { PluginRegistry, getBuiltinPlugins } from '@ai-partner-x/aiko-boot-codegen';
import { transpileCommand } from '@ai-partner-x/aiko-boot-codegen/cli';
import myPlugin from './plugins/my-plugin.js';

// 内置插件已在 transpileCommand 内部自动注册，
// 此处演示如何在独立脚本中手动控制插件
const registry = new PluginRegistry();
registry.registerAll(getBuiltinPlugins());
registry.register(myPlugin);

await transpileCommand('./src', {
  out: './gen',
  package: 'com.example',
  lombok: false,
  javaVersion: '17',
  springBoot: '3.2.0',
  dryRun: false,
  verbose: true,
  incremental: false,
});
```

#### 方式三：注册多个插件

```typescript
import { PluginRegistry } from '@ai-partner-x/aiko-boot-codegen';
import plugin1 from './plugins/plugin1.js';
import plugin2 from './plugins/plugin2.js';
import plugin3 from './plugins/plugin3.js';

const registry = new PluginRegistry();
registry.registerAll([plugin1, plugin2, plugin3]);
```

### 插件示例

#### 示例 1：自定义装饰器转换（`@ApiIgnore`）

```typescript
// plugins/api-ignore-plugin.ts
import type { TranspilePlugin } from '@ai-partner-x/aiko-boot-codegen';

const apiIgnorePlugin: TranspilePlugin = {
  name: 'api-ignore-plugin',
  priority: 10,

  transformDecorator(decorator, _context) {
    if (decorator.name === 'ApiIgnore') {
      // 保持装饰器名称不变，清空参数
      return { ...decorator, args: {} };
    }
    return decorator;
  },
};

export default apiIgnorePlugin;
```

#### 示例 2：自定义类型映射（`Money` → `BigDecimal`）

```typescript
// plugins/money-type-plugin.ts
import type { TranspilePlugin } from '@ai-partner-x/aiko-boot-codegen';

const moneyTypePlugin: TranspilePlugin = {
  name: 'money-type-plugin',
  priority: 5,

  transformType(tsType, _context) {
    const customTypeMap: Record<string, string> = {
      'Money':   'BigDecimal',
      'UUID':    'String',
      'Buffer':  'byte[]',
    };
    return customTypeMap[tsType] ?? tsType;
  },
};

export default moneyTypePlugin;
```

#### 示例 3：实体字段验证注解

```typescript
// plugins/validation-plugin.ts
import type { TranspilePlugin } from '@ai-partner-x/aiko-boot-codegen';

const validationPlugin: TranspilePlugin = {
  name: 'auto-validation-plugin',
  priority: 5,

  transformClass(cls, context) {
    if (context.classType !== 'entity') return cls;

    const fields = cls.fields.map(field => {
      const decorators = [...field.decorators];

      if (field.type === 'string' && !field.optional) {
        decorators.push({ name: 'NotBlank', args: {} });
      }
      if (field.type === 'number') {
        decorators.push({ name: 'Min', args: { value: 0 } });
      }

      return { ...field, decorators };
    });

    return { ...cls, fields };
  },
};

export default validationPlugin;
```

#### 示例 4：服务方法自动添加 `@Transactional`

```typescript
// plugins/auto-transactional-plugin.ts
import type { TranspilePlugin } from '@ai-partner-x/aiko-boot-codegen';

const autoTransactionalPlugin: TranspilePlugin = {
  name: 'auto-transactional-plugin',
  priority: 5,

  transformMethod(method, context) {
    if (context.classType !== 'service') return method;

    const alreadyHasTransactional = method.decorators.some(
      d => d.name === 'Transactional'
    );
    if (alreadyHasTransactional) return method;

    const writeMethodPrefixes = ['create', 'update', 'delete', 'save', 'remove', 'batch'];
    const isWrite = writeMethodPrefixes.some(p => method.name.startsWith(p));
    if (!isWrite) return method;

    return {
      ...method,
      decorators: [...method.decorators, { name: 'Transactional', args: {} }],
    };
  },
};

export default autoTransactionalPlugin;
```

#### 示例 5：代码后处理（添加自定义 import）

```typescript
// plugins/custom-import-plugin.ts
import type { TranspilePlugin } from '@ai-partner-x/aiko-boot-codegen';

const customImportPlugin: TranspilePlugin = {
  name: 'custom-import-plugin',
  priority: 0,

  postProcess(javaCode, context) {
    if (context.classType === 'entity') {
      const imports = [
        'import com.fasterxml.jackson.annotation.JsonFormat;',
        'import com.fasterxml.jackson.databind.annotation.JsonSerialize;',
      ].join('\n');
      return imports + '\n\n' + javaCode;
    }
    return javaCode;
  },
};

export default customImportPlugin;
```

#### 示例 6：生成 Builder 内部类

```typescript
// plugins/builder-plugin.ts
import type { TranspilePlugin } from '@ai-partner-x/aiko-boot-codegen';

const builderPlugin: TranspilePlugin = {
  name: 'builder-plugin',
  priority: 0,

  generateAdditional(cls, context) {
    if (context.classType !== 'entity') return null;

    const fieldDecls = cls.fields
      .map(f => `    private ${f.type} ${f.name};`)
      .join('\n');

    const setters = cls.fields
      .map(f => `
    public Builder ${f.name}(${f.type} ${f.name}) {
      this.${f.name} = ${f.name};
      return this;
    }`)
      .join('');

    const assignments = cls.fields
      .map(f => `      obj.${f.name} = this.${f.name};`)
      .join('\n');

    return `
  public static class Builder {
${fieldDecls}
${setters}
    public ${cls.name} build() {
      ${cls.name} obj = new ${cls.name}();
${assignments}
      return obj;
    }
  }`;
  },
};

export default builderPlugin;
```

#### 示例 7：综合插件

```typescript
// plugins/comprehensive-plugin.ts
import type { TranspilePlugin } from '@ai-partner-x/aiko-boot-codegen';

const comprehensivePlugin: TranspilePlugin = {
  name: 'comprehensive-plugin',
  priority: 10,

  transformDecorator(decorator, _context) {
    // 将自定义装饰器 @CustomEntity 转为标准 @Entity
    if (decorator.name === 'CustomEntity') {
      return { ...decorator, name: 'Entity' };
    }
    return decorator;
  },

  transformType(tsType, _context) {
    if (tsType === 'UUID') return 'String';
    if (tsType === 'Money') return 'BigDecimal';
    return tsType;
  },

  transformMethod(method, context) {
    // 仅处理 service 层写操作
    if (context.classType === 'service') {
      const isWrite = method.name.startsWith('create')
        || method.name.startsWith('update')
        || method.name.startsWith('delete');
      if (isWrite) {
        return {
          ...method,
          decorators: [...method.decorators, { name: 'Transactional', args: {} }],
        };
      }
    }
    return method;
  },

  postProcess(javaCode, context) {
    if (context.classType === 'entity') {
      return 'import java.math.BigDecimal;\n\n' + javaCode;
    }
    return javaCode;
  },
};

export default comprehensivePlugin;
```

### 插件测试

使用 `PluginRegistry` 的方法直接对插件进行单元测试：

```typescript
// plugins/__tests__/my-plugin.test.ts
import { PluginRegistry } from '@ai-partner-x/aiko-boot-codegen';
import myPlugin from '../my-plugin.js';

const makeContext = (overrides = {}) => ({
  sourceFile: 'test.ts',
  className: 'TestClass',
  classType: 'entity' as const,
  options: { outDir: './gen', packageName: 'com.example' },
  allClasses: [],
  ...overrides,
});

describe('myPlugin', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
    registry.register(myPlugin);
  });

  test('transformDecorator: 将 OldName 转换为 NewName', () => {
    const decorator = { name: 'OldName', args: {} };
    const result = registry.applyDecoratorTransform(decorator, makeContext());
    expect(result.name).toBe('NewName');
  });

  test('transformType: 将 Money 映射为 BigDecimal', () => {
    const result = registry.applyTypeTransform('Money', makeContext());
    expect(result).toBe('BigDecimal');
  });

  test('transformClass: 不处理非 entity 类型', () => {
    const cls = { name: 'UserService', decorators: [], fields: [], methods: [] };
    const result = registry.applyClassTransform(cls, makeContext({ classType: 'service' }));
    expect(result).toBe(cls);
  });

  test('postProcess: 为 entity 类添加 import', () => {
    const code = 'public class User {}';
    const result = registry.applyPostProcess(code, makeContext());
    expect(result).toContain('import java.math.BigDecimal;');
  });
});
```

---

## TypeScript Transformer 开发

TypeScript Transformer 工作在 TypeScript **编译器 AST** 层面，能够在解析之前对 `.ts` 源文件进行修改，适合处理需要访问原始 AST 节点的场景。

### Transformer 接口

```typescript
type TransformerFactory<T extends ts.Node> = (context: ts.TransformationContext) => Transformer<T>;
type Transformer<T extends ts.Node> = (rootNode: T) => T;
```

### 自定义 Transformer 示例

以下示例实现了一个自定义 Transformer，将 `@Log()` 装饰器自动填充为 `@Log('ClassName')`：

```typescript
// transformers/log-decorator-transformer.ts
import ts from 'typescript';

/**
 * 将 @Log() 自动填充为 @Log('ClassName')
 */
export function createLogDecoratorTransformer(): ts.TransformerFactory<ts.SourceFile> {
  return (context: ts.TransformationContext) => {
    return (sourceFile: ts.SourceFile) => {
      const visitor = (node: ts.Node): ts.Node => {
        if (!ts.isClassDeclaration(node) || !node.name) {
          return ts.visitEachChild(node, visitor, context);
        }

        const className = node.name.text;
        const decorators = ts.getDecorators(node) ?? [];

        let modified = false;
        const newModifiers = (node.modifiers ?? []).map(modifier => {
          if (!ts.isDecorator(modifier)) return modifier;

          const expr = modifier.expression;
          if (!ts.isCallExpression(expr)) return modifier;

          const callee = expr.expression;
          if (!ts.isIdentifier(callee) || callee.text !== 'Log') return modifier;

          // 如果 @Log() 已经有参数，跳过
          if (expr.arguments.length > 0) return modifier;

          // 填充类名字符串参数：@Log('ClassName')
          modified = true;
          const newCall = context.factory.createCallExpression(
            callee,
            undefined,
            [context.factory.createStringLiteral(className)]
          );
          return context.factory.createDecorator(newCall);
        });

        if (!modified) return ts.visitEachChild(node, visitor, context);

        return context.factory.updateClassDeclaration(
          node,
          newModifiers,
          node.name,
          node.typeParameters,
          node.heritageClauses,
          node.members
        );
      };

      return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
    };
  };
}

/**
 * 在内存中执行转换
 */
export function transformWithLog(sourceCode: string, fileName = 'input.ts'): string {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceCode,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS
  );

  const result = ts.transform(sourceFile, [createLogDecoratorTransformer()]);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const output = printer.printFile(result.transformed[0]);

  result.dispose();
  return output;
}
```

**测试 Transformer：**

```typescript
import { transformWithLog } from './log-decorator-transformer.js';

const input = `
@Log()
export class UserService {
  doSomething() {}
}
`;

const output = transformWithLog(input);
console.log(output);
// 输出：@Log("UserService") ...
```

---

## esbuild / tsup 插件开发

esbuild 插件在**构建阶段**拦截文件加载，可以在文件内容写入 bundle 之前对其进行修改，适合批量的代码预处理。

### 内置 `decoratorGenericPlugin` 原理

```
文件加载
  ↓
onLoad 拦截 .ts/.tsx 文件（跳过 node_modules）
  ↓
快速检查：源码是否同时包含 @Mapper 和 BaseMapper
  ↓（是）
调用 transformSourceCode()（TypeScript Transformer）
  ↓
返回转换后的代码给 esbuild 继续处理
```

### 自定义 esbuild 插件示例

以下示例实现了一个 esbuild 插件，在构建时自动为 `@Log()` 注入类名参数：

```typescript
// plugins/log-esbuild-plugin.ts
import { promises as fs } from 'fs';
import path from 'path';
import { transformWithLog } from '../transformers/log-decorator-transformer.js';

interface EsbuildPlugin {
  name: string;
  setup(build: {
    onLoad(
      options: { filter: RegExp },
      callback: (args: { path: string }) => Promise<{ contents: string; loader: string } | undefined>
    ): void;
  }): void;
}

export function logDecoratorPlugin(): EsbuildPlugin {
  return {
    name: 'log-decorator-transform',
    setup(build) {
      build.onLoad({ filter: /\.(ts|tsx)$/ }, async (args) => {
        // 跳过 node_modules
        if (args.path.includes('node_modules')) return undefined;

        const source = await fs.readFile(args.path, 'utf-8');

        // 快速检查：只处理包含 @Log 的文件
        if (!source.includes('@Log')) return undefined;

        try {
          const transformed = transformWithLog(source, args.path);
          return {
            contents: transformed,
            loader: path.extname(args.path).slice(1) as 'ts' | 'tsx',
          };
        } catch (e) {
          console.warn(`[log-plugin] Transform failed for ${args.path}:`, e);
          return undefined; // 降级：返回原始内容
        }
      });
    },
  };
}
```

**在 `tsup.config.ts` 中使用：**

```typescript
import { defineConfig } from 'tsup';
import { decoratorGenericPlugin } from '@ai-partner-x/aiko-boot-codegen';
import { logDecoratorPlugin } from './plugins/log-esbuild-plugin.js';

export default defineConfig({
  entry: ['src/index.ts'],
  esbuildPlugins: [
    decoratorGenericPlugin(),  // 内置插件
    logDecoratorPlugin(),       // 自定义插件
  ],
});
```

---

## 最佳实践

### 1. 插件命名

使用带有语义的名称，建议以 `-plugin` 结尾：

```typescript
name: 'auto-validation-plugin'  // ✅
name: 'plugin1'                  // ❌
```

### 2. 保持不可变性

永远不要修改传入的对象，始终返回新对象：

```typescript
// ✅ 正确
transformDecorator(decorator, context) {
  return { ...decorator, name: 'NewName' };
}

// ❌ 错误
transformDecorator(decorator, context) {
  decorator.name = 'NewName'; // 修改原始对象！
  return decorator;
}
```

### 3. 条件判断

通过 `context.classType` 限制插件只处理目标类型，避免副作用：

```typescript
transformClass(cls, context) {
  if (context.classType !== 'entity') return cls; // 快速返回
  // ...处理逻辑
}
```

### 4. 错误处理

插件内部要有防御性错误处理，避免一个插件错误导致整个生成失败：

```typescript
transformType(tsType, context) {
  try {
    return myTransform(tsType);
  } catch (e) {
    console.warn(`[my-plugin] transformType failed for "${tsType}":`, e);
    return tsType; // 降级：返回原始类型
  }
}
```

### 5. 调试技巧

使用 `context.options.verbose`（如果传入）或临时 `console.log` 调试：

```typescript
transformMethod(method, context) {
  console.log(`[my-plugin] Processing method: ${context.className}.${method.name}`);
  // ...
}
```

结合 CLI 的 `--dry-run --verbose` 标志进行调试：

```bash
aiko-codegen transpile ./src --out ./gen --package com.example --dry-run --verbose
```

### 6. esbuild 插件性能优化

- 始终添加**快速检查**（字符串包含判断），避免对每个文件都执行昂贵的 AST 解析
- 使用 `filter` 正则精确匹配需要处理的文件类型

```typescript
// 先做快速字符串检查
if (!source.includes('@MyDecorator')) return undefined;

// 再做完整 AST 解析
const transformed = myTransform(source);
```

---

## 常见问题

**Q：如何确保多个插件按特定顺序执行？**

A：设置 `priority` 属性，数字越大越先执行。同优先级的插件按注册顺序执行。

**Q：如何在插件中访问当前文件的其他类？**

A：通过 `context.allClasses` 获取当前文件中所有已解析的类。

```typescript
transformClass(cls, context) {
  const relatedClasses = context.allClasses.filter(c => c.name !== cls.name);
  // 使用 relatedClasses...
  return cls;
}
```

**Q：如何在 `postProcess` 中添加 Java import 而不产生重复？**

A：检查代码中是否已包含该 import：

```typescript
postProcess(javaCode, context) {
  const importLine = 'import java.math.BigDecimal;';
  if (javaCode.includes(importLine)) return javaCode;
  return importLine + '\n' + javaCode;
}
```

**Q：如何处理嵌套泛型类型，如 `List<Map<String, Integer>>`？**

A：在 `transformType` 中递归处理，或使用正则提取泛型参数：

```typescript
transformType(tsType, context) {
  // 处理 Map<K, V> 类型
  const mapMatch = tsType.match(/^Map<(.+),\s*(.+)>$/);
  if (mapMatch) {
    const keyType = /* 递归处理 */ mapMatch[1];
    const valType = /* 递归处理 */ mapMatch[2];
    return `Map<${keyType}, ${valType}>`;
  }
  return tsType;
}
```

**Q：esbuild 插件中 Transform 抛出异常怎么办？**

A：始终捕获异常并返回 `undefined`（让 esbuild 使用原始文件内容）：

```typescript
try {
  const transformed = myTransform(source, args.path);
  return { contents: transformed, loader: 'ts' };
} catch (e) {
  console.warn(`[my-plugin] Skipping ${args.path}:`, e);
  return undefined; // esbuild 会使用原始内容
}
```

---

## 更多资源

- [API.md](./API.md) — 完整 API 类型参考
- [README.md](./README.md) — 使用手册
- GitHub Issues: https://github.com/ai-partner-x/ai-first-framework/issues
