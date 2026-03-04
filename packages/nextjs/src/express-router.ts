/**
 * Express Router - 将 @RestController/@Controller 装饰器自动注册为 Express 路由
 *
 * @example
 * ```typescript
 * // 方式1: 自动扫描 + DI 注入（推荐）
 * import express from 'express';
 * import { createExpressRouter } from '@ai-first/nextjs';
 * import * as controllers from './controller/index.js';
 *
 * const app = express();
 * app.use(express.json());
 * app.use(createExpressRouter(controllers));
 *
 * // 方式2: DispatcherRouter + 适配器模式（与 packages/orm 的 BaseMapper 模式对应）
 * import { DispatcherRouter } from '@ai-first/nextjs';
 * const dispatcher = new DispatcherRouter(new ExpressAdapter(), { prefix: '/api' });
 * dispatcher.registerControllers(controllers);
 * app.use(dispatcher.getNativeRouter());
 * ```
 */
import {
  getControllerMetadata,
  getRequestMappings,
  getPathVariables,
  getRequestBody,
  getRequestParams,
  getResponseStatus,
} from './decorators.js';
import { Router, IRouter } from 'express';
import { Container, injectAutowiredProperties } from '@ai-first/di/server';

// ==================== Framework-agnostic HTTP types ====================

/** Parsed HTTP request (framework-agnostic) */
export interface HttpRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
}

/** HTTP response writer (framework-agnostic) */
export interface HttpResponse {
  status(code: number): HttpResponse;
  json(data: unknown): void;
  send(body: string): void;
  setHeader(name: string, value: string): void;
}

/** Next/error function */
export type NextFunction = (err?: unknown) => void;

/** A single route handler in the adapter's native form */
export type RouteHandler = (req: HttpRequest, res: HttpResponse, next: NextFunction) => void;

// ==================== IHttpAdapter ====================

/**
 * IHttpAdapter - the bridge between DispatcherRouter and a concrete HTTP framework.
 *
 * Like IMapperAdapter in packages/orm, this interface separates the
 * Spring-style routing abstraction from the underlying framework (Express,
 * Fastify, Hono, …).
 */
export interface IHttpAdapter {
  /** Register a route */
  register(method: string, fullPath: string, handler: RouteHandler): void;
  /** Return the underlying framework's native router/app instance */
  getNativeRouter(): unknown;
}

// ==================== ExpressAdapter ====================

export interface ExpressAdapterOptions {
  /** Re-use an existing Express Router instead of creating a new one */
  router?: IRouter;
}

/**
 * ExpressAdapter - bridges DispatcherRouter to Express Router.
 *
 * @example
 * const dispatcher = new DispatcherRouter(new ExpressAdapter(), { prefix: '/api' });
 * dispatcher.registerControllers(controllers);
 * app.use(dispatcher.getNativeRouter() as IRouter);
 */
export class ExpressAdapter implements IHttpAdapter {
  private router: IRouter;

  constructor(options: ExpressAdapterOptions = {}) {
    this.router = options.router ?? Router();
  }

  register(method: string, fullPath: string, handler: RouteHandler): void {
    const expressMethod = method.toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options';
    this.router[expressMethod](fullPath, (req: any, res: any, next: any) => {
      const httpReq: HttpRequest = {
        method: req.method,
        path: req.path,
        params: req.params,
        query: req.query as Record<string, string>,
        body: req.body,
        headers: req.headers,
      };
      const httpRes: HttpResponse = {
        status: (code: number) => { res.status(code); return httpRes; },
        json: (data: unknown) => res.json(data),
        send: (body: string) => res.send(body),
        setHeader: (name: string, value: string) => res.setHeader(name, value),
      };
      return handler(httpReq, httpRes, next);
    });
  }

  getNativeRouter(): IRouter {
    return this.router;
  }
}

// ==================== DispatcherRouter ====================

export interface DispatcherRouterOptions {
  /** Global API path prefix, e.g. "/api" */
  prefix?: string;
  /** Print route registration logs */
  verbose?: boolean;
}

/**
 * DispatcherRouter - wraps an IHttpAdapter and maps @Controller/@RestController
 * classes to routes, analogous to BaseMapper wrapping IMapperAdapter in packages/orm.
 *
 * @example
 * const dispatcher = new DispatcherRouter(new ExpressAdapter(), { prefix: '/api' });
 * dispatcher.registerControllers(controllers);
 * app.use(dispatcher.getNativeRouter());
 */
export class DispatcherRouter {
  private adapter: IHttpAdapter;
  private prefix: string;
  private verbose: boolean;

  constructor(adapter: IHttpAdapter, options: DispatcherRouterOptions = {}) {
    this.adapter = adapter;
    this.prefix = options.prefix ?? '/api';
    this.verbose = options.verbose ?? true;
  }

  /**
   * Register a single controller class and all its mapped methods.
   *
   * @param ControllerClass - A class decorated with @Controller or @RestController
   * @param instance - Optional pre-built instance; resolved via DI when omitted
   */
  registerController(ControllerClass: new (...args: any[]) => any, instance?: object): void {
    const controllerMeta = getControllerMetadata(ControllerClass);
    if (!controllerMeta) {
      console.warn(`[AI-First] No @Controller metadata on ${ControllerClass.name}`);
      return;
    }

    const resolvedInstance = instance ?? resolveController(ControllerClass);
    const basePath = controllerMeta.path ?? '';
    const mappings = getRequestMappings(ControllerClass);

    for (const [methodName, mapping] of Object.entries(mappings)) {
      const httpMethod = (mapping.method ?? 'GET').toUpperCase();
      const fullPath = this.prefix + basePath + (mapping.path ?? '');

      if (this.verbose) {
        console.log(`[AI-First] ${httpMethod.padEnd(7)} ${fullPath}`);
      }

      const handler: RouteHandler = async (req, res, _next) => {
        const start = Date.now();
        try {
          const controllerMethod = (resolvedInstance as any)[methodName];
          const pathVars   = getPathVariables(ControllerClass.prototype, methodName);
          const bodyParams = getRequestBody(ControllerClass.prototype, methodName);
          const queryParams = getRequestParams(ControllerClass.prototype, methodName);
          const statusCode = getResponseStatus(ControllerClass.prototype, methodName) ?? 200;

          const paramCount = controllerMethod.length;
          const args: unknown[] = new Array(paramCount);

          for (const [idx, varName] of Object.entries(pathVars)) {
            args[Number(idx)] = req.params[varName];
          }

          for (const idx of Object.keys(bodyParams)) {
            args[Number(idx)] = req.body;
          }

          for (const [idx, param] of Object.entries(queryParams)) {
            const p = param as { name: string; required: boolean; defaultValue?: string };
            const value = req.query[p.name] ?? p.defaultValue;
            if (value === undefined && p.required) {
              res.status(400).json({ success: false, error: `Required parameter '${p.name}' is missing` });
              return;
            }
            args[Number(idx)] = value;
          }

          const result = await controllerMethod.apply(resolvedInstance, args);

          if (this.verbose) {
            console.log(`[AI-First] ← ${httpMethod} ${fullPath} ${statusCode} (${Date.now() - start}ms)`);
          }

          res.status(statusCode).json({ success: true, data: result });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          if (this.verbose) {
            console.error(`[AI-First] ← ${httpMethod} ${fullPath} 500 (${Date.now() - start}ms) ${message}`);
          }
          res.status(500).json({ success: false, error: message });
        }
      };

      this.adapter.register(httpMethod, fullPath, handler);
    }
  }

  /**
   * Register multiple controller classes at once.
   */
  registerControllers(controllers: (new (...args: any[]) => any)[] | Record<string, any>): void {
    const classes = Array.isArray(controllers)
      ? controllers
      : Object.values(controllers).filter(
          (v): v is new (...args: any[]) => any => typeof v === 'function' && !!v.prototype,
        );

    for (const ControllerClass of classes) {
      this.registerController(ControllerClass);
    }
  }

  /**
   * Return the underlying framework's native router/app so it can be mounted.
   */
  getNativeRouter(): unknown {
    return this.adapter.getNativeRouter();
  }
}

// ==================== Legacy createExpressRouter (kept for backwards compatibility) ====================

export interface ExpressRouterOptions {
  /**
   * Controller 实例列表（仅在不使用 DI 时需要）
   * 不传此参数时，框架会通过 DI Container 自动解析 Controller 及其依赖
   */
  instances?: (new (...args: any[]) => any)[];
  /** API 路径前缀，默认 "/api" */
  prefix?: string;
  /** 是否打印路由注册日志，默认 true */
  verbose?: boolean;
}

/**
 * 创建 Express Router，自动注册所有 @Controller/@RestController 路由
 * 
 * @param controllers - Controller 类数组，或模块导出对象 (import * as controllers)
 */
export function createExpressRouter(
  controllers: (new (...args: any[]) => any)[] | Record<string, any>,
  options: ExpressRouterOptions = {}
): IRouter {
  const { prefix = '/api', verbose = true, instances = [] } = options;

  const adapter = new ExpressAdapter();
  const dispatcher = new DispatcherRouter(adapter, { prefix, verbose });

  // 支持数组和模块导出两种形式
  const controllerClasses = Array.isArray(controllers)
    ? controllers
    : Object.values(controllers).filter(
        (exported): exported is new (...args: any[]) => any =>
          typeof exported === 'function' && exported.prototype
      );

  controllerClasses.forEach((ControllerClass, i) => {
    dispatcher.registerController(ControllerClass, instances[i]);
  });

  return adapter.getNativeRouter();
}

// ==================== Private helpers ====================

function resolveController(ControllerClass: new (...args: any[]) => any): any {
  try {
    const instance = Container.resolve(ControllerClass);
    injectAutowiredProperties(instance);
    return instance;
  } catch (e: any) {
    console.warn(`[AI-First] DI resolve failed for ${ControllerClass.name}: ${e.message}`);
    const instance = new ControllerClass();
    injectAutowiredProperties(instance);
    return instance;
  }
}
