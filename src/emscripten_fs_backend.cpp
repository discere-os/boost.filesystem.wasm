/**
 * Emscripten filesystem backend for Boost.Filesystem
 * Integrates Boost's filesystem operations with Emscripten's virtual filesystem layer
 *
 * This allows Boost.Filesystem to work transparently with:
 * - MEMFS (in-memory filesystem)
 * - IDBFS (IndexedDB persistent storage)
 * - NODEFS (Node.js filesystem when available)
 * - WORKERFS (Web Worker blob filesystem)
 *
 * Copyright (c) Boost.org contributors
 * Copyright (c) 2025 Superstruct Ltd, New Zealand
 * Licensed under BSL-1.0
 */

#include <boost/filesystem.hpp>
#include <emscripten.h>
#include <emscripten/html5.h>
#include <emscripten/val.h>
#include <sys/stat.h>
#include <unistd.h>
#include <dirent.h>
#include <fcntl.h>

namespace fs = boost::filesystem;
using emscripten::val;

/**
 * Emscripten Virtual Filesystem Manager
 * Provides high-level interface to Emscripten's FS API from C++
 */
class EmscriptenFilesystemBackend {
public:
    /**
     * Initialize virtual filesystem backends
     */
    static void initialize() {
        EM_ASM({
            console.log('🔧 Initializing Emscripten filesystem backends...');

            if (typeof FS === 'undefined') {
                console.error('❌ Emscripten FS not available');
                return;
            }

            // MEMFS is always available as default
            console.log('✅ MEMFS (Memory filesystem) available');

            // Setup common directories
            try {
                // Create standard directories that C++ apps might expect
                FS.mkdir('/tmp');
                FS.mkdir('/home');
                FS.mkdir('/var');
                FS.mkdir('/etc');
                console.log('✅ Created standard Unix directories');
            } catch (e) {
                // Directories might already exist
            }
        });
    }

    /**
     * Mount IDBFS for persistent storage
     */
    static bool mount_persistent_storage(const std::string& mount_point = "/persistent") {
        bool success = false;

        EM_ASM({
            const mountPoint = UTF8ToString($0);
            let mounted = false;

            try {
                if (FS.filesystems.IDBFS) {
                    // Create mount point if it doesn't exist
                    try { FS.mkdir(mountPoint); } catch (e) {}

                    // Mount IDBFS
                    FS.mount(FS.filesystems.IDBFS, {}, mountPoint);
                    console.log('✅ IDBFS mounted at', mountPoint);
                    mounted = true;
                } else {
                    console.log('⚠️ IDBFS not available');
                }
            } catch (e) {
                console.error('❌ Failed to mount IDBFS:', e);
            }

            // Return success status
            setValue($1, mounted ? 1 : 0, 'i32');
        }, mount_point.c_str(), &success);

        return success;
    }

    /**
     * Mount WORKERFS from File/Blob objects (only in Web Workers)
     */
    static bool mount_worker_filesystem(const std::string& mount_point, val file_list) {
        bool success = false;

        EM_ASM({
            const mountPoint = UTF8ToString($0);
            let mounted = false;

            try {
                if (typeof importScripts !== 'undefined' && FS.filesystems.WORKERFS) {
                    // We're in a Web Worker context
                    const files = Emscripten.getJSObjectFromHandle($1);

                    try { FS.mkdir(mountPoint); } catch (e) {}

                    FS.mount(FS.filesystems.WORKERFS, {
                        files: files
                    }, mountPoint);

                    console.log('✅ WORKERFS mounted at', mountPoint);
                    mounted = true;
                } else {
                    console.log('⚠️ WORKERFS only available in Web Worker context');
                }
            } catch (e) {
                console.error('❌ Failed to mount WORKERFS:', e);
            }

            setValue($2, mounted ? 1 : 0, 'i32');
        }, mount_point.c_str(), file_list.as_handle(), &success);

        return success;
    }

    /**
     * Synchronize persistent filesystem
     */
    static void sync_persistent(bool populate = false, std::function<void(bool)> callback = nullptr) {
        static std::function<void(bool)> stored_callback;
        stored_callback = callback;

        EM_ASM({
            const populate = $0;
            const hasCallback = $1;

            if (FS.filesystems.IDBFS) {
                FS.syncfs(populate, function(err) {
                    const success = !err;
                    if (err) {
                        console.error('Filesystem sync failed:', err);
                    } else {
                        console.log(populate ? '✅ Populated from persistent storage' : '✅ Synced to persistent storage');
                    }

                    if (hasCallback) {
                        // Call the C++ callback
                        Module._handle_sync_complete(success ? 1 : 0);
                    }
                });
            } else {
                console.log('ℹ️ IDBFS not available for sync');
                if (hasCallback) {
                    Module._handle_sync_complete(0);
                }
            }
        }, populate, callback ? 1 : 0);
    }

    /**
     * Create a virtual file from memory data
     */
    static bool create_virtual_file(const std::string& path, const std::string& content) {
        bool success = false;

        EM_ASM({
            const filePath = UTF8ToString($0);
            const fileContent = UTF8ToString($1);

            try {
                // Create parent directories if needed
                const parentDir = PATH.dirname(filePath);
                FS.mkdirTree(parentDir);

                // Write the file
                FS.writeFile(filePath, fileContent);
                console.log('✅ Created virtual file:', filePath);

                setValue($2, 1, 'i32');
            } catch (e) {
                console.error('❌ Failed to create virtual file:', e);
                setValue($2, 0, 'i32');
            }
        }, path.c_str(), content.c_str(), &success);

        return success;
    }

    /**
     * Get filesystem statistics
     */
    static std::string get_filesystem_stats() {
        char* stats_ptr = nullptr;

        EM_ASM({
            try {
                const stats = {
                    memfs_available: true,
                    idbfs_available: typeof FS.filesystems.IDBFS !== 'undefined',
                    workerfs_available: typeof FS.filesystems.WORKERFS !== 'undefined' && typeof importScripts !== 'undefined',
                    nodefs_available: typeof FS.filesystems.NODEFS !== 'undefined',
                    current_mounts: []
                };

                // Get mount information
                try {
                    for (const mountPoint in FS.mounts) {
                        const mount = FS.mounts[mountPoint];
                        if (mount && mount.type) {
                            stats.current_mounts.push({
                                path: mount.mountpoint,
                                type: mount.type.name || 'unknown'
                            });
                        }
                    }
                } catch (e) {
                    // Mount enumeration might fail
                }

                const statsJson = JSON.stringify(stats, null, 2);
                const len = lengthBytesUTF8(statsJson) + 1;
                const ptr = _malloc(len);
                stringToUTF8(statsJson, ptr, len);
                setValue($0, ptr, 'i32');
            } catch (e) {
                console.error('Failed to get filesystem stats:', e);
                setValue($0, 0, 'i32');
            }
        }, &stats_ptr);

        if (stats_ptr) {
            std::string result(stats_ptr);
            free(stats_ptr);
            return result;
        }
        return "{}";
    }
};

// Global callback handler for async operations
extern "C" {
    static std::function<void(bool)> global_sync_callback;

    EMSCRIPTEN_KEEPALIVE
    void handle_sync_complete(int success) {
        if (global_sync_callback) {
            global_sync_callback(success != 0);
            global_sync_callback = nullptr;
        }
    }
}

/**
 * High-level convenience functions for common operations
 */
namespace boost_emscripten {

/**
 * Setup standard Emscripten filesystem environment for C++ apps
 */
void setup_standard_environment() {
    EmscriptenFilesystemBackend::initialize();

    // Mount persistent storage if available
    if (EmscriptenFilesystemBackend::mount_persistent_storage()) {
        std::cout << "✅ Persistent storage available at /persistent\n";
    }

    // Create common directories that C++ applications expect
    try {
        fs::create_directories("/tmp/boost");
        fs::create_directories("/home/user");
        fs::create_directories("/var/log");
        fs::create_directories("/etc/config");
    } catch (const fs::filesystem_error& e) {
        // These might already exist
    }
}

/**
 * Demonstrate filesystem backend capabilities
 */
void demonstrate_backends() {
    std::cout << "🔍 Emscripten Filesystem Backend Information\n";
    std::cout << "============================================\n";

    std::string stats = EmscriptenFilesystemBackend::get_filesystem_stats();
    std::cout << stats << std::endl;

    // Test different mount points
    std::vector<std::string> test_locations = {
        "/tmp/test.txt",           // MEMFS
        "/persistent/test.txt",    // IDBFS (if mounted)
        "/home/user/test.txt"      // MEMFS
    };

    for (const auto& location : test_locations) {
        try {
            fs::path test_path(location);

            // Create parent directory
            fs::create_directories(test_path.parent_path());

            // Create test file
            std::ofstream file(location);
            file << "Test content for " << location << std::endl;
            file.close();

            if (fs::exists(test_path)) {
                std::cout << "✅ Successfully created: " << location
                         << " (size: " << fs::file_size(test_path) << " bytes)\n";

                // Clean up
                fs::remove(test_path);
            }

        } catch (const std::exception& e) {
            std::cout << "⚠️ Failed to test " << location << ": " << e.what() << "\n";
        }
    }
}

/**
 * Test cross-filesystem operations
 */
void test_cross_filesystem_operations() {
    std::cout << "\n🔄 Cross-Filesystem Operations Test\n";
    std::cout << "====================================\n";

    try {
        // Create files in different filesystem backends
        fs::path memfs_file = "/tmp/memfs_test.txt";
        fs::path persistent_file = "/persistent/persistent_test.txt";

        // Create content in MEMFS
        std::ofstream memfs(memfs_file.string());
        memfs << "This file is in MEMFS (memory)\n";
        memfs << "It will be lost when the page reloads\n";
        memfs.close();

        // Try to create content in persistent storage
        if (fs::exists("/persistent")) {
            std::ofstream persistent(persistent_file.string());
            persistent << "This file is in IDBFS (persistent)\n";
            persistent << "It should survive page reloads\n";
            persistent.close();

            // Copy from MEMFS to persistent storage
            try {
                fs::path copied_file = "/persistent/copied_from_memfs.txt";
                fs::copy_file(memfs_file, copied_file);
                std::cout << "✅ Copied file from MEMFS to IDBFS: " << copied_file << "\n";
            } catch (const fs::filesystem_error& e) {
                std::cout << "⚠️ Cross-filesystem copy failed: " << e.what() << "\n";
            }
        }

        // List files in different locations
        std::vector<std::string> locations = {"/tmp", "/persistent"};
        for (const auto& loc : locations) {
            if (fs::exists(loc)) {
                std::cout << "📁 Contents of " << loc << ":\n";
                try {
                    for (const auto& entry : fs::directory_iterator(loc)) {
                        std::cout << "   " << entry.path().filename()
                                 << (fs::is_directory(entry) ? "/" : "")
                                 << " (" << (fs::is_regular_file(entry) ? std::to_string(fs::file_size(entry)) + " bytes" : "dir") << ")\n";
                    }
                } catch (const std::exception& e) {
                    std::cout << "   Error listing directory: " << e.what() << "\n";
                }
            }
        }

    } catch (const std::exception& e) {
        std::cout << "❌ Cross-filesystem test failed: " << e.what() << std::endl;
    }
}

} // namespace boost_emscripten

// Export functions for JavaScript/TypeScript integration
extern "C" {

EMSCRIPTEN_KEEPALIVE
void boost_emscripten_setup() {
    boost_emscripten::setup_standard_environment();
}

EMSCRIPTEN_KEEPALIVE
void boost_emscripten_demo_backends() {
    boost_emscripten::demonstrate_backends();
}

EMSCRIPTEN_KEEPALIVE
void boost_emscripten_test_cross_fs() {
    boost_emscripten::test_cross_filesystem_operations();
}

EMSCRIPTEN_KEEPALIVE
void boost_emscripten_sync_persistent(int populate) {
    EmscriptenFilesystemBackend::sync_persistent(populate != 0);
}

EMSCRIPTEN_KEEPALIVE
const char* boost_emscripten_get_fs_stats() {
    static std::string stats;
    stats = EmscriptenFilesystemBackend::get_filesystem_stats();
    return stats.c_str();
}

EMSCRIPTEN_KEEPALIVE
int boost_emscripten_create_virtual_file(const char* path, const char* content) {
    return EmscriptenFilesystemBackend::create_virtual_file(path, content) ? 1 : 0;
}

}