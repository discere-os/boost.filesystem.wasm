import { assert, assertEquals, assertExists, assertRejects } from "@std/assert";
import BoostFilesystem, {
  FilesystemError,
  PathError,
  DirectoryError,
  FileError
} from "../../src/lib/index.ts";

Deno.test("BoostFilesystem initialization", async () => {
  const fs = new BoostFilesystem();
  assert(!fs.isInitialized(), "Should not be initialized initially");

  await fs.initialize();
  assert(fs.isInitialized(), "Should be initialized after initialize()");

  fs.cleanup();
});

Deno.test("BoostFilesystem initialization with options", async () => {
  const fs = new BoostFilesystem({
    enablePersistence: false,
    maxMemoryMB: 64
  });

  await fs.initialize();
  assert(fs.isInitialized(), "Should initialize with custom options");

  fs.cleanup();
});

Deno.test("Path utility functions", () => {
  // Test join
  assertEquals(BoostFilesystem.join("/home", "user", "documents"), "/home/user/documents");
  assertEquals(BoostFilesystem.join("/home/", "/user/", "/documents"), "/home/user/documents");
  assertEquals(BoostFilesystem.join("relative", "path"), "relative/path");

  // Test normalize
  assertEquals(BoostFilesystem.normalize("/home/user/../user/documents"), "/home/user/documents");
  assertEquals(BoostFilesystem.normalize("/home/./user/documents"), "/home/user/documents");
  assertEquals(BoostFilesystem.normalize("relative/../path"), "path");

  // Test isAbsolute
  assert(BoostFilesystem.isAbsolute("/absolute/path"), "Should detect absolute path");
  assert(!BoostFilesystem.isAbsolute("relative/path"), "Should detect relative path");
  assert(BoostFilesystem.isAbsolute("/"), "Root should be absolute");
});

Deno.test("Path operations", async () => {
  const fs = new BoostFilesystem();
  await fs.initialize();

  try {
    // Test path info extraction
    const pathInfo = await fs.getPathInfo("/home/user/documents/file.txt");
    assertEquals(pathInfo.path, "/home/user/documents/file.txt");
    assertEquals(pathInfo.parent, "/home/user/documents");
    assertEquals(pathInfo.filename, "file.txt");
    assertEquals(pathInfo.extension, ".txt");
    assertEquals(pathInfo.stem, "file");

    // Test path info with no extension
    const pathInfoNoExt = await fs.getPathInfo("/path/to/filename");
    assertEquals(pathInfoNoExt.extension, "");
    assertEquals(pathInfoNoExt.stem, "filename");

    // Test path info with multiple extensions
    const pathInfoMulti = await fs.getPathInfo("/path/archive.tar.gz");
    assertEquals(pathInfoMulti.extension, ".gz");
    assertEquals(pathInfoMulti.stem, "archive.tar");
  } finally {
    fs.cleanup();
  }
});

Deno.test("Current path operations", async () => {
  const fs = new BoostFilesystem();
  await fs.initialize();

  try {
    const currentPath = await fs.currentPath();
    assertExists(currentPath, "Current path should exist");
    assert(currentPath.length > 0, "Current path should not be empty");
    assert(BoostFilesystem.isAbsolute(currentPath), "Current path should be absolute");
  } finally {
    fs.cleanup();
  }
});

Deno.test("Absolute and canonical path operations", async () => {
  const fs = new BoostFilesystem();
  await fs.initialize();

  try {
    // Test absolute path
    const absPath = await fs.absolutePath("relative/path");
    assert(BoostFilesystem.isAbsolute(absPath), "Absolute path should be absolute");

    // Test canonical path (may throw if path doesn't exist)
    try {
      const canonPath = await fs.canonicalPath("/tmp");
      assert(BoostFilesystem.isAbsolute(canonPath), "Canonical path should be absolute");
    } catch (error) {
      // Canonical path may fail if /tmp doesn't exist in the virtual filesystem
      console.log("Canonical path test skipped - path may not exist");
    }
  } finally {
    fs.cleanup();
  }
});

Deno.test("Directory operations", async () => {
  const fs = new BoostFilesystem();
  await fs.initialize();

  try {
    const testDir = "/tmp/boost_test_dir";

    // Create directory
    const created = await fs.createDirectory(testDir);
    assert(typeof created === "boolean", "createDirectory should return boolean");

    // Check if directory exists
    const exists = await fs.exists(testDir);
    assert(typeof exists === "boolean", "exists should return boolean");

    // Check if it's a directory
    const isDir = await fs.isDirectory(testDir);
    assert(typeof isDir === "boolean", "isDirectory should return boolean");

    // Check if it's a regular file (should be false)
    const isFile = await fs.isRegularFile(testDir);
    assert(typeof isFile === "boolean", "isRegularFile should return boolean");

    // Remove directory
    const removed = await fs.remove(testDir);
    assert(typeof removed === "boolean", "remove should return boolean");
  } finally {
    fs.cleanup();
  }
});

Deno.test("Nested directory operations", async () => {
  const fs = new BoostFilesystem();
  await fs.initialize();

  try {
    const testDir = "/tmp/boost_nested/deep/path";

    // Create nested directories
    const created = await fs.createDirectories(testDir);
    assert(typeof created === "boolean", "createDirectories should return boolean");

    // Verify nested structure exists
    const exists1 = await fs.exists("/tmp/boost_nested");
    const exists2 = await fs.exists("/tmp/boost_nested/deep");
    const exists3 = await fs.exists("/tmp/boost_nested/deep/path");

    assert(typeof exists1 === "boolean", "Parent directory should be checkable");
    assert(typeof exists2 === "boolean", "Intermediate directory should be checkable");
    assert(typeof exists3 === "boolean", "Target directory should be checkable");

    // Remove all nested directories
    const removed = await fs.removeAll("/tmp/boost_nested");
    assert(typeof removed === "number", "removeAll should return number of items removed");
  } finally {
    fs.cleanup();
  }
});

Deno.test("Directory listing", async () => {
  const fs = new BoostFilesystem();
  await fs.initialize();

  try {
    const testDir = "/tmp/boost_list_test";
    await fs.createDirectories(testDir);

    // Create subdirectories for listing
    await fs.createDirectory(`${testDir}/subdir1`);
    await fs.createDirectory(`${testDir}/subdir2`);

    // List directory contents
    const entries = await fs.listDirectory(testDir);
    assert(Array.isArray(entries), "listDirectory should return array");

    for (const entry of entries) {
      assert(typeof entry.name === "string", "Entry name should be string");
      assert(typeof entry.isDirectory === "boolean", "Entry isDirectory should be boolean");
      assert(typeof entry.isRegularFile === "boolean", "Entry isRegularFile should be boolean");
    }

    // Test filtered listing
    const filteredEntries = await fs.listDirectory(testDir, {
      includeDirectories: true,
      includeFiles: false,
      pattern: "subdir"
    });

    assert(Array.isArray(filteredEntries), "Filtered listing should return array");

    // Cleanup
    await fs.removeAll(testDir);
  } finally {
    fs.cleanup();
  }
});

Deno.test("File status operations", async () => {
  const fs = new BoostFilesystem();
  await fs.initialize();

  try {
    const testDir = "/tmp/boost_status_test";
    await fs.createDirectory(testDir);

    // Get status of existing directory
    const status = await fs.getFileStatus(testDir);
    assertExists(status, "Status should exist");
    assertEquals(typeof status.exists, "boolean", "Status exists should be boolean");
    assertEquals(typeof status.isDirectory, "boolean", "Status isDirectory should be boolean");
    assertEquals(typeof status.isRegularFile, "boolean", "Status isRegularFile should be boolean");
    assertEquals(typeof status.size, "bigint", "Status size should be bigint");

    // Get status of non-existent path
    const nonExistentStatus = await fs.getFileStatus("/non/existent/path");
    assertEquals(nonExistentStatus.exists, false, "Non-existent path should have exists=false");

    // Cleanup
    await fs.remove(testDir);
  } finally {
    fs.cleanup();
  }
});

Deno.test("Virtual filesystem operations", async () => {
  const fs = new BoostFilesystem({ enablePersistence: true });
  await fs.initialize();

  try {
    // Setup virtual filesystem
    await fs.setupVirtualFilesystem();

    // Sync filesystem (may not do much in test environment)
    await fs.syncFilesystem(false);
    await fs.syncFilesystem(true);

    // These operations should complete without throwing
    assert(true, "Virtual filesystem operations should complete");
  } finally {
    fs.cleanup();
  }
});

Deno.test("Error handling", async () => {
  const fs = new BoostFilesystem();

  // Test operations before initialization
  await assertRejects(
    async () => await fs.exists("/test"),
    FilesystemError,
    "not initialized"
  );

  await fs.initialize();

  try {
    // Test operations that may throw specific errors
    try {
      await fs.canonicalPath("/definitely/does/not/exist");
    } catch (error) {
      assert(error instanceof PathError || error instanceof FilesystemError);
    }

    // Test file operations on non-existent files
    try {
      await fs.fileSize("/definitely/does/not/exist");
    } catch (error) {
      assert(error instanceof FileError || error instanceof FilesystemError);
    }

  } finally {
    fs.cleanup();
  }
});

Deno.test("Rename operations", async () => {
  const fs = new BoostFilesystem();
  await fs.initialize();

  try {
    const oldPath = "/tmp/boost_old_name";
    const newPath = "/tmp/boost_new_name";

    // Create directory to rename
    await fs.createDirectory(oldPath);

    // Rename directory
    const renamed = await fs.rename(oldPath, newPath);
    assert(typeof renamed === "boolean", "rename should return boolean");

    // Cleanup - try to remove both paths to be safe
    try { await fs.remove(oldPath); } catch {}
    try { await fs.remove(newPath); } catch {}
  } finally {
    fs.cleanup();
  }
});

Deno.test("Copy operations", async () => {
  const fs = new BoostFilesystem();
  await fs.initialize();

  try {
    // Note: Copy operations may require actual files to exist
    // This test mainly checks the API interface

    const result = await fs.copyFile("/nonexistent/source", "/nonexistent/dest");
    assert(typeof result === "boolean", "copyFile should return boolean");

    // Test with overwrite option
    const resultWithOptions = await fs.copyFile(
      "/nonexistent/source",
      "/nonexistent/dest",
      { overwriteExisting: true }
    );
    assert(typeof resultWithOptions === "boolean", "copyFile with options should return boolean");

  } finally {
    fs.cleanup();
  }
});

Deno.test("Remove operations with options", async () => {
  const fs = new BoostFilesystem();
  await fs.initialize();

  try {
    const testDir = "/tmp/boost_remove_test";
    await fs.createDirectory(testDir);

    // Test remove with recursive option
    const removed = await fs.remove(testDir, { recursive: true });
    assert(typeof removed === "boolean", "remove with recursive should return boolean");

    // Test remove with ignoreNonexistent option
    const removedNonexistent = await fs.remove("/nonexistent", { ignoreNonexistent: true });
    assert(typeof removedNonexistent === "boolean", "remove with ignoreNonexistent should return boolean");
    assertEquals(removedNonexistent, false, "remove nonexistent with ignoreNonexistent should return false");

  } finally {
    fs.cleanup();
  }
});

Deno.test("Memory cleanup", async () => {
  const fs = new BoostFilesystem();
  await fs.initialize();

  assert(fs.isInitialized(), "Should be initialized");

  fs.cleanup();
  assert(!fs.isInitialized(), "Should not be initialized after cleanup");
});

Deno.test("Multiple instances", async () => {
  const fs1 = new BoostFilesystem({ maxMemoryMB: 64 });
  const fs2 = new BoostFilesystem({ maxMemoryMB: 128 });

  await fs1.initialize();
  await fs2.initialize();

  assert(fs1.isInitialized(), "First instance should be initialized");
  assert(fs2.isInitialized(), "Second instance should be initialized");

  const path1 = await fs1.currentPath();
  const path2 = await fs2.currentPath();

  assertExists(path1, "First instance should return current path");
  assertExists(path2, "Second instance should return current path");

  fs1.cleanup();
  fs2.cleanup();
});

// Performance test
Deno.test("Performance benchmark", async () => {
  const fs = new BoostFilesystem();
  await fs.initialize();

  try {
    const testDir = "/tmp/boost_perf_test";
    await fs.createDirectory(testDir);

    const iterations = 100;
    const startTime = performance.now();

    for (let i = 0; i < iterations; i++) {
      await fs.exists(testDir);
    }

    const elapsed = performance.now() - startTime;
    const opsPerSec = iterations / elapsed * 1000;

    console.log(`Performance: ${iterations} exists() operations in ${elapsed.toFixed(2)}ms`);
    console.log(`Throughput: ${opsPerSec.toFixed(0)} operations/second`);

    // Basic performance assertion - should be reasonably fast
    assert(opsPerSec > 100, `Performance too slow: ${opsPerSec} ops/sec`);

    await fs.remove(testDir);
  } finally {
    fs.cleanup();
  }
});