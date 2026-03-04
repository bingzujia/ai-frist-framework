/**
 * ExpressAdapter - Express.js adapter for DispatcherRouter
 *
 * Implements IHttpAdapter on top of Express Router, enabling DispatcherRouter
 * to register @Controller routes against an Express application.
 * Analogous to KyselyAdapter in packages/orm.
 */

import { Router, type IRouter } from 'express';
import type { IHttpAdapter, RouteHandler, HttpRequest, HttpResponse } from '../router.js';

type ExpressReq = {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
};
type ExpressRes = {
  status(code: number): ExpressRes;
  json(data: unknown): void;
  send(body: string): void;
  setHeader(name: string, value: string): void;
};
type ExpressNext = (err?: unknown) => void;

export interface ExpressAdapterOptions {
  /** Re-use an existing Express Router instead of creating a new one */
  router?: IRouter;
}

/**
 * ExpressAdapter - bridges DispatcherRouter to Express Router.
 *
 * @example
 * import express from 'express';
 * import { DispatcherRouter } from '@ai-first/web';
 * import { ExpressAdapter } from '@ai-first/web/express';
 *
 * const app = express();
 * app.use(express.json());
 *
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

    this.router[expressMethod](
      // Convert Spring-style :param to Express-style :param (they share the same syntax)
      fullPath,
      (req: ExpressReq, res: ExpressRes, next: ExpressNext) => {
        const httpReq: HttpRequest = {
          method: req.method,
          path: req.path,
          params: req.params,
          query: req.query as Record<string, string>,
          body: req.body,
          headers: req.headers,
        };
        const httpRes: HttpResponse = {
          status: (code: number) => {
            res.status(code);
            return httpRes;
          },
          json: (data: unknown) => res.json(data),
          send: (body: string) => res.send(body),
          setHeader: (name: string, value: string) => res.setHeader(name, value),
        };
        return handler(httpReq, httpRes, next);
      },
    );
  }

  getNativeRouter(): IRouter {
    return this.router;
  }
}
