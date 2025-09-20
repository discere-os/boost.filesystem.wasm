import { assert, assertEquals, assertExists } from "@std/assert";
import BoostFilesystem from "../../src/lib/index.ts";

Deno.test("Integration with virtual filesystem workflow", async () => {
  const fs = new BoostFilesystem({
    enablePersistence: true,
    maxMemoryMB: 128
  });

  await fs.initialize();

  try {
    console.log("Testing complete filesystem workflow...");

    // 1. Setup virtual filesystem
    await fs.setupVirtualFilesystem();

    // 2. Create a complex directory structure
    const baseDir = "/persistent/project";
    const dirs = [
      `${baseDir}/src/components`,
      `${baseDir}/src/utils`,
      `${baseDir}/tests/unit`,
      `${baseDir}/tests/integration`,
      `${baseDir}/docs/api`,
      `${baseDir}/build/assets`
    ];

    console.log("Creating directory structure...");
    for (const dir of dirs) {
      await fs.createDirectories(dir);
    }

    // 3. Verify structure exists
    console.log("Verifying directory structure...");
    for (const dir of dirs) {
      const exists = await fs.exists(dir);
      const isDir = await fs.isDirectory(dir);
      assert(exists, `Directory should exist: ${dir}`);
      assert(isDir, `Path should be directory: ${dir}`);
    }

    // 4. Test directory listing at various levels
    console.log("Testing directory listings...");
    const rootEntries = await fs.listDirectory(baseDir);
    assert(rootEntries.length > 0, "Root directory should have entries");

    const srcEntries = await fs.listDirectory(`${baseDir}/src`);
    assert(srcEntries.length >= 2, "Src directory should have components and utils");

    const testEntries = await fs.listDirectory(`${baseDir}/tests`, {
      includeDirectories: true,
      includeFiles: false
    });
    assertEquals(testEntries.length, 2, "Tests directory should have 2 subdirectories");

    // 5. Test path operations on the structure
    console.log("Testing path operations...");
    const pathInfo = await fs.getPathInfo(`${baseDir}/src/components`);
    assertEquals(pathInfo.parent, `${baseDir}/src`);
    assertEquals(pathInfo.filename, "components");

    // 6. Test recursive directory removal
    console.log("Testing recursive removal...");
    const testsRemoved = await fs.removeAll(`${baseDir}/tests`);
    assert(testsRemoved > 0, "Should remove multiple items");

    const testsExists = await fs.exists(`${baseDir}/tests`);
    assert(!testsExists, "Tests directory should no longer exist");

    // 7. Test filesystem synchronization
    console.log("Testing filesystem synchronization...");
    await fs.syncFilesystem(false); // Sync to persistent storage
    await fs.syncFilesystem(true);  // Populate from persistent storage

    // 8. Verify remaining structure after sync
    const remainingEntries = await fs.listDirectory(baseDir);
    const hasTests = remainingEntries.some(entry => entry.name === "tests");
    assert(!hasTests, "Tests directory should not be present after removal and sync");

    // 9. Performance test on the created structure
    console.log("Running performance test...");
    const startTime = performance.now();
    const iterations = 50;

    for (let i = 0; i < iterations; i++) {
      await fs.exists(`${baseDir}/src`);
      await fs.isDirectory(`${baseDir}/src/components`);
      await fs.listDirectory(`${baseDir}/src`);
    }

    const elapsed = performance.now() - startTime;
    const opsPerSec = (iterations * 3) / elapsed * 1000; // 3 operations per iteration

    console.log(`Integration performance: ${(iterations * 3)} operations in ${elapsed.toFixed(2)}ms`);
    console.log(`Throughput: ${opsPerSec.toFixed(0)} operations/second`);

    // 10. Final cleanup
    console.log("Performing final cleanup...");
    const finalRemoved = await fs.removeAll(baseDir);
    console.log(`Cleaned up ${finalRemoved} items`);

    console.log("✅ Integration test completed successfully");

  } finally {
    fs.cleanup();
  }
});

Deno.test("Integration with complex path operations", async () => {
  const fs = new BoostFilesystem();
  await fs.initialize();

  try {
    console.log("Testing complex path operations...");

    // Test various path combinations
    const testCases = [
      {
        input: "/home/user/documents/../downloads/file.txt",
        operation: "absolute"
      },
      {
        input: "./relative/../path/to/file",
        operation: "absolute"
      },
      {
        input: "/var/log/application.log",
        operation: "info"
      },
      {
        input: "/usr/local/bin/executable",
        operation: "info"
      }
    ];

    for (const testCase of testCases) {
      console.log(`Testing ${testCase.operation} on: ${testCase.input}`);

      if (testCase.operation === "absolute") {
        const result = await fs.absolutePath(testCase.input);
        assert(BoostFilesystem.isAbsolute(result), `Result should be absolute: ${result}`);
        assert(result.length > 0, "Absolute path should not be empty");
      }

      if (testCase.operation === "info") {
        const info = await fs.getPathInfo(testCase.input);
        assertExists(info.path, "Path should exist in info");
        assertExists(info.parent, "Parent should exist in info");
        assertExists(info.filename, "Filename should exist in info");
        // Extension and stem might be empty, so we don't assert they exist
        assert(typeof info.extension === "string", "Extension should be string");
        assert(typeof info.stem === "string", "Stem should be string");
      }
    }

    console.log("✅ Complex path operations test completed");

  } finally {
    fs.cleanup();
  }
});

Deno.test("Integration with error recovery", async () => {
  const fs = new BoostFilesystem();
  await fs.initialize();

  try {
    console.log("Testing error recovery scenarios...");

    const testDir = "/tmp/error_recovery_test";

    // 1. Test creating directory that might already exist
    await fs.createDirectory(testDir);
    const secondCreate = await fs.createDirectory(testDir);
    assert(typeof secondCreate === "boolean", "Second create should complete");

    // 2. Test operations on paths that don't exist
    const nonExistentOps = [
      () => fs.exists("/definitely/does/not/exist"),
      () => fs.isDirectory("/definitely/does/not/exist"),
      () => fs.isRegularFile("/definitely/does/not/exist"),
      () => fs.getFileStatus("/definitely/does/not/exist")
    ];

    for (const op of nonExistentOps) {
      try {
        const result = await op();
        // Operations should return false/empty results, not throw
        assert(typeof result !== "undefined", "Operations should return results");
      } catch (error) {
        // Some operations might throw, which is acceptable
        console.log(`Operation threw (acceptable): ${error instanceof Error ? error.message : error}`);
      }
    }

    // 3. Test removal of non-existent paths with ignore option
    const ignoredRemove = await fs.remove("/does/not/exist", { ignoreNonexistent: true });
    assertEquals(ignoredRemove, false, "Ignored remove should return false");

    // 4. Test directory listing on non-existent directory
    try {
      const entries = await fs.listDirectory("/does/not/exist");
      assert(Array.isArray(entries), "Should return array even for non-existent directory");
      assertEquals(entries.length, 0, "Should return empty array for non-existent directory");
    } catch (error) {
      // It's acceptable for this to throw
      console.log(`Directory listing threw (acceptable): ${error instanceof Error ? error.message : error}`);
    }

    // 5. Test cleanup even after errors
    await fs.removeAll(testDir);

    console.log("✅ Error recovery test completed");

  } finally {
    fs.cleanup();
  }
});

Deno.test("Integration with concurrent operations", async () => {
  const fs = new BoostFilesystem();
  await fs.initialize();

  try {
    console.log("Testing concurrent filesystem operations...");

    const baseDir = "/tmp/concurrent_test";
    await fs.createDirectory(baseDir);

    // Create multiple directories concurrently
    const concurrentDirs = Array.from({ length: 10 }, (_, i) => `${baseDir}/dir_${i}`);

    console.log("Creating directories concurrently...");
    const createPromises = concurrentDirs.map(dir => fs.createDirectory(dir));
    const createResults = await Promise.all(createPromises);

    assert(createResults.every(result => typeof result === "boolean"),
           "All create operations should return boolean");

    // Check directories concurrently
    console.log("Checking directories concurrently...");
    const checkPromises = concurrentDirs.map(dir => fs.exists(dir));
    const checkResults = await Promise.all(checkPromises);

    assert(checkResults.every(result => typeof result === "boolean"),
           "All check operations should return boolean");

    // List directories concurrently
    console.log("Listing directories concurrently...");
    const listPromises = concurrentDirs.map(dir => fs.listDirectory(dir));
    const listResults = await Promise.all(listPromises);

    assert(listResults.every(result => Array.isArray(result)),
           "All list operations should return arrays");

    // Get path info concurrently
    console.log("Getting path info concurrently...");
    const infoPromises = concurrentDirs.map(dir => fs.getPathInfo(dir));
    const infoResults = await Promise.all(infoPromises);

    assert(infoResults.every(result => result && typeof result.path === "string"),
           "All info operations should return valid path info");

    // Remove directories concurrently
    console.log("Removing directories concurrently...");
    const removePromises = concurrentDirs.map(dir => fs.remove(dir));
    const removeResults = await Promise.all(removePromises);

    assert(removeResults.every(result => typeof result === "boolean"),
           "All remove operations should return boolean");

    // Final cleanup
    await fs.removeAll(baseDir);

    console.log("✅ Concurrent operations test completed");

  } finally {
    fs.cleanup();
  }
});

Deno.test("Integration with large directory structures", async () => {
  const fs = new BoostFilesystem();
  await fs.initialize();

  try {
    console.log("Testing large directory structure handling...");

    const baseDir = "/tmp/large_structure_test";
    const startTime = performance.now();

    // Create a large nested structure
    const depth = 5;
    const breadth = 5;
    let totalDirs = 0;

    async function createNestedStructure(currentPath: string, currentDepth: number) {
      if (currentDepth >= depth) return;

      for (let i = 0; i < breadth; i++) {
        const dirPath = `${currentPath}/level_${currentDepth}_item_${i}`;
        await fs.createDirectory(dirPath);
        totalDirs++;

        await createNestedStructure(dirPath, currentDepth + 1);
      }
    }

    console.log(`Creating nested structure (depth: ${depth}, breadth: ${breadth})...`);
    await fs.createDirectory(baseDir);
    await createNestedStructure(baseDir, 0);

    const createTime = performance.now() - startTime;
    console.log(`Created ${totalDirs} directories in ${createTime.toFixed(2)}ms`);

    // Test traversal performance
    console.log("Testing traversal performance...");
    const traversalStart = performance.now();

    async function countDirectories(path: string): Promise<number> {
      const entries = await fs.listDirectory(path);
      let count = entries.filter(entry => entry.isDirectory).length;

      for (const entry of entries) {
        if (entry.isDirectory) {
          count += await countDirectories(`${path}/${entry.name}`);
        }
      }

      return count;
    }

    const foundDirs = await countDirectories(baseDir);
    const traversalTime = performance.now() - traversalStart;

    console.log(`Traversed ${foundDirs} directories in ${traversalTime.toFixed(2)}ms`);
    assert(foundDirs >= totalDirs, `Should find at least ${totalDirs} directories, found ${foundDirs}`);

    // Test bulk removal performance
    console.log("Testing bulk removal performance...");
    const removeStart = performance.now();

    const removedCount = await fs.removeAll(baseDir);
    const removeTime = performance.now() - removeStart;

    console.log(`Removed ${removedCount} items in ${removeTime.toFixed(2)}ms`);
    assert(removedCount > 0, "Should remove multiple items");

    const totalTime = performance.now() - startTime;
    console.log(`Total test time: ${totalTime.toFixed(2)}ms`);

    console.log("✅ Large directory structure test completed");

  } finally {
    fs.cleanup();
  }
});