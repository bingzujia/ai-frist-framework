/**
 * DispatcherRouter - Spring DispatcherServlet equivalent
 *
 * Abstract routing layer that maps HTTP requests to @Controller methods.
 * Concrete HTTP-framework adapters implement IHttpAdapter to bridge the gap,
 * following the same adapter pattern used by packages/orm's IMapperAdapter.
 */

import { Container, injectAutowiredProperties } from '@ai-first/di/server';
import {
  getControllerMetadata,
  getRequestMappings,
  getPathVariables,
  getRequestBody,
  getRequestParams,
  getResponseStatus,
} from './decorators.js';

// ==================== Types ====================

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

// ==================== Adapter Interface ====================

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
 * dispatcher.registerController(UserController);
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
  registerController(
    ControllerClass: new (...args: any[]) => any,
    instance?: object,
  ): void {
    const controllerMeta = getControllerMetadata(ControllerClass);
    if (!controllerMeta) {
      console.warn(`[DispatcherRouter] No @Controller metadata on ${ControllerClass.name}`);
      return;
    }

    const resolvedInstance = instance ?? this.resolveController(ControllerClass);
    const basePath = controllerMeta.path ?? '';
    const mappings = getRequestMappings(ControllerClass);

    for (const [methodName, mapping] of Object.entries(mappings)) {
      const httpMethod = (mapping.method ?? 'GET').toUpperCase();
      const fullPath = this.prefix + basePath + (mapping.path ?? '');

      if (this.verbose) {
        console.log(`[DispatcherRouter] ${httpMethod.padEnd(7)} ${fullPath}`);
      }

      const handler: RouteHandler = async (req, res, _next) => {
        const start = Date.now();
        try {
          const controllerMethod = (resolvedInstance as any)[methodName];
          const pathVars = getPathVariables(ControllerClass.prototype, methodName);
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
            console.log(`[DispatcherRouter] ← ${httpMethod} ${fullPath} ${statusCode} (${Date.now() - start}ms)`);
          }

          res.status(statusCode).json({ success: true, data: result });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          if (this.verbose) {
            console.error(`[DispatcherRouter] ← ${httpMethod} ${fullPath} 500 (${Date.now() - start}ms) ${message}`);
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
  registerControllers(
    controllers: (new (...args: any[]) => any)[] | Record<string, any>,
  ): void {
    const controllerClasses = Array.isArray(controllers)
      ? controllers
      : Object.values(controllers).filter(
          (v): v is new (...args: any[]) => any =>
            typeof v === 'function' && !!v.prototype,
        );

    for (const ControllerClass of controllerClasses) {
      this.registerController(ControllerClass);
    }
  }

  /**
   * Return the underlying framework's native router/app so it can be mounted.
   */
  getNativeRouter(): unknown {
    return this.adapter.getNativeRouter();
  }

  // ==================== Private ====================

  private resolveController(ControllerClass: new (...args: any[]) => any): any {
    try {
      const instance = Container.resolve(ControllerClass);
      injectAutowiredProperties(instance);
      return instance;
    } catch {
      // Fallback: direct instantiation (no-DI scenarios or unit tests)
      return new ControllerClass();
    }
  }
}
