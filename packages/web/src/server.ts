/**
 * Server Bootstrap - Spring Boot style auto-configuration
 *
 * Provides a `createServer()` factory that scans a source directory
 * for @Controller/@RestController classes and wires everything together,
 * analogous to `createKyselyDatabase()` in packages/orm.
 *
 * @example
 * ```typescript
 * import { createServer } from '@ai-first/web';
 *
 * const app = await createServer({
 *   srcDir: import.meta.dirname,
 *   prefix: '/api',
 * });
 * app.listen(3000, () => console.log('Server running on port 3000'));
 * ```
 */

import 'reflect-metadata';
import express, { type Express } from 'express';
import { readdirSync, statSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { pathToFileURL } from 'url';
import { Injectable, Singleton } from '@ai-first/di/server';
import { DispatcherRouter } from './router.js';
import { ExpressAdapter } from './adapters/index.js';
import { getControllerMetadata } from './decorators.js';

export interface ServerOptions {
  /**
   * Source directory to scan.
   * Auto-discovers mapper/, service/, controller/ sub-directories.
   */
  srcDir: string;
  /** API path prefix, default "/api" */
  prefix?: string;
  /** Enable CORS, default true */
  cors?: boolean;
  /** Print verbose logs, default true */
  verbose?: boolean;
}

/**
 * Create an Express application with all @Controller classes auto-registered.
 *
 * Scan order (ensures dependency order):
 * 1. mapper/     - data-access layer (optional, only relevant when using @ai-first/orm)
 * 2. service/    - business-logic layer
 * 3. controller/ - presentation layer
 */
export async function createServer(options: ServerOptions): Promise<Express> {
  const { srcDir, prefix = '/api', cors: enableCors = true, verbose = true } = options;

  if (verbose) {
    console.log('\n🚀 [AI-First Web] Starting server...');
    console.log(`📁 Source directory: ${srcDir}`);
  }

  const scanDirs = ['mapper', 'service', 'controller'];
  const controllers: (new (...args: any[]) => any)[] = [];

  for (const dir of scanDirs) {
    const dirPath = join(srcDir, dir);
    if (!existsSync(dirPath)) continue;

    const modules = await scanAndImport(dirPath, verbose);

    for (const mod of modules) {
      for (const exported of Object.values(mod)) {
        if (typeof exported === 'function' && (exported as any).prototype) {
          try {
            Injectable()(exported as any);
            Singleton()(exported as any);
          } catch {
            // already registered
          }

          if (dir === 'controller' && getControllerMetadata(exported)) {
            controllers.push(exported as new (...args: any[]) => any);
          }
        }
      }
    }
  }

  const app = express();

  if (enableCors) {
    const corsModule = await import('cors');
    app.use(corsModule.default());
  }
  app.use(express.json());

  if (controllers.length > 0) {
    const dispatcher = new DispatcherRouter(new ExpressAdapter(), { prefix, verbose });
    dispatcher.registerControllers(controllers);
    app.use(dispatcher.getNativeRouter() as ReturnType<typeof import('express').Router>);
  } else {
    console.warn('[AI-First Web] No controllers found!');
  }

  if (verbose) {
    console.log('\n✅ [AI-First Web] Server ready!');
  }

  return app;
}

// ==================== Private Helpers ====================

async function scanAndImport(dirPath: string, verbose: boolean): Promise<any[]> {
  const modules: any[] = [];

  for (const file of readdirSync(dirPath)) {
    const filePath = join(dirPath, file);
    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      modules.push(...await scanAndImport(filePath, verbose));
    } else if (isModuleFile(file)) {
      try {
        const fileUrl = pathToFileURL(filePath).href;
        const mod = await import(fileUrl);
        modules.push(mod);
        if (verbose) console.log(`📦 [AI-First Web] Loaded: ${file}`);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`❌ [AI-First Web] Failed to load ${file}: ${message}`);
      }
    }
  }

  return modules;
}

function isModuleFile(filename: string): boolean {
  const ext = extname(filename);
  if (ext === '.js' || ext === '.mjs') {
    return !filename.endsWith('.d.js') && !filename.endsWith('.test.js');
  }
  if (ext === '.ts') {
    return (
      !filename.endsWith('.d.ts') &&
      !filename.endsWith('.test.ts') &&
      !filename.endsWith('.spec.ts') &&
      filename !== 'index.ts'
    );
  }
  return false;
}
