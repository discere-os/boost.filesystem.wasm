/**
 * XHR-backed Virtual Filesystem for Boost.Filesystem WASM
 * Copyright (c) 2025 Superstruct Ltd, New Zealand
 * Licensed under BSL-1.0
 *
 * Implementation of Emscripten's synchronous virtual XHR-backed filesystem
 * for remote file access with byte serving support
 */

import { FilesystemError } from './types.ts';

export interface XHRFilesystemOptions {
  /**
   * Base URL for remote files
   */
  baseUrl: string;

  /**
   * Enable byte range requests (requires server support)
   * @default true
   */
  enableByteServing?: boolean;

  /**
   * Cache size in MB
   * @default 64
   */
  cacheSize?: number;

  /**
   * CORS configuration
   */
  cors?: {
    credentials?: RequestCredentials;
    headers?: Record<string, string>;
  };

  /**
   * Custom file mappings (virtual path -> remote URL)
   */
  fileMappings?: Record<string, string>;
}

interface CachedFile {
  url: string;
  data: ArrayBuffer;
  lastAccessed: number;
  size: number;
}

/**
 * XHR-backed virtual filesystem implementation
 * Only works in Web Workers due to synchronous XHR requirements
 */
export class XHRFilesystem {
  private options: Required<Omit<XHRFilesystemOptions, 'cors' | 'fileMappings'>> &
    Pick<XHRFilesystemOptions, 'cors' | 'fileMappings'>;
  private fileCache = new Map<string, CachedFile>();
  private totalCacheSize = 0;
  private initialized = false;

  constructor(options: XHRFilesystemOptions) {
    this.options = {
      enableByteServing: options.enableByteServing ?? true,
      cacheSize: options.cacheSize ?? 64,
      ...options
    };
  }

  /**
   * Initialize XHR filesystem
   * Must be called from Web Worker context
   */
  initialize(): void {
    if (this.initialized) return;

    // Check if we're in a Web Worker
    if (typeof globalThis.importScripts === 'undefined') {
      throw new FilesystemError(
        'XHR-backed filesystem requires Web Worker context for synchronous operations',
        'initialize'
      );
    }

    this.setupEmscriptenIntegration();
    this.initialized = true;
  }

  /**
   * Setup Emscripten filesystem integration
   */
  private setupEmscriptenIntegration(): void {
    // Create virtual filesystem entries using FS.createLazyFile
    // This integrates with Emscripten's FS API
    if (typeof globalThis.FS === 'undefined') {
      throw new FilesystemError('Emscripten FS not available', 'setupEmscriptenIntegration');
    }

    // Setup lazy file loading for mapped files
    if (this.options.fileMappings) {
      for (const [virtualPath, remoteUrl] of Object.entries(this.options.fileMappings)) {
        this.createLazyFile(virtualPath, remoteUrl);
      }
    }
  }

  /**
   * Create a lazy-loaded file in the virtual filesystem
   */
  createLazyFile(virtualPath: string, remoteUrl: string): void {
    const pathParts = virtualPath.split('/');
    const filename = pathParts.pop()!;
    const directory = pathParts.join('/') || '/';

    // Ensure directory exists
    try {
      globalThis.FS.mkdir(directory);
    } catch {
      // Directory might already exist
    }

    // Create lazy file with XHR backend
    globalThis.FS.createLazyFile(
      directory,
      filename,
      remoteUrl,
      true,  // canRead
      false, // canWrite
      // Custom URL function for our XHR implementation
      () => this.createXHRFunction(remoteUrl)
    );
  }

  /**
   * Create XHR function for Emscripten lazy file loading
   */
  private createXHRFunction(url: string) {
    return {
      get: (offset: number, length: number): ArrayBuffer => {
        return this.fetchFileRange(url, offset, length);
      },
      getSize: (): number => {
        return this.getFileSize(url);
      }
    };
  }

  /**
   * Fetch file range with byte serving
   */
  fetchFileRange(url: string, offset: number, length: number): ArrayBuffer {
    // Check cache first
    const cacheKey = `${url}:${offset}:${length}`;
    const cached = this.fileCache.get(cacheKey);
    if (cached) {
      cached.lastAccessed = Date.now();
      return cached.data;
    }

    // Perform synchronous XHR (only works in Web Worker)
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, false); // false = synchronous

    // Add CORS headers if configured
    if (this.options.cors?.headers) {
      for (const [key, value] of Object.entries(this.options.cors.headers)) {
        xhr.setRequestHeader(key, value);
      }
    }

    // Add Range header for byte serving
    if (this.options.enableByteServing && (offset > 0 || length > 0)) {
      const rangeEnd = length > 0 ? offset + length - 1 : '';
      xhr.setRequestHeader('Range', `bytes=${offset}-${rangeEnd}`);
    }

    // Set response type for binary data
    xhr.responseType = 'arraybuffer';

    try {
      xhr.send();

      if (xhr.status === 200 || xhr.status === 206) { // 206 = Partial Content
        const data = xhr.response as ArrayBuffer;

        // Cache the result
        this.addToCache(cacheKey, {
          url,
          data,
          lastAccessed: Date.now(),
          size: data.byteLength
        });

        return data;
      } else {
        throw new FilesystemError(
          `HTTP ${xhr.status}: ${xhr.statusText}`,
          'fetchFileRange',
          url
        );
      }
    } catch (error) {
      throw new FilesystemError(
        `XHR request failed: ${error}`,
        'fetchFileRange',
        url
      );
    }
  }

  /**
   * Get remote file size using HEAD request
   */
  getFileSize(url: string): number {
    const cacheKey = `size:${url}`;
    const cached = this.fileCache.get(cacheKey);
    if (cached) {
      return cached.size;
    }

    // Perform synchronous HEAD request
    const xhr = new XMLHttpRequest();
    xhr.open('HEAD', url, false);

    if (this.options.cors?.headers) {
      for (const [key, value] of Object.entries(this.options.cors.headers)) {
        xhr.setRequestHeader(key, value);
      }
    }

    try {
      xhr.send();

      if (xhr.status === 200) {
        const contentLength = parseInt(xhr.getResponseHeader('Content-Length') || '0', 10);

        // Cache the size info
        this.addToCache(cacheKey, {
          url,
          data: new ArrayBuffer(0),
          lastAccessed: Date.now(),
          size: contentLength
        });

        return contentLength;
      } else {
        throw new FilesystemError(
          `HTTP ${xhr.status}: ${xhr.statusText}`,
          'getFileSize',
          url
        );
      }
    } catch (error) {
      throw new FilesystemError(
        `HEAD request failed: ${error}`,
        'getFileSize',
        url
      );
    }
  }

  /**
   * Add file data to cache with LRU eviction
   */
  private addToCache(key: string, file: CachedFile): void {
    // Check if adding this file would exceed cache size
    const maxCacheBytes = this.options.cacheSize * 1024 * 1024;

    // Evict old entries if necessary
    while (this.totalCacheSize + file.size > maxCacheBytes && this.fileCache.size > 0) {
      this.evictOldestCacheEntry();
    }

    // Add to cache
    this.fileCache.set(key, file);
    this.totalCacheSize += file.size;
  }

  /**
   * Evict the least recently used cache entry
   */
  private evictOldestCacheEntry(): void {
    let oldestKey = '';
    let oldestTime = Date.now();

    for (const [key, file] of this.fileCache.entries()) {
      if (file.lastAccessed < oldestTime) {
        oldestTime = file.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const evicted = this.fileCache.get(oldestKey)!;
      this.fileCache.delete(oldestKey);
      this.totalCacheSize -= evicted.size;
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.fileCache.clear();
    this.totalCacheSize = 0;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      entries: this.fileCache.size,
      totalSize: this.totalCacheSize,
      maxSize: this.options.cacheSize * 1024 * 1024,
      hitRate: 0 // Would need hit/miss tracking for accurate rate
    };
  }

  /**
   * Setup Web Worker communication for main thread
   */
  static setupWorkerCommunication(): void {
    if (typeof globalThis.importScripts !== 'undefined') {
      // We're in a Web Worker - setup message handling
      globalThis.onmessage = (event) => {
        const { type, id, ...params } = event.data;

        try {
          switch (type) {
            case 'xhr-fs-init':
              // Initialize XHR filesystem in worker
              break;
            case 'xhr-fs-fetch':
              // Fetch file data
              break;
            default:
              console.warn('Unknown XHR filesystem message type:', type);
          }
        } catch (error) {
          globalThis.postMessage({
            type: 'error',
            id,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      };
    }
  }

  /**
   * Create a Web Worker for XHR filesystem operations
   */
  static async createXHRWorker(): Promise<Worker> {
    // Create worker with XHR filesystem implementation
    const workerScript = `
      ${XHRFilesystem.toString()}
      ${XHRFilesystem.setupWorkerCommunication.toString()}
      XHRFilesystem.setupWorkerCommunication();
    `;

    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);

    return new Worker(workerUrl);
  }

  /**
   * Check if byte serving is supported by server
   */
  static async checkByteServingSupport(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: { 'Range': 'bytes=0-0' }
      });

      return response.status === 206 && // Partial Content
             response.headers.get('Accept-Ranges') === 'bytes';
    } catch {
      return false;
    }
  }
}

/**
 * Web Worker script template for XHR filesystem
 */
export const XHR_WORKER_SCRIPT = `
// XHR Filesystem Web Worker
importScripts('https://wasm.discere.cloud/boost.filesystem/latest/main/boost-filesystem-main.js');

let xhrFs = null;

self.onmessage = function(e) {
  const { type, id, ...params } = e.data;

  try {
    switch (type) {
      case 'init':
        xhrFs = new XHRFilesystem(params.options);
        xhrFs.initialize();
        break;

      case 'createLazyFile':
        if (xhrFs) {
          xhrFs.createLazyFile(params.virtualPath, params.remoteUrl);
        }
        break;

      case 'fetchRange':
        if (xhrFs) {
          const data = xhrFs.fetchFileRange(params.url, params.offset, params.length);
          self.postMessage({ type: 'success', id, data }, [data]);
          return;
        }
        break;

      default:
        throw new Error('Unknown command: ' + type);
    }

    self.postMessage({ type: 'success', id });
  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      error: error.message || String(error)
    });
  }
};
`;