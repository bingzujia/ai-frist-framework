/**
 * Spring Web MVC Style Decorators
 *
 * Provides a TypeScript decorator API aligned with Spring Web MVC:
 *   @Controller / @RestController  →  class-level route prefix + DI registration
 *   @RequestMapping / @GetMapping …  →  method-level route + HTTP verb
 *   @PathVariable / @RequestParam / @RequestBody  →  parameter extraction
 *   @ResponseBody / @ResponseStatus  →  response configuration
 */

import 'reflect-metadata';
import { Injectable, Singleton, inject, injectAutowiredProperties } from '@ai-first/di/server';

// ==================== Metadata Keys ====================

export const CONTROLLER_METADATA = Symbol('controller');
export const REQUEST_MAPPING_METADATA = Symbol('requestMapping');
export const PATH_VARIABLE_METADATA = Symbol('pathVariable');
export const REQUEST_PARAM_METADATA = Symbol('requestParam');
export const REQUEST_BODY_METADATA = Symbol('requestBody');
export const RESPONSE_BODY_METADATA = Symbol('responseBody');
export const RESPONSE_STATUS_METADATA = Symbol('responseStatus');

// ==================== Types ====================

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

/** @Controller / @RestController options */
export interface ControllerOptions {
  /** Base path for all routes in this controller, e.g. "/users" */
  path?: string;
  /** Human-readable description */
  description?: string;
}

/** @RequestMapping options */
export interface RequestMappingOptions {
  /** Route path segment, e.g. "/:id" */
  path?: string;
  /** HTTP method */
  method?: HttpMethod;
  /** Description */
  description?: string;
}

/** @RequestParam options */
export interface RequestParamOptions {
  /** Query-string key name */
  name?: string;
  /** Whether the parameter is required (throws if missing) */
  required?: boolean;
  /** Default value when not provided */
  defaultValue?: string;
}

// ==================== Class Decorators ====================

/**
 * @Controller - Mark a class as a Spring MVC controller.
 * Registers the class in the DI container and records its base path.
 *
 * @example
 * @Controller({ path: '/users' })
 * export class UserController { … }
 */
export function Controller(options: ControllerOptions = {}) {
  return function <T extends { new (...args: any[]): any }>(target: T) {
    Reflect.defineMetadata(CONTROLLER_METADATA, {
      ...options,
      isRestController: false,
      className: target.name,
    }, target);

    // Auto-inject constructor dependencies
    const paramTypes = Reflect.getMetadata('design:paramtypes', target) || [];
    paramTypes.forEach((type: any, index: number) => {
      inject(type)(target, undefined as any, index);
    });

    Injectable()(target);
    Singleton()(target);

    const originalConstructor = target;
    const newConstructor = function (this: any, ...args: any[]) {
      const instance = new (originalConstructor as any)(...args);
      injectAutowiredProperties(instance);
      return instance;
    } as unknown as T;

    newConstructor.prototype = originalConstructor.prototype;
    Object.setPrototypeOf(newConstructor, originalConstructor);

    const metadataKeys = Reflect.getMetadataKeys(originalConstructor);
    metadataKeys.forEach(key => {
      const value = Reflect.getMetadata(key, originalConstructor);
      Reflect.defineMetadata(key, value, newConstructor);
    });

    return newConstructor;
  };
}

/**
 * @RestController - Combines @Controller + implicit @ResponseBody on all methods.
 * Equivalent to Spring Boot @RestController.
 *
 * @example
 * @RestController({ path: '/users' })
 * export class UserRestController { … }
 */
export function RestController(options: ControllerOptions = {}) {
  return function <T extends { new (...args: any[]): any }>(target: T) {
    Reflect.defineMetadata(CONTROLLER_METADATA, {
      ...options,
      isRestController: true,
      className: target.name,
    }, target);

    const paramTypes = Reflect.getMetadata('design:paramtypes', target) || [];
    paramTypes.forEach((type: any, index: number) => {
      inject(type)(target, undefined as any, index);
    });

    Injectable()(target);
    Singleton()(target);

    const originalConstructor = target;
    const newConstructor = function (this: any, ...args: any[]) {
      const instance = new (originalConstructor as any)(...args);
      injectAutowiredProperties(instance);
      return instance;
    } as unknown as T;

    newConstructor.prototype = originalConstructor.prototype;
    Object.setPrototypeOf(newConstructor, originalConstructor);

    const metadataKeys = Reflect.getMetadataKeys(originalConstructor);
    metadataKeys.forEach(key => {
      const value = Reflect.getMetadata(key, originalConstructor);
      Reflect.defineMetadata(key, value, newConstructor);
    });

    return newConstructor;
  };
}

// ==================== Method Decorators ====================

/**
 * @RequestMapping - Generic route mapping (like Spring @RequestMapping).
 */
export function RequestMapping(options: RequestMappingOptions) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const mappings = Reflect.getMetadata(REQUEST_MAPPING_METADATA, target.constructor) || {};
    mappings[propertyKey] = options;
    Reflect.defineMetadata(REQUEST_MAPPING_METADATA, mappings, target.constructor);
    return descriptor;
  };
}

/**
 * @GetMapping - Map GET request (like Spring @GetMapping).
 */
export function GetMapping(path: string = '', description?: string) {
  return RequestMapping({ path, method: 'GET', description });
}

/**
 * @PostMapping - Map POST request (like Spring @PostMapping).
 */
export function PostMapping(path: string = '', description?: string) {
  return RequestMapping({ path, method: 'POST', description });
}

/**
 * @PutMapping - Map PUT request (like Spring @PutMapping).
 */
export function PutMapping(path: string = '', description?: string) {
  return RequestMapping({ path, method: 'PUT', description });
}

/**
 * @DeleteMapping - Map DELETE request (like Spring @DeleteMapping).
 */
export function DeleteMapping(path: string = '', description?: string) {
  return RequestMapping({ path, method: 'DELETE', description });
}

/**
 * @PatchMapping - Map PATCH request (like Spring @PatchMapping).
 */
export function PatchMapping(path: string = '', description?: string) {
  return RequestMapping({ path, method: 'PATCH', description });
}

/**
 * @ResponseBody - Mark a method's return value as the HTTP response body.
 * Already implied on all methods of @RestController.
 */
export function ResponseBody() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    Reflect.defineMetadata(RESPONSE_BODY_METADATA, true, target, propertyKey);
    return descriptor;
  };
}

/**
 * @ResponseStatus - Set the HTTP status code for a method's response.
 *
 * @example
 * @PostMapping('/users')
 * @ResponseStatus(201)
 * async create(@RequestBody() dto: CreateUserDto) { … }
 */
export function ResponseStatus(status: number) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    Reflect.defineMetadata(RESPONSE_STATUS_METADATA, status, target, propertyKey);
    return descriptor;
  };
}

// ==================== Parameter Decorators ====================

/**
 * @PathVariable - Extract a path segment variable (like Spring @PathVariable).
 *
 * @example
 * @GetMapping('/:id')
 * async getById(@PathVariable('id') id: string) { … }
 */
export function PathVariable(name?: string) {
  return function (target: any, propertyKey: string, parameterIndex: number) {
    const pathVars = Reflect.getMetadata(PATH_VARIABLE_METADATA, target, propertyKey) || {};
    pathVars[parameterIndex] = name || 'param' + parameterIndex;
    Reflect.defineMetadata(PATH_VARIABLE_METADATA, pathVars, target, propertyKey);
  };
}

/**
 * @RequestParam - Extract a query-string parameter (like Spring @RequestParam).
 *
 * @example
 * @GetMapping('/search')
 * async search(@RequestParam('keyword') keyword: string) { … }
 */
export function RequestParam(nameOrOptions?: string | RequestParamOptions, required: boolean = false) {
  return function (target: any, propertyKey: string, parameterIndex: number) {
    const requestParams = Reflect.getMetadata(REQUEST_PARAM_METADATA, target, propertyKey) || {};
    if (typeof nameOrOptions === 'string' || nameOrOptions === undefined) {
      requestParams[parameterIndex] = {
        name: nameOrOptions || 'param' + parameterIndex,
        required,
        defaultValue: undefined,
      };
    } else {
      requestParams[parameterIndex] = {
        name: nameOrOptions.name || 'param' + parameterIndex,
        required: nameOrOptions.required ?? false,
        defaultValue: nameOrOptions.defaultValue,
      };
    }
    Reflect.defineMetadata(REQUEST_PARAM_METADATA, requestParams, target, propertyKey);
  };
}

/**
 * @RequestBody - Bind the HTTP request body to a method parameter (like Spring @RequestBody).
 *
 * @example
 * @PostMapping('/users')
 * async create(@RequestBody() dto: CreateUserDto) { … }
 */
export function RequestBody() {
  return function (target: any, propertyKey: string, parameterIndex: number) {
    const requestBody = Reflect.getMetadata(REQUEST_BODY_METADATA, target, propertyKey) || {};
    requestBody[parameterIndex] = true;
    Reflect.defineMetadata(REQUEST_BODY_METADATA, requestBody, target, propertyKey);
  };
}

// ==================== Metadata Getters ====================

export function getControllerMetadata(target: any): (ControllerOptions & { isRestController: boolean; className: string }) | undefined {
  return Reflect.getMetadata(CONTROLLER_METADATA, target);
}

export function getRequestMappings(target: any): Record<string, RequestMappingOptions> {
  return Reflect.getMetadata(REQUEST_MAPPING_METADATA, target) || {};
}

export function getPathVariables(target: any, methodName: string): Record<number, string> {
  return Reflect.getMetadata(PATH_VARIABLE_METADATA, target, methodName) || {};
}

export function getRequestParams(target: any, methodName: string): Record<number, { name: string; required: boolean; defaultValue?: string }> {
  return Reflect.getMetadata(REQUEST_PARAM_METADATA, target, methodName) || {};
}

export function getRequestBody(target: any, methodName: string): Record<number, boolean> {
  return Reflect.getMetadata(REQUEST_BODY_METADATA, target, methodName) || {};
}

export function getResponseStatus(target: any, methodName: string): number | undefined {
  return Reflect.getMetadata(RESPONSE_STATUS_METADATA, target, methodName);
}
