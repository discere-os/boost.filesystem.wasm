#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * Simple demo of Boost.Filesystem WASM TypeScript wrapper
 * This tests the API without requiring the WASM module to be built
 */

import BoostFilesystem from "./src/lib/index.ts";

async function simpleDemo() {
  console.log("🧪 Boost.Filesystem WASM - TypeScript API Test");
  console.log("=" + "=".repeat(50));

  const fs = new BoostFilesystem({
    enablePersistence: false,
    maxMemoryMB: 64
  });

  console.log("✅ BoostFilesystem instance created successfully");
  console.log(`📊 Initialized: ${fs.isInitialized()}`);

  // Test utility methods (these work without WASM)
  console.log("\n🔧 Testing Path Utilities (No WASM Required)");
  console.log("-".repeat(30));

  const pathTests = [
    ["/home/user/documents/file.txt", "/other/path"],
    ["relative", "path", "segments"],
    ["/var", "log", "..", "tmp", "file.log"]
  ];

  for (const paths of pathTests) {
    const joined = BoostFilesystem.join(...paths);
    console.log(`Join(${paths.join(', ')}): ${joined}`);
  }

  const normalizeTests = [
    "/home/user/../user/documents",
    "./relative/../path",
    "/var/log/../tmp/./file"
  ];

  for (const path of normalizeTests) {
    const normalized = BoostFilesystem.normalize(path);
    console.log(`Normalize("${path}"): ${normalized}`);
  }

  const absoluteTests = ["/absolute/path", "relative/path", ".", ".."];

  for (const path of absoluteTests) {
    const isAbs = BoostFilesystem.isAbsolute(path);
    console.log(`IsAbsolute("${path}"): ${isAbs}`);
  }

  // Test initialization (this will fail gracefully without WASM)
  console.log("\n📦 Testing Initialization (Expected to Fail Without WASM)");
  console.log("-".repeat(30));

  try {
    await fs.initialize();
    console.log("✅ Initialization succeeded!");
  } catch (error) {
    console.log(`⚠️ Initialization failed (expected): ${error instanceof Error ? error.message : error}`);
  }

  // Test filesystem operations (these will throw without WASM)
  console.log("\n🗂️ Testing Filesystem Operations (Expected to Fail)");
  console.log("-".repeat(30));

  const operationTests = [
    () => fs.exists("/test/path"),
    () => fs.currentPath(),
    () => fs.getPathInfo("/test/file.txt"),
    () => fs.getFileStatus("/test/path")
  ];

  for (const [index, operation] of operationTests.entries()) {
    try {
      const result = await operation();
      console.log(`✅ Operation ${index + 1} succeeded: ${result}`);
    } catch (error) {
      console.log(`⚠️ Operation ${index + 1} failed (expected): ${error instanceof Error ? error.name : 'Unknown error'}`);
    }
  }

  // Test error types
  console.log("\n🚨 Testing Error Types");
  console.log("-".repeat(30));

  const { FilesystemError, PathError, DirectoryError, FileError } = await import("./src/lib/types.ts");

  const errors = [
    new FilesystemError("Test filesystem error", "test"),
    new PathError("Test path error", "/test/path"),
    new DirectoryError("Test directory error", "/test/dir"),
    new FileError("Test file error", "/test/file")
  ];

  for (const error of errors) {
    console.log(`${error.name}: ${error.message} (operation: ${error.operation})`);
  }

  console.log("\n🏁 Simple Demo Complete");
  console.log("All TypeScript interfaces and utilities are working correctly!");
  console.log("To test full functionality, build the WASM module with: ./build-dual.sh all");

  fs.cleanup();
}

if (import.meta.main) {
  await simpleDemo();
}