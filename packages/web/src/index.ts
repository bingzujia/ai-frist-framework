/**
 * @ai-first/web
 *
 * Spring Web MVC style HTTP decorators and Express router adapter.
 * Structured analogously to @ai-first/orm (MyBatis-Plus over Kysely),
 * but for the web layer: Spring Web MVC over Express.
 */

// Decorators
export {
  Controller,
  RestController,
  RequestMapping,
  GetMapping,
  PostMapping,
  PutMapping,
  DeleteMapping,
  PatchMapping,
  PathVariable,
  RequestParam,
  RequestBody,
  ResponseBody,
  ResponseStatus,
  getControllerMetadata,
  getRequestMappings,
  getPathVariables,
  getRequestParams,
  getRequestBody,
  getResponseStatus,
  CONTROLLER_METADATA,
  REQUEST_MAPPING_METADATA,
  type ControllerOptions,
  type RequestMappingOptions,
  type RequestParamOptions,
  type HttpMethod,
} from './decorators.js';

// DispatcherRouter + adapter interface
export {
  DispatcherRouter,
  type IHttpAdapter,
  type HttpRequest,
  type HttpResponse,
  type RouteHandler,
  type NextFunction,
  type DispatcherRouterOptions,
} from './router.js';

// Adapters
export { ExpressAdapter, type ExpressAdapterOptions } from './adapters/index.js';

// Server bootstrap
export { createServer, type ServerOptions } from './server.js';
