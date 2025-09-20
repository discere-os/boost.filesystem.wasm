#!/usr/bin/env -S deno run --allow-read --allow-write

import BoostFilesystem from "./src/lib/index.ts";

async function demo() {
  console.log("🗂️  Boost.Filesystem WASM Demo");
  console.log("=" + "=".repeat(50));

  const fs = new BoostFilesystem({
    enablePersistence: true,
    maxMemoryMB: 128
  });

  try {
    console.log("📦 Initializing Boost.Filesystem...");
    await fs.initialize();
    console.log("✅ Library initialized");

    // Demonstrate path operations
    console.log("\n🛣️  Path Operations");
    console.log("-".repeat(20));

    const testPaths = [
      "/home/user/documents/test.txt",
      "relative/path/file.pdf",
      "/var/log/../tmp/data.json",
      "file.tar.gz"
    ];

    for (const path of testPaths) {
      const pathInfo = await fs.getPathInfo(path);
      console.log(`Path: ${path}`);
      console.log(`  Parent: ${pathInfo.parent}`);
      console.log(`  Filename: ${pathInfo.filename}`);
      console.log(`  Extension: ${pathInfo.extension}`);
      console.log(`  Stem: ${pathInfo.stem}`);
      console.log("");
    }

    // Demonstrate utility functions
    console.log("🔧 Path Utilities");
    console.log("-".repeat(20));
    console.log(`Join: ${BoostFilesystem.join("/home", "user", "documents", "file.txt")}`);
    console.log(`Normalize: ${BoostFilesystem.normalize("/home/user/../user/./documents")}`);
    console.log(`Is absolute: ${BoostFilesystem.isAbsolute("/absolute/path")}`);
    console.log(`Is absolute: ${BoostFilesystem.isAbsolute("relative/path")}`);

    // Demonstrate filesystem operations
    console.log("\n📁 Filesystem Operations");
    console.log("-".repeat(30));

    // Get current path
    const currentPath = await fs.currentPath();
    console.log(`Current path: ${currentPath}`);

    // Create test directory structure
    const testDir = "/tmp/boost_fs_test";
    console.log(`\n📂 Creating directory: ${testDir}`);
    const created = await fs.createDirectories(testDir);
    console.log(`Directory created: ${created}`);

    // Check if directory exists and is a directory
    const exists = await fs.exists(testDir);
    const isDir = await fs.isDirectory(testDir);
    console.log(`Directory exists: ${exists}`);
    console.log(`Is directory: ${isDir}`);

    // Create subdirectories
    const subDirs = [
      `${testDir}/documents`,
      `${testDir}/images`,
      `${testDir}/data/nested`
    ];

    for (const dir of subDirs) {
      const created = await fs.createDirectories(dir);
      console.log(`Created ${dir}: ${created}`);
    }

    // List directory contents
    console.log(`\n📋 Listing directory: ${testDir}`);
    const entries = await fs.listDirectory(testDir, {
      includeDirectories: true,
      includeFiles: true
    });

    for (const entry of entries) {
      const type = entry.isDirectory ? "DIR" : entry.isRegularFile ? "FILE" : "OTHER";
      const size = entry.size ? `(${entry.size} bytes)` : "";
      console.log(`  ${type}: ${entry.name} ${size}`);
    }

    // Create some test files (using Emscripten FS directly for demo)
    console.log("\n📝 Creating test files...");

    // Note: In a real scenario, you'd use actual file I/O
    // This is just demonstrating the filesystem structure
    try {
      // These operations would work with actual Emscripten FS
      const testFiles = [
        `${testDir}/documents/readme.txt`,
        `${testDir}/images/photo.jpg`,
        `${testDir}/data/config.json`
      ];

      for (const file of testFiles) {
        const parent = await fs.getPathInfo(file);
        console.log(`Would create: ${file} in ${parent.parent}`);
      }
    } catch (error) {
      console.log(`Note: File creation requires actual filesystem integration`);
    }

    // Demonstrate file status operations
    console.log("\n📊 File Status Operations");
    console.log("-".repeat(30));

    const statusPaths = [testDir, `${testDir}/documents`, "/nonexistent"];

    for (const path of statusPaths) {
      try {
        const status = await fs.getFileStatus(path);
        console.log(`Path: ${path}`);
        console.log(`  Exists: ${status.exists}`);
        console.log(`  Is directory: ${status.isDirectory}`);
        console.log(`  Is regular file: ${status.isRegularFile}`);
        console.log(`  Size: ${status.size} bytes`);
        console.log("");
      } catch (error) {
        console.log(`Path: ${path} - Error: ${error instanceof Error ? error.message : error}`);
      }
    }

    // Performance demonstration
    console.log("⚡ Performance Test");
    console.log("-".repeat(20));

    const iterations = 1000;
    const startTime = performance.now();

    for (let i = 0; i < iterations; i++) {
      await fs.exists(`${testDir}/documents`);
    }

    const elapsed = performance.now() - startTime;
    const opsPerSec = (iterations / elapsed * 1000).toLocaleString();
    console.log(`${iterations} exists() operations: ${elapsed.toFixed(2)}ms`);
    console.log(`Operations per second: ${opsPerSec}`);

    // Virtual filesystem demonstration
    console.log("\n💾 Virtual Filesystem");
    console.log("-".repeat(25));

    try {
      console.log("Setting up virtual filesystem...");
      await fs.setupVirtualFilesystem();
      console.log("✅ Virtual filesystem initialized");

      console.log("Syncing filesystem state...");
      await fs.syncFilesystem(false);
      console.log("✅ Filesystem synchronized");
    } catch (error) {
      console.log(`Virtual filesystem: ${error instanceof Error ? error.message : error}`);
    }

    // Cleanup
    console.log("\n🧹 Cleanup");
    console.log("-".repeat(15));

    try {
      const removed = await fs.removeAll(testDir);
      console.log(`Removed ${removed} items from test directory`);
    } catch (error) {
      console.log(`Cleanup: ${error instanceof Error ? error.message : error}`);
    }

    console.log("\n🎉 Demo completed successfully!");

  } catch (error) {
    console.error("❌ Demo failed:", error);
    if (error instanceof Error) {
      console.error("Stack trace:", error.stack);
    }
  } finally {
    fs.cleanup();
    console.log("🧹 Library cleanup complete");
  }
}

if (import.meta.main) {
  await demo();
}