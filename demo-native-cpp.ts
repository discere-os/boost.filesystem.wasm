#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * Demonstration of native C++ Boost.Filesystem working transparently
 * with all Emscripten virtual filesystem backends
 */

import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

interface BoostFilesystemNativeModule {
  // Core integration functions
  _setup_virtual_filesystems(): void;
  _sync_persistent_filesystem(populate: number): void;
  _run_boost_filesystem_demo(): void;
  _demonstrate_cpp_filesystem_compatibility(): void;

  // Backend management
  _boost_emscripten_setup(): void;
  _boost_emscripten_demo_backends(): void;
  _boost_emscripten_test_cross_fs(): void;
  _boost_emscripten_sync_persistent(populate: number): void;
  _boost_emscripten_get_fs_stats(): number;
  _boost_emscripten_create_virtual_file(path: number, content: number): number;

  // Runtime methods
  cwrap(name: string, returnType: string, argTypes: string[]): Function;
  ccall(name: string, returnType: string, argTypes: string[], args: any[]): any;
  UTF8ToString(ptr: number): string;
  stringToUTF8(str: string, ptr: number, maxLength: number): void;
  lengthBytesUTF8(str: string): number;
  _malloc(size: number): number;
  _free(ptr: number): void;

  // Emscripten filesystem
  FS: any;
  PATH: any;
}

class NativeBoostFilesystemDemo {
  private module: BoostFilesystemNativeModule | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log("🔧 Loading native Boost.Filesystem + Emscripten integration...");

    try {
      // Load the WASM module
      const moduleFactory = await this.loadModuleFactory();
      const wasmBinary = await this.loadWasmBinary();

      this.module = await moduleFactory({
        wasmBinary,
        locateFile: (path: string) => {
          if (path.endsWith('.wasm')) {
            return new URL('./install/wasm/' + path, import.meta.url).href;
          }
          return path;
        },
        preRun: [
          () => {
            console.log("🚀 Emscripten runtime initialized");
          }
        ],
        onRuntimeInitialized: () => {
          console.log("✅ WASM runtime ready");
          this.setupFilesystemEnvironment();
        }
      });

      this.initialized = true;
      console.log("✅ Native Boost.Filesystem module loaded successfully");

    } catch (error) {
      throw new Error(`Failed to initialize native module: ${error}`);
    }
  }

  private async loadModuleFactory(): Promise<(config: any) => Promise<BoostFilesystemNativeModule>> {
    if (typeof globalThis.Deno !== 'undefined') {
      const module = await import('./install/wasm/boost-filesystem-native-main.js');
      return module.default || module.BoostFilesystemNativeModule;
    }

    // Fallback to CDN
    const cdnUrls = [
      'https://wasm.discere.cloud/boost.filesystem/latest/main/',
      'https://cdn.jsdelivr.net/npm/@discere-os/boost.filesystem.wasm/dist/'
    ];

    for (const url of cdnUrls) {
      try {
        const module = await import(`${url}boost-filesystem-native-main.js`);
        return module.default || module.BoostFilesystemNativeModule;
      } catch {
        continue;
      }
    }

    throw new Error('Failed to load module factory');
  }

  private async loadWasmBinary(): Promise<ArrayBuffer | undefined> {
    if (typeof globalThis.Deno !== 'undefined') {
      try {
        const wasmPath = new URL('./install/wasm/boost-filesystem-native-main.wasm', import.meta.url).pathname;
        const wasmBuffer = await Deno.readFile(wasmPath);
        return wasmBuffer.buffer;
      } catch (error) {
        console.warn('Failed to load local WASM binary:', error);
      }
    }

    // Fallback to CDN
    const cdnUrls = [
      'https://wasm.discere.cloud/boost.filesystem/latest/main/',
      'https://cdn.jsdelivr.net/npm/@discere-os/boost.filesystem.wasm/dist/'
    ];

    for (const url of cdnUrls) {
      try {
        const response = await fetch(`${url}boost-filesystem-native-main.wasm`);
        if (response.ok) {
          return await response.arrayBuffer();
        }
      } catch {
        continue;
      }
    }

    return undefined;
  }

  private setupFilesystemEnvironment(): void {
    if (!this.module) return;

    console.log("🔧 Setting up Emscripten filesystem environment...");

    // Setup virtual filesystems through C++ integration
    this.module._boost_emscripten_setup();
  }

  async demonstrateNativeIntegration(): Promise<void> {
    if (!this.module) {
      console.error("❌ Module not initialized");
      return;
    }

    console.log("\n🧪 Native C++ Boost.Filesystem Integration Demo");
    console.log("================================================");

    try {
      // Show filesystem backend information
      console.log("\n1️⃣ Filesystem Backend Information");
      console.log("-".repeat(40));
      this.module._boost_emscripten_demo_backends();

      // Run the complete C++ demo using standard Boost.Filesystem APIs
      console.log("\n2️⃣ Standard C++ Boost.Filesystem Demo");
      console.log("-".repeat(40));
      this.module._run_boost_filesystem_demo();

      // Demonstrate C++ standard library compatibility
      console.log("\n3️⃣ C++ Standard Library Compatibility");
      console.log("-".repeat(40));
      this.module._demonstrate_cpp_filesystem_compatibility();

      // Test cross-filesystem operations
      console.log("\n4️⃣ Cross-Filesystem Operations");
      console.log("-".repeat(40));
      this.module._boost_emscripten_test_cross_fs();

      // Show filesystem statistics
      console.log("\n5️⃣ Filesystem Statistics");
      console.log("-".repeat(40));
      const statsPtr = this.module._boost_emscripten_get_fs_stats();
      if (statsPtr) {
        const stats = this.module.UTF8ToString(statsPtr);
        console.log("Filesystem backend status:", JSON.parse(stats));
      }

    } catch (error) {
      console.error("❌ Demo failed:", error);
    }
  }

  async demonstrateVirtualFilesystems(): Promise<void> {
    if (!this.module) return;

    console.log("\n💾 Virtual Filesystem Backends Demo");
    console.log("===================================");

    // Test different virtual filesystem types
    const testData = [
      { path: "/tmp/memfs_test.txt", content: "MEMFS test data" },
      { path: "/persistent/idbfs_test.txt", content: "IDBFS persistent data" },
      { path: "/home/user/document.txt", content: "User document in MEMFS" }
    ];

    for (const { path, content } of testData) {
      console.log(`\n📝 Creating virtual file: ${path}`);

      // Allocate memory for C strings
      const pathPtr = this.module._malloc(this.module.lengthBytesUTF8(path) + 1);
      const contentPtr = this.module._malloc(this.module.lengthBytesUTF8(content) + 1);

      try {
        // Copy strings to WASM memory
        this.module.stringToUTF8(path, pathPtr, this.module.lengthBytesUTF8(path) + 1);
        this.module.stringToUTF8(content, contentPtr, this.module.lengthBytesUTF8(content) + 1);

        // Create file through native C++ code
        const success = this.module._boost_emscripten_create_virtual_file(pathPtr, contentPtr);

        if (success) {
          console.log(`✅ Successfully created ${path}`);

          // Verify through Emscripten FS API
          if (this.module.FS && this.module.FS.readFile) {
            try {
              const fileContent = this.module.FS.readFile(path, { encoding: 'utf8' });
              console.log(`   Content verified: "${fileContent.trim()}"`);
            } catch (e) {
              console.log(`   Content verification failed: ${e}`);
            }
          }
        } else {
          console.log(`❌ Failed to create ${path}`);
        }

      } finally {
        // Clean up allocated memory
        this.module._free(pathPtr);
        this.module._free(contentPtr);
      }
    }
  }

  async demonstratePersistentStorage(): Promise<void> {
    if (!this.module) return;

    console.log("\n🔄 Persistent Storage Operations");
    console.log("================================");

    try {
      // Populate from persistent storage first
      console.log("📥 Populating from persistent storage...");
      this.module._boost_emscripten_sync_persistent(1); // populate = true

      // Give async operation time to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Run C++ code that creates persistent data
      console.log("💾 Creating persistent data through C++ code...");

      // Create some test content in persistent storage through the C++ layer
      const testContent = `Persistent data created at ${new Date().toISOString()}`;
      const pathPtr = this.module._malloc(this.module.lengthBytesUTF8("/persistent/demo.txt") + 1);
      const contentPtr = this.module._malloc(this.module.lengthBytesUTF8(testContent) + 1);

      this.module.stringToUTF8("/persistent/demo.txt", pathPtr, this.module.lengthBytesUTF8("/persistent/demo.txt") + 1);
      this.module.stringToUTF8(testContent, contentPtr, this.module.lengthBytesUTF8(testContent) + 1);

      const success = this.module._boost_emscripten_create_virtual_file(pathPtr, contentPtr);

      this.module._free(pathPtr);
      this.module._free(contentPtr);

      if (success) {
        console.log("✅ Created persistent data file");

        // Sync to persistent storage
        console.log("💾 Syncing to persistent storage...");
        this.module._boost_emscripten_sync_persistent(0); // populate = false (sync to storage)

        await new Promise(resolve => setTimeout(resolve, 100));
        console.log("✅ Data synced to persistent storage");
        console.log("   This data should survive page reloads!");
      }

    } catch (error) {
      console.error("❌ Persistent storage demo failed:", error);
    }
  }

  async runCompleteDemo(): Promise<void> {
    console.log("🚀 Complete Native Boost.Filesystem + Emscripten Demo");
    console.log("=".repeat(60));

    try {
      await this.initialize();

      await this.demonstrateNativeIntegration();
      await this.demonstrateVirtualFilesystems();
      await this.demonstratePersistentStorage();

      console.log("\n🎉 Complete Demo Finished!");
      console.log("🔑 Key Achievement: C++ code using standard Boost.Filesystem APIs");
      console.log("   worked transparently with all Emscripten virtual filesystem backends!");

    } catch (error) {
      console.error("❌ Demo failed:", error);
      if (error instanceof Error && error.message.includes('Module not found')) {
        console.log("💡 To run this demo, build the native WASM module first:");
        console.log("   ./build-native.sh all");
      }
    }
  }

  cleanup(): void {
    this.module = null;
    this.initialized = false;
  }
}

async function main() {
  const demo = new NativeBoostFilesystemDemo();

  try {
    await demo.runCompleteDemo();
  } finally {
    demo.cleanup();
  }
}

if (import.meta.main) {
  await main();
}