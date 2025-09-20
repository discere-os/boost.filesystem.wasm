#!/usr/bin/env -S deno run --allow-all

/**
 * NPM package builder for boost.filesystem.wasm
 * Uses Deno's DNT (Deno Node Transform) to create Node.js compatible package
 */

import { build, emptyDir } from "https://deno.land/x/dnt@0.40.0/mod.ts";
import { copy } from "https://deno.land/std@0.224.0/fs/copy.ts";

const NPM_DIR = "./npm";

// Clean npm directory
console.log("🧹 Cleaning npm directory...");
await emptyDir(NPM_DIR);

// Build NPM package with DNT
console.log("📦 Building NPM package with DNT...");
await build({
  entryPoints: ["./src/lib/index.ts"],
  outDir: NPM_DIR,
  shims: {
    deno: false,
    webApi: true,
    crypto: true,
    undici: true,
  },
  compilerOptions: {
    target: "ES2022",
    lib: ["ES2022", "WebWorker", "DOM"],
    sourceMap: true,
  },
  rootTestDir: "./tests/deno",
  mappings: {
    // Map Deno std imports to Node.js equivalents
    "https://deno.land/std@0.224.0/assert/mod.ts": {
      name: "assert",
      version: "^2.0.0",
    },
  },
  package: {
    name: "@discere-os/boost.filesystem.wasm",
    version: "1.84.0",
    description: "Enhanced WebAssembly implementation of Boost.Filesystem with Deno-first wrapper and virtual filesystem support",
    keywords: [
      "boost",
      "filesystem",
      "wasm",
      "webassembly",
      "path",
      "directory",
      "file",
      "virtual-filesystem",
      "emscripten",
      "deno",
      "typescript"
    ],
    license: "BSL-1.0",
    author: {
      name: "Isaac Johnston",
      email: "isaac@superstruct.ltd",
      url: "https://github.com/superstructor"
    },
    homepage: "https://github.com/discere-os/discere-nucleus/tree/main/client/emscripten/boost.filesystem.wasm",
    repository: {
      type: "git",
      url: "git+https://github.com/discere-os/discere-nucleus.git",
      directory: "client/emscripten/boost.filesystem.wasm"
    },
    bugs: {
      url: "https://github.com/discere-os/discere-nucleus/issues"
    },
    funding: {
      type: "github",
      url: "https://github.com/sponsors/superstructor"
    },
    main: "./lib/index.js",
    types: "./lib/index.d.ts",
    exports: {
      ".": {
        import: "./esm/index.js",
        require: "./lib/index.js",
        types: "./lib/index.d.ts"
      },
      "./types": {
        import: "./esm/types.js",
        require: "./lib/types.js",
        types: "./lib/types.d.ts"
      }
    },
    files: [
      "lib/",
      "esm/",
      "dist/",
      "README.md",
      "LICENSE",
      "CHANGELOG.md"
    ],
    engines: {
      node: ">=18.0.0"
    },
    peerDependencies: {},
    devDependencies: {
      "@types/emscripten": "^1.39.13",
      "@types/node": "^22.0.0",
      "typescript": "^5.5.0"
    },
    scripts: {
      "test": "node --test lib/**/*.test.js",
      "build": "echo 'Build completed during npm install'",
      "demo": "node lib/demo.js",
      "clean": "rm -rf dist/ lib/ esm/"
    }
  },
  postBuild() {
    console.log("📝 Post-build processing...");
  },
});

// Copy WASM files to dist directory
console.log("📁 Copying WASM artifacts...");
const distDir = `${NPM_DIR}/dist`;
await Deno.mkdir(distDir, { recursive: true });

try {
  await copy("./install/wasm/boost-filesystem-main.js", `${distDir}/boost-filesystem-main.js`);
  await copy("./install/wasm/boost-filesystem-main.wasm", `${distDir}/boost-filesystem-main.wasm`);
  console.log("✅ WASM files copied successfully");
} catch (error) {
  console.warn("⚠️ WASM files not found - run 'deno task build:wasm' first");
  console.warn("Error:", error.message);
}

// Copy additional files
console.log("📄 Copying additional files...");
const filesToCopy = [
  { src: "./README.md", dest: `${NPM_DIR}/README.md` },
  { src: "./LICENSE", dest: `${NPM_DIR}/LICENSE` },
];

for (const file of filesToCopy) {
  try {
    await copy(file.src, file.dest);
  } catch (error) {
    console.warn(`⚠️ Could not copy ${file.src}:`, error.message);
  }
}

// Create NPM-specific demo file
console.log("🎭 Creating NPM demo...");
const npmDemo = `#!/usr/bin/env node

const BoostFilesystem = require('./lib/index.js').default;

async function demo() {
  console.log('🗂️  Boost.Filesystem WASM NPM Demo');
  console.log('=' + '='.repeat(50));

  const fs = new BoostFilesystem({
    enablePersistence: false,
    maxMemoryMB: 128
  });

  try {
    console.log('📦 Initializing Boost.Filesystem...');
    await fs.initialize();
    console.log('✅ Library initialized');

    // Basic demonstration
    const currentPath = await fs.currentPath();
    console.log('Current path:', currentPath);

    const pathInfo = await fs.getPathInfo('/home/user/documents/file.txt');
    console.log('Path info for /home/user/documents/file.txt:');
    console.log('  Parent:', pathInfo.parent);
    console.log('  Filename:', pathInfo.filename);
    console.log('  Extension:', pathInfo.extension);
    console.log('  Stem:', pathInfo.stem);

    console.log('✅ Demo completed successfully!');
  } catch (error) {
    console.error('❌ Demo failed:', error);
  } finally {
    fs.cleanup();
  }
}

if (require.main === module) {
  demo().catch(console.error);
}

module.exports = { demo };
`;

await Deno.writeTextFile(`${NPM_DIR}/demo.js`, npmDemo);

// Create package-specific TypeScript definitions
console.log("📚 Enhancing TypeScript definitions...");
const enhancedTypes = `
// Enhanced TypeScript definitions for NPM usage
/// <reference types="emscripten" />

declare global {
  namespace NodeJS {
    interface Global {
      Module?: any;
      FS?: any;
    }
  }
}

export * from './lib/index.d.ts';
export { default } from './lib/index.d.ts';
`;

await Deno.writeTextFile(`${NPM_DIR}/index.d.ts`, enhancedTypes);

// Create CHANGELOG if it doesn't exist
const changelogPath = `${NPM_DIR}/CHANGELOG.md`;
try {
  await Deno.stat(changelogPath);
} catch {
  console.log("📝 Creating CHANGELOG...");
  const changelog = `# Changelog

## [1.84.0] - 2025-01-20

### Added
- Initial WebAssembly implementation of Boost.Filesystem
- Deno-first development with Node.js compatibility
- Virtual filesystem support with IDBFS persistence
- XHR-backed filesystem for remote file access
- Comprehensive path manipulation utilities
- Dual build system (SIDE_MODULE and MAIN_MODULE)
- Complete TypeScript definitions
- Performance benchmarks and testing suite
- CI/CD pipeline with Cloudflare R2 deployment

### Features
- Cross-platform path operations
- Directory creation, listing, and removal
- File status and metadata operations
- Virtual filesystem mounting and synchronization
- Browser-native performance with WebAssembly
- Zero external dependencies
- Memory-efficient WASM modules

### Technical
- Built with Emscripten 3.1.67+
- Compatible with modern browsers (Chrome 113+, Edge 113+)
- Supports Web Workers for XHR-backed filesystem
- Optimized for both browser and Node.js environments
`;

  await Deno.writeTextFile(changelogPath, changelog);
}

console.log("✅ NPM package build complete!");
console.log("📍 Package location:", NPM_DIR);
console.log("🚀 To publish: cd npm && npm publish");

// Display package info
try {
  const packageJson = JSON.parse(await Deno.readTextFile(`${NPM_DIR}/package.json`));
  console.log(`📦 Package: ${packageJson.name}@${packageJson.version}`);
  console.log(`📄 Files included:`, packageJson.files.length, "patterns");
} catch (error) {
  console.warn("Could not read package info:", error.message);
}