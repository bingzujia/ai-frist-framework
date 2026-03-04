/**
 * @ai-first/nextjs
 * Spring Web MVC style HTTP decorators and Express router
 */

// Export decorators
export {
  Controller,
  RestController,
  GetMapping,
  PostMapping,
  PutMapping,
  DeleteMapping,
  PatchMapping,
  RequestMapping,
  PathVariable,
  RequestParam,
  QueryParam,
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
  RESPONSE_BODY_METADATA,
  RESPONSE_STATUS_METADATA,
  type RestControllerOptions,
  type RequestMappingOptions,
  type RequestParamOptions,
  type HttpMethod,
} from './decorators.js';

// Export Express router, adapter types, and DispatcherRouter
export {
  createExpressRouter,
  DispatcherRouter,
  ExpressAdapter,
  type IHttpAdapter,
  type HttpRequest,
  type HttpResponse,
  type RouteHandler,
  type NextFunction,
  type ExpressRouterOptions,
  type ExpressAdapterOptions,
  type DispatcherRouterOptions,
} from './express-router.js';

// Export Bootstrap (Spring Boot style auto-configuration)
export { createApp, type AppOptions, type DatabaseConnectionConfig } from './bootstrap.js';

// Export Feign-style API client (with reflect-metadata)
export {
  ApiContract,
  createApiClient,
  type ApiClientOptions,
} from './client.js';

// Export lite API client (no reflect-metadata, SSR safe)
export {
  createApiClientFromMeta,
  type ApiMetadata,
} from './client-lite.js';
