/**
 * WebAssembly port of Boost.Filesystem
 * Copyright (c) Boost.org contributors
 * Copyright (c) 2025 Superstruct Ltd, New Zealand
 * Licensed under BSL-1.0
 */

import {
  FilesystemOptions,
  FilesystemOperations,
  FileStatus,
  DirectoryEntry,
  PathInfo,
  FileOperationResult,
  PathResult,
  ListResult,
  StatusResult,
  VirtualFilesystemMount,
  DirectoryIteratorOptions,
  CopyOptions,
  RemoveOptions,
  FilesystemError,
  PathError,
  DirectoryError,
  FileError,
  BoostFilesystemModule
} from './types.ts';

export default class BoostFilesystem implements FilesystemOperations {
  private module: BoostFilesystemModule | null = null;
  private initialized = false;
  private options: Required<FilesystemOptions>;

  // Wrapped functions for performance
  private _exists!: (path: string) => boolean;
  private _isDirectory!: (path: string) => boolean;
  private _isRegularFile!: (path: string) => boolean;
  private _fileSize!: (path: string) => bigint;
  private _createDirectory!: (path: string) => boolean;
  private _createDirectories!: (path: string) => boolean;
  private _remove!: (path: string) => boolean;
  private _removeAll!: (path: string) => number;
  private _copyFile!: (from: string, to: string) => boolean;
  private _rename!: (oldPath: string, newPath: string) => boolean;
  private _currentPath!: () => string;
  private _absolutePath!: (path: string) => string;
  private _canonicalPath!: (path: string) => string;
  private _pathParent!: (path: string) => string;
  private _pathFilename!: (path: string) => string;
  private _pathExtension!: (path: string) => string;
  private _pathStem!: (path: string) => string;
  private _listDirectory!: (path: string) => string;

  constructor(options: FilesystemOptions = {}) {
    this.options = {
      enablePersistence: options.enablePersistence ?? true,
      maxMemoryMB: options.maxMemoryMB ?? 256,
      enableXHRFS: options.enableXHRFS ?? false,
      xhrBaseUrl: options.xhrBaseUrl ?? '',
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const moduleFactory = await this.loadModuleFactory();
      const wasmBinary = await this.loadWasmBinary();

      this.module = await moduleFactory({
        wasmBinary,
        locateFile: (path: string) => {
          if (path.endsWith('.wasm')) {
            return new URL('../../install/wasm/' + path, import.meta.url).href;
          }
          return path;
        },
        onRuntimeInitialized: () => {
          this.setupWrappedFunctions();
        }
      });

      if (this.options.enablePersistence) {
        await this.setupVirtualFilesystem();
      }

      this.initialized = true;
    } catch (error) {
      throw new FilesystemError(`Failed to initialize Boost.Filesystem: ${error}`, 'initialize');
    }
  }

  private async loadModuleFactory(): Promise<(config: any) => Promise<BoostFilesystemModule>> {
    if (typeof globalThis.Deno !== 'undefined') {
      const module = await import('../../install/wasm/boost-filesystem-main.js');
      return module.default || module.BoostFilesystemModule;
    }

    // Web/CDN runtime - try CDN locations with proper ES6 imports
    const cdnUrls = [
      'https://wasm.discere.cloud/boost.filesystem/latest/main/',
      'https://cdn.jsdelivr.net/npm/@discere-os/boost.filesystem.wasm/dist/'
    ];

    for (const url of cdnUrls) {
      try {
        const module = await import(`${url}boost-filesystem-main.js`);
        return module.default || module.BoostFilesystemModule;
      } catch {
        continue;
      }
    }

    throw new Error('Failed to load module factory from any source');
  }

  private async loadWasmBinary(): Promise<ArrayBuffer | undefined> {
    // Deno-first development environment
    if (typeof globalThis.Deno !== 'undefined') {
      try {
        const wasmPath = new URL('../../install/wasm/boost-filesystem-main.wasm', import.meta.url).pathname;
        const wasmBuffer = await Deno.readFile(wasmPath);
        return wasmBuffer.buffer;
      } catch (error) {
        console.warn('Failed to load local WASM binary:', error);
        return undefined;
      }
    }

    // Web/CDN runtime - try CDN locations
    const cdnUrls = [
      'https://wasm.discere.cloud/boost.filesystem/latest/main/',
      'https://cdn.jsdelivr.net/npm/@discere-os/boost.filesystem.wasm/dist/'
    ];

    for (const url of cdnUrls) {
      try {
        const response = await fetch(`${url}boost-filesystem-main.wasm`);
        if (response.ok) {
          return await response.arrayBuffer();
        }
      } catch {
        continue;
      }
    }

    // Fallback to undefined for embedded WASM
    return undefined;
  }

  private setupWrappedFunctions(): void {
    if (!this.module) throw new FilesystemError('Module not initialized', 'setup');

    // Create wrapped functions for C functions with proper type casting
    this._exists = this.module.cwrap('wasm_exists', 'boolean', ['string']) as (path: string) => boolean;
    this._isDirectory = this.module.cwrap('wasm_is_directory', 'boolean', ['string']) as (path: string) => boolean;
    this._isRegularFile = this.module.cwrap('wasm_is_regular_file', 'boolean', ['string']) as (path: string) => boolean;
    this._fileSize = this.module.cwrap('wasm_file_size', 'bigint', ['string']) as (path: string) => bigint;
    this._createDirectory = this.module.cwrap('wasm_create_directory', 'boolean', ['string']) as (path: string) => boolean;
    this._createDirectories = this.module.cwrap('wasm_create_directories', 'boolean', ['string']) as (path: string) => boolean;
    this._remove = this.module.cwrap('wasm_remove', 'boolean', ['string']) as (path: string) => boolean;
    this._removeAll = this.module.cwrap('wasm_remove_all', 'number', ['string']) as (path: string) => number;
    this._copyFile = this.module.cwrap('wasm_copy_file', 'boolean', ['string', 'string']) as (from: string, to: string) => boolean;
    this._rename = this.module.cwrap('wasm_rename', 'boolean', ['string', 'string']) as (oldPath: string, newPath: string) => boolean;

    // String-returning functions need special handling
    const currentPathPtr = this.module.cwrap('wasm_current_path', 'number', []);
    this._currentPath = () => {
      const ptr = currentPathPtr();
      if (!ptr) throw new PathError('Failed to get current path', '');
      const result = this.module!.UTF8ToString(ptr);
      this.module!._free(ptr);
      return result;
    };

    const absolutePathPtr = this.module.cwrap('wasm_absolute_path', 'number', ['string']);
    this._absolutePath = (path: string) => {
      const ptr = absolutePathPtr(path);
      if (!ptr) throw new PathError('Failed to get absolute path', path);
      const result = this.module!.UTF8ToString(ptr);
      this.module!._free(ptr);
      return result;
    };

    const canonicalPathPtr = this.module.cwrap('wasm_canonical_path', 'number', ['string']);
    this._canonicalPath = (path: string) => {
      const ptr = canonicalPathPtr(path);
      if (!ptr) throw new PathError('Failed to get canonical path', path);
      const result = this.module!.UTF8ToString(ptr);
      this.module!._free(ptr);
      return result;
    };

    const pathParentPtr = this.module.cwrap('wasm_path_parent', 'number', ['string']);
    this._pathParent = (path: string) => {
      const ptr = pathParentPtr(path);
      if (!ptr) return '';
      const result = this.module!.UTF8ToString(ptr);
      this.module!._free(ptr);
      return result;
    };

    const pathFilenamePtr = this.module.cwrap('wasm_path_filename', 'number', ['string']);
    this._pathFilename = (path: string) => {
      const ptr = pathFilenamePtr(path);
      if (!ptr) return '';
      const result = this.module!.UTF8ToString(ptr);
      this.module!._free(ptr);
      return result;
    };

    const pathExtensionPtr = this.module.cwrap('wasm_path_extension', 'number', ['string']);
    this._pathExtension = (path: string) => {
      const ptr = pathExtensionPtr(path);
      if (!ptr) return '';
      const result = this.module!.UTF8ToString(ptr);
      this.module!._free(ptr);
      return result;
    };

    const pathStemPtr = this.module.cwrap('wasm_path_stem', 'number', ['string']);
    this._pathStem = (path: string) => {
      const ptr = pathStemPtr(path);
      if (!ptr) return '';
      const result = this.module!.UTF8ToString(ptr);
      this.module!._free(ptr);
      return result;
    };

    const listDirectoryPtr = this.module.cwrap('wasm_list_directory', 'number', ['string']);
    this._listDirectory = (path: string) => {
      const ptr = listDirectoryPtr(path);
      if (!ptr) return '';
      const result = this.module!.UTF8ToString(ptr);
      this.module!._free(ptr);
      return result;
    };
  }

  // Public API implementation

  async exists(path: string): Promise<boolean> {
    this.ensureInitialized();
    try {
      return this._exists(path);
    } catch (error) {
      throw new PathError(`Failed to check existence of path: ${error}`, path);
    }
  }

  async isDirectory(path: string): Promise<boolean> {
    this.ensureInitialized();
    try {
      return this._isDirectory(path);
    } catch (error) {
      throw new DirectoryError(`Failed to check if path is directory: ${error}`, path);
    }
  }

  async isRegularFile(path: string): Promise<boolean> {
    this.ensureInitialized();
    try {
      return this._isRegularFile(path);
    } catch (error) {
      throw new FileError(`Failed to check if path is regular file: ${error}`, path);
    }
  }

  async fileSize(path: string): Promise<bigint> {
    this.ensureInitialized();
    try {
      const size = this._fileSize(path);
      if (size < 0n) throw new FileError('File not found or inaccessible', path);
      return size;
    } catch (error) {
      throw new FileError(`Failed to get file size: ${error}`, path);
    }
  }

  async createDirectory(path: string): Promise<boolean> {
    this.ensureInitialized();
    try {
      return this._createDirectory(path);
    } catch (error) {
      throw new DirectoryError(`Failed to create directory: ${error}`, path);
    }
  }

  async createDirectories(path: string): Promise<boolean> {
    this.ensureInitialized();
    try {
      return this._createDirectories(path);
    } catch (error) {
      throw new DirectoryError(`Failed to create directories: ${error}`, path);
    }
  }

  async listDirectory(path: string, options?: DirectoryIteratorOptions): Promise<DirectoryEntry[]> {
    this.ensureInitialized();
    try {
      const listStr = this._listDirectory(path);
      if (!listStr) return [];

      const entries: DirectoryEntry[] = [];
      const names = listStr.split('\n').filter(name => name.length > 0);

      for (const name of names) {
        if (options?.pattern) {
          if (typeof options.pattern === 'string') {
            if (!name.includes(options.pattern)) continue;
          } else {
            if (!options.pattern.test(name)) continue;
          }
        }

        const fullPath = path.endsWith('/') ? path + name : `${path}/${name}`;
        const isDir = await this.isDirectory(fullPath);
        const isFile = await this.isRegularFile(fullPath);

        if ((options?.includeDirectories !== false && isDir) ||
            (options?.includeFiles !== false && isFile)) {
          entries.push({
            name,
            isDirectory: isDir,
            isRegularFile: isFile,
            size: isFile ? await this.fileSize(fullPath) : undefined
          });
        }
      }

      return entries;
    } catch (error) {
      throw new DirectoryError(`Failed to list directory: ${error}`, path);
    }
  }

  async copyFile(from: string, to: string, options?: CopyOptions): Promise<boolean> {
    this.ensureInitialized();
    try {
      if (!options?.overwriteExisting && await this.exists(to)) {
        throw new FileError('Destination file already exists', to);
      }
      return this._copyFile(from, to);
    } catch (error) {
      throw new FileError(`Failed to copy file: ${error}`, from);
    }
  }

  async remove(path: string, options?: RemoveOptions): Promise<boolean> {
    this.ensureInitialized();
    try {
      if (options?.recursive && await this.isDirectory(path)) {
        const removed = this._removeAll(path);
        return removed > 0;
      } else {
        return this._remove(path);
      }
    } catch (error) {
      if (options?.ignoreNonexistent && error instanceof PathError) {
        return false;
      }
      throw new FilesystemError(`Failed to remove path: ${error}`, 'remove', path);
    }
  }

  async removeAll(path: string): Promise<number> {
    this.ensureInitialized();
    try {
      return this._removeAll(path);
    } catch (error) {
      throw new DirectoryError(`Failed to remove all: ${error}`, path);
    }
  }

  async rename(oldPath: string, newPath: string): Promise<boolean> {
    this.ensureInitialized();
    try {
      return this._rename(oldPath, newPath);
    } catch (error) {
      throw new FilesystemError(`Failed to rename: ${error}`, 'rename', oldPath);
    }
  }

  async currentPath(): Promise<string> {
    this.ensureInitialized();
    try {
      return this._currentPath();
    } catch (error) {
      throw new PathError(`Failed to get current path: ${error}`, '');
    }
  }

  async absolutePath(path: string): Promise<string> {
    this.ensureInitialized();
    try {
      return this._absolutePath(path);
    } catch (error) {
      throw new PathError(`Failed to get absolute path: ${error}`, path);
    }
  }

  async canonicalPath(path: string): Promise<string> {
    this.ensureInitialized();
    try {
      return this._canonicalPath(path);
    } catch (error) {
      throw new PathError(`Failed to get canonical path: ${error}`, path);
    }
  }

  async getPathInfo(path: string): Promise<PathInfo> {
    this.ensureInitialized();
    try {
      return {
        path,
        parent: this._pathParent(path),
        filename: this._pathFilename(path),
        extension: this._pathExtension(path),
        stem: this._pathStem(path)
      };
    } catch (error) {
      throw new PathError(`Failed to get path info: ${error}`, path);
    }
  }

  async getFileStatus(path: string): Promise<FileStatus> {
    this.ensureInitialized();
    try {
      const exists = await this.exists(path);
      return {
        exists,
        isDirectory: exists ? await this.isDirectory(path) : false,
        isRegularFile: exists ? await this.isRegularFile(path) : false,
        size: exists && await this.isRegularFile(path) ? await this.fileSize(path) : 0n
      };
    } catch (error) {
      throw new FilesystemError(`Failed to get file status: ${error}`, 'status', path);
    }
  }

  async setupVirtualFilesystem(): Promise<void> {
    this.ensureInitialized();
    if (!this.module) throw new FilesystemError('Module not initialized', 'setupVirtualFilesystem');

    try {
      this.module._wasm_setup_virtual_filesystem();
    } catch (error) {
      throw new FilesystemError(`Failed to setup virtual filesystem: ${error}`, 'setupVirtualFilesystem');
    }
  }

  async syncFilesystem(populate = false): Promise<void> {
    this.ensureInitialized();
    if (!this.module) throw new FilesystemError('Module not initialized', 'syncFilesystem');

    return new Promise((resolve, reject) => {
      try {
        this.module!._wasm_sync_filesystem(populate ? 1 : 0);
        // Give sync operation time to complete
        setTimeout(() => resolve(), 100);
      } catch (error) {
        reject(new FilesystemError(`Failed to sync filesystem: ${error}`, 'syncFilesystem'));
      }
    });
  }

  async mountFilesystem(mount: VirtualFilesystemMount): Promise<boolean> {
    this.ensureInitialized();
    // This would need additional WASM implementation for mounting different filesystem types
    throw new FilesystemError('mountFilesystem not yet implemented', 'mountFilesystem');
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  cleanup(): void {
    if (this.module) {
      // Cleanup WASM resources if needed
      this.module = null;
      this.initialized = false;
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.module) {
      throw new FilesystemError('Boost.Filesystem not initialized. Call initialize() first.', 'operation');
    }
  }

  // Utility methods
  static join(...parts: string[]): string {
    return parts
      .map((part, index) => {
        if (index === 0) {
          return part.replace(/\/+$/, '');
        } else if (index === parts.length - 1) {
          return part.replace(/^\/+/, '');
        } else {
          return part.replace(/^\/+|\/+$/g, '');
        }
      })
      .filter(Boolean)
      .join('/');
  }

  static normalize(path: string): string {
    const parts = path.split('/');
    const normalized: string[] = [];

    for (const part of parts) {
      if (part === '..') {
        normalized.pop();
      } else if (part !== '.' && part !== '') {
        normalized.push(part);
      }
    }

    let result = normalized.join('/');
    if (path.startsWith('/')) {
      result = '/' + result;
    }

    return result || '.';
  }

  static isAbsolute(path: string): boolean {
    return path.startsWith('/');
  }
}

// Export types
export * from './types.ts';