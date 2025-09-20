/**
 * TypeScript definitions for Boost.Filesystem WASM
 * Copyright (c) Boost.org contributors
 * Copyright (c) 2025 Superstruct Ltd, New Zealand
 * Licensed under BSL-1.0
 */

export interface FilesystemOptions {
  /**
   * Enable virtual filesystem persistence via IDBFS
   * @default true
   */
  enablePersistence?: boolean;

  /**
   * Maximum memory allocation in MB
   * @default 256
   */
  maxMemoryMB?: number;

  /**
   * Enable XHR-backed virtual filesystem for remote file access
   * @default false
   */
  enableXHRFS?: boolean;

  /**
   * Base URL for XHR-backed filesystem
   */
  xhrBaseUrl?: string;
}

export interface FileStatus {
  exists: boolean;
  isDirectory: boolean;
  isRegularFile: boolean;
  size: bigint;
}

export interface DirectoryEntry {
  name: string;
  isDirectory: boolean;
  isRegularFile: boolean;
  size?: bigint;
}

export interface PathInfo {
  path: string;
  parent: string;
  filename: string;
  extension: string;
  stem: string;
}

export interface FilesystemResult<T = any> {
  success: boolean;
  result?: T;
  error?: string;
}

export type FileOperationResult = FilesystemResult<boolean>;
export type PathResult = FilesystemResult<string>;
export type ListResult = FilesystemResult<DirectoryEntry[]>;
export type StatusResult = FilesystemResult<FileStatus>;

/**
 * Virtual filesystem backend types
 */
export enum VirtualFilesystemType {
  MEMFS = "MEMFS",
  IDBFS = "IDBFS",
  NODEFS = "NODEFS",
  WORKERFS = "WORKERFS"
}

export interface VirtualFilesystemMount {
  type: VirtualFilesystemType;
  mountPoint: string;
  options?: Record<string, any>;
}

/**
 * File operation options
 */
export interface CopyOptions {
  overwriteExisting?: boolean;
  copySymlinks?: boolean;
  skipSymlinks?: boolean;
}

export interface RemoveOptions {
  recursive?: boolean;
  ignoreNonexistent?: boolean;
}

/**
 * Directory iteration options
 */
export interface DirectoryIteratorOptions {
  recursive?: boolean;
  includeDirectories?: boolean;
  includeFiles?: boolean;
  followSymlinks?: boolean;
  pattern?: string | RegExp;
}

/**
 * Path manipulation utilities
 */
export interface PathUtils {
  join(...parts: string[]): string;
  normalize(path: string): string;
  isAbsolute(path: string): boolean;
  relative(from: string, to: string): string;
  resolve(...paths: string[]): string;
}

/**
 * Advanced filesystem operations
 */
export interface FilesystemOperations {
  // Basic operations
  exists(path: string): Promise<boolean>;
  isDirectory(path: string): Promise<boolean>;
  isRegularFile(path: string): Promise<boolean>;
  fileSize(path: string): Promise<bigint>;

  // Directory operations
  createDirectory(path: string): Promise<boolean>;
  createDirectories(path: string): Promise<boolean>;
  listDirectory(path: string, options?: DirectoryIteratorOptions): Promise<DirectoryEntry[]>;

  // File operations
  copyFile(from: string, to: string, options?: CopyOptions): Promise<boolean>;
  remove(path: string, options?: RemoveOptions): Promise<boolean>;
  removeAll(path: string): Promise<number>;
  rename(oldPath: string, newPath: string): Promise<boolean>;

  // Path operations
  currentPath(): Promise<string>;
  absolutePath(path: string): Promise<string>;
  canonicalPath(path: string): Promise<string>;
  getPathInfo(path: string): Promise<PathInfo>;

  // Status operations
  getFileStatus(path: string): Promise<FileStatus>;

  // Virtual filesystem operations
  setupVirtualFilesystem(): Promise<void>;
  syncFilesystem(populate?: boolean): Promise<void>;
  mountFilesystem(mount: VirtualFilesystemMount): Promise<boolean>;
}

/**
 * Error types
 */
export class FilesystemError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly path?: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'FilesystemError';
  }
}

export class PathError extends FilesystemError {
  constructor(message: string, path: string) {
    super(message, 'path', path);
    this.name = 'PathError';
  }
}

export class DirectoryError extends FilesystemError {
  constructor(message: string, path: string) {
    super(message, 'directory', path);
    this.name = 'DirectoryError';
  }
}

export class FileError extends FilesystemError {
  constructor(message: string, path: string) {
    super(message, 'file', path);
    this.name = 'FileError';
  }
}

/**
 * Event types for filesystem monitoring
 */
export interface FilesystemEvent {
  type: 'created' | 'modified' | 'deleted' | 'moved';
  path: string;
  timestamp: number;
  oldPath?: string; // For move events
}

export type FilesystemEventHandler = (event: FilesystemEvent) => void;

/**
 * Module interface for the main WASM module
 */
export interface BoostFilesystemModule {
  _wasm_exists(path: number): boolean;
  _wasm_is_directory(path: number): boolean;
  _wasm_is_regular_file(path: number): boolean;
  _wasm_file_size(path: number): bigint;
  _wasm_create_directory(path: number): boolean;
  _wasm_create_directories(path: number): boolean;
  _wasm_remove(path: number): boolean;
  _wasm_remove_all(path: number): number;
  _wasm_copy_file(from: number, to: number): boolean;
  _wasm_rename(oldPath: number, newPath: number): boolean;
  _wasm_current_path(): number;
  _wasm_absolute_path(path: number): number;
  _wasm_canonical_path(path: number): number;
  _wasm_path_parent(path: number): number;
  _wasm_path_filename(path: number): number;
  _wasm_path_extension(path: number): number;
  _wasm_path_stem(path: number): number;
  _wasm_list_directory(path: number): number;
  _wasm_setup_virtual_filesystem(): void;
  _wasm_sync_filesystem(populate: number): void;
  _malloc(size: number): number;
  _free(ptr: number): void;

  // Runtime methods
  cwrap(name: string, returnType: string, argTypes: string[]): Function;
  ccall(name: string, returnType: string, argTypes: string[], args: any[]): any;
  UTF8ToString(ptr: number): string;
  stringToUTF8(str: string, ptr: number, maxLength: number): void;
  lengthBytesUTF8(str: string): number;
  HEAPU8: Uint8Array;
}