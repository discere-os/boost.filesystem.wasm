import BoostFilesystem from "../src/lib/index.ts";

let fs: BoostFilesystem;

// Setup before benchmarks
await (async () => {
  fs = new BoostFilesystem({
    maxMemoryMB: 256,
    enablePersistence: false // Disable for cleaner benchmarks
  });
  await fs.initialize();

  // Create test directory structure for benchmarks
  const baseDir = "/tmp/bench_test";
  await fs.createDirectories(baseDir);

  // Create a set of test directories
  for (let i = 0; i < 100; i++) {
    await fs.createDirectory(`${baseDir}/dir_${i}`);
  }

  console.log("Benchmark setup complete");
})();

// Basic operation benchmarks
Deno.bench("exists() operation", () => {
  fs.exists("/tmp/bench_test");
});

Deno.bench("isDirectory() operation", () => {
  fs.isDirectory("/tmp/bench_test");
});

Deno.bench("isRegularFile() operation", () => {
  fs.isRegularFile("/tmp/bench_test");
});

Deno.bench("getPathInfo() operation", () => {
  fs.getPathInfo("/tmp/bench_test/dir_50");
});

Deno.bench("currentPath() operation", () => {
  fs.currentPath();
});

Deno.bench("absolutePath() operation", () => {
  fs.absolutePath("relative/path/to/file");
});

// Directory operations benchmarks
Deno.bench("createDirectory() operation", async () => {
  const randomName = `/tmp/bench_test/temp_${Math.random().toString(36).substr(2, 9)}`;
  await fs.createDirectory(randomName);
  await fs.remove(randomName);
});

Deno.bench("listDirectory() operation", () => {
  fs.listDirectory("/tmp/bench_test");
});

Deno.bench("listDirectory() with filter", () => {
  fs.listDirectory("/tmp/bench_test", {
    includeDirectories: true,
    includeFiles: false,
    pattern: "dir_1"
  });
});

// Path utility benchmarks
Deno.bench("BoostFilesystem.join() utility", () => {
  BoostFilesystem.join("/home", "user", "documents", "file.txt");
});

Deno.bench("BoostFilesystem.normalize() utility", () => {
  BoostFilesystem.normalize("/home/user/../user/./documents");
});

Deno.bench("BoostFilesystem.isAbsolute() utility", () => {
  BoostFilesystem.isAbsolute("/absolute/path");
});

// Complex operation benchmarks
Deno.bench("getFileStatus() operation", () => {
  fs.getFileStatus("/tmp/bench_test");
});

Deno.bench("createDirectories() nested", async () => {
  const randomPath = `/tmp/bench_test/nested_${Math.random().toString(36).substr(2, 5)}/deep/path`;
  await fs.createDirectories(randomPath);
  await fs.removeAll(randomPath.split('/').slice(0, -2).join('/'));
});

// Batch operations benchmarks
Deno.bench("batch exists() operations", async () => {
  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(fs.exists(`/tmp/bench_test/dir_${i}`));
  }
  await Promise.all(promises);
});

Deno.bench("sequential directory creation", async () => {
  const baseName = `/tmp/bench_test/seq_${Date.now()}`;
  for (let i = 0; i < 5; i++) {
    await fs.createDirectory(`${baseName}_${i}`);
  }
  // Cleanup
  for (let i = 0; i < 5; i++) {
    await fs.remove(`${baseName}_${i}`);
  }
});

Deno.bench("concurrent directory creation", async () => {
  const baseName = `/tmp/bench_test/conc_${Date.now()}`;
  const promises = [];
  for (let i = 0; i < 5; i++) {
    promises.push(fs.createDirectory(`${baseName}_${i}`));
  }
  await Promise.all(promises);

  // Cleanup
  const cleanupPromises = [];
  for (let i = 0; i < 5; i++) {
    cleanupPromises.push(fs.remove(`${baseName}_${i}`));
  }
  await Promise.all(cleanupPromises);
});

// Memory and resource benchmarks
Deno.bench("filesystem initialization", async () => {
  const tempFs = new BoostFilesystem({ maxMemoryMB: 64 });
  await tempFs.initialize();
  tempFs.cleanup();
});

// Real-world workflow benchmarks
Deno.bench("typical project structure creation", async () => {
  const projectBase = `/tmp/bench_test/project_${Date.now()}`;
  const dirs = [
    `${projectBase}/src/components`,
    `${projectBase}/src/utils`,
    `${projectBase}/tests/unit`,
    `${projectBase}/tests/integration`,
    `${projectBase}/docs`,
    `${projectBase}/build`
  ];

  // Create structure
  for (const dir of dirs) {
    await fs.createDirectories(dir);
  }

  // Verify structure
  for (const dir of dirs) {
    await fs.exists(dir);
  }

  // Cleanup
  await fs.removeAll(projectBase);
});

Deno.bench("deep directory traversal simulation", async () => {
  const baseDir = "/tmp/bench_test";

  async function traverse(path: string, maxDepth: number, currentDepth = 0): Promise<number> {
    if (currentDepth >= maxDepth) return 0;

    const entries = await fs.listDirectory(path);
    let count = entries.length;

    for (const entry of entries.slice(0, 3)) { // Limit to first 3 to avoid exponential growth
      if (entry.isDirectory) {
        count += await traverse(`${path}/${entry.name}`, maxDepth, currentDepth + 1);
      }
    }

    return count;
  }

  await traverse(baseDir, 2); // Limit depth to keep benchmark reasonable
});

// Cleanup after benchmarks
globalThis.addEventListener("unload", async () => {
  if (fs?.isInitialized()) {
    await fs.removeAll("/tmp/bench_test");
    fs.cleanup();
    console.log("Benchmark cleanup complete");
  }
});