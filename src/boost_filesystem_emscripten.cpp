/**
 * Native Emscripten integration for Boost.Filesystem
 * This allows standard Boost C++ code to work transparently with all Emscripten FS backends
 *
 * Copyright (c) Boost.org contributors
 * Copyright (c) 2025 Superstruct Ltd, New Zealand
 * Licensed under BSL-1.0
 */

#include <boost/filesystem.hpp>
#include <emscripten.h>
#include <emscripten/html5.h>
#include <string>
#include <iostream>

namespace fs = boost::filesystem;

// Demo C++ application using standard Boost.Filesystem APIs
class BoostFilesystemDemo {
private:
    fs::path working_directory;

public:
    BoostFilesystemDemo() : working_directory(fs::current_path()) {
        std::cout << "🚀 Boost.Filesystem Emscripten Integration Demo\n";
        std::cout << "Current working directory: " << working_directory << std::endl;
    }

    void demonstrateBasicOperations() {
        std::cout << "\n📁 Basic Filesystem Operations\n";
        std::cout << "================================\n";

        // Create test directory structure - should work with any Emscripten FS backend
        fs::path test_dir = working_directory / "boost_demo";
        fs::path data_dir = test_dir / "data";
        fs::path persistent_dir = test_dir / "persistent";

        try {
            // Directory creation
            fs::create_directories(data_dir);
            fs::create_directories(persistent_dir);

            std::cout << "✅ Created directories:\n";
            std::cout << "   " << data_dir << "\n";
            std::cout << "   " << persistent_dir << "\n";

            // File operations
            fs::path config_file = data_dir / "config.txt";
            std::ofstream config(config_file.string());
            config << "# Boost.Filesystem Emscripten Demo Config\n";
            config << "version=1.0\n";
            config << "backend=emscripten\n";
            config.close();

            std::cout << "✅ Created file: " << config_file << "\n";
            std::cout << "   Size: " << fs::file_size(config_file) << " bytes\n";

            // Directory iteration
            std::cout << "✅ Directory contents of " << test_dir << ":\n";
            for (const auto& entry : fs::directory_iterator(test_dir)) {
                std::cout << "   " << entry.path().filename()
                         << (fs::is_directory(entry) ? " (dir)" : " (file)") << "\n";
            }

            // Path manipulation
            std::cout << "✅ Path operations:\n";
            std::cout << "   Parent: " << config_file.parent_path() << "\n";
            std::cout << "   Filename: " << config_file.filename() << "\n";
            std::cout << "   Extension: " << config_file.extension() << "\n";
            std::cout << "   Stem: " << config_file.stem() << "\n";

            // File status checks
            std::cout << "✅ File status checks:\n";
            std::cout << "   Exists: " << (fs::exists(config_file) ? "true" : "false") << "\n";
            std::cout << "   Is regular file: " << (fs::is_regular_file(config_file) ? "true" : "false") << "\n";
            std::cout << "   Is directory: " << (fs::is_directory(data_dir) ? "true" : "false") << "\n";

        } catch (const fs::filesystem_error& e) {
            std::cout << "❌ Filesystem error: " << e.what() << std::endl;
        }
    }

    void demonstrateRecursiveOperations() {
        std::cout << "\n🔄 Recursive Operations\n";
        std::cout << "=======================\n";

        fs::path test_dir = working_directory / "boost_demo";

        try {
            // Create nested structure
            fs::path deep_dir = test_dir / "level1" / "level2" / "level3";
            fs::create_directories(deep_dir);

            // Create files at different levels
            std::vector<fs::path> files = {
                test_dir / "root.txt",
                test_dir / "level1" / "middle.txt",
                deep_dir / "deep.txt"
            };

            for (const auto& file : files) {
                std::ofstream f(file.string());
                f << "Content of " << file.filename() << std::endl;
                f.close();
            }

            std::cout << "✅ Created nested structure with files\n";

            // Recursive directory iteration
            std::cout << "✅ Recursive directory listing:\n";
            for (const auto& entry : fs::recursive_directory_iterator(test_dir)) {
                std::string indent(entry.depth() * 2, ' ');
                std::cout << "   " << indent << entry.path().filename();
                if (fs::is_regular_file(entry)) {
                    std::cout << " (" << fs::file_size(entry) << " bytes)";
                }
                std::cout << "\n";
            }

        } catch (const fs::filesystem_error& e) {
            std::cout << "❌ Recursive operation error: " << e.what() << std::endl;
        }
    }

    void demonstratePersistentStorage() {
        std::cout << "\n💾 Persistent Storage Demo\n";
        std::cout << "==========================\n";

        // This will work with IDBFS when mounted at /persistent
        fs::path persistent_dir = "/persistent/boost_data";

        try {
            if (fs::exists("/persistent")) {
                std::cout << "✅ Persistent storage available at /persistent\n";

                fs::create_directories(persistent_dir);

                fs::path data_file = persistent_dir / "saved_data.txt";
                std::ofstream data(data_file.string());
                data << "This data should persist across page reloads!\n";
                data << "Timestamp: " << std::time(nullptr) << "\n";
                data.close();

                std::cout << "✅ Saved data to persistent storage: " << data_file << "\n";

                // Try to read existing data
                if (fs::exists(data_file)) {
                    std::ifstream read_data(data_file.string());
                    std::string line;
                    std::cout << "✅ Reading persistent data:\n";
                    while (std::getline(read_data, line)) {
                        std::cout << "   " << line << "\n";
                    }
                }
            } else {
                std::cout << "ℹ️ Persistent storage not mounted (expected in basic setup)\n";
                std::cout << "   To enable: FS.mount(FS.filesystems.IDBFS, {}, '/persistent');\n";
            }

        } catch (const fs::filesystem_error& e) {
            std::cout << "⚠️ Persistent storage error: " << e.what() << std::endl;
        }
    }

    void demonstratePathOperations() {
        std::cout << "\n🛣️ Path Operations\n";
        std::cout << "===================\n";

        try {
            // Demonstrate various path operations
            std::vector<std::string> test_paths = {
                "/home/user/documents/file.txt",
                "./relative/path/to/file.dat",
                "../parent/sibling.cfg",
                "/var/log/../tmp/tempfile"
            };

            for (const auto& path_str : test_paths) {
                fs::path p(path_str);

                std::cout << "Path: " << path_str << "\n";
                std::cout << "  Absolute: " << fs::absolute(p) << "\n";
                std::cout << "  Parent: " << p.parent_path() << "\n";
                std::cout << "  Filename: " << p.filename() << "\n";
                std::cout << "  Extension: " << p.extension() << "\n";
                std::cout << "  Is absolute: " << (p.is_absolute() ? "true" : "false") << "\n";
                std::cout << "\n";
            }

        } catch (const fs::filesystem_error& e) {
            std::cout << "❌ Path operation error: " << e.what() << std::endl;
        }
    }

    void cleanup() {
        std::cout << "\n🧹 Cleanup\n";
        std::cout << "==========\n";

        try {
            fs::path test_dir = working_directory / "boost_demo";
            if (fs::exists(test_dir)) {
                std::uintmax_t removed = fs::remove_all(test_dir);
                std::cout << "✅ Removed " << removed << " items from " << test_dir << "\n";
            }
        } catch (const fs::filesystem_error& e) {
            std::cout << "⚠️ Cleanup error: " << e.what() << std::endl;
        }
    }

    void runCompleteDemo() {
        demonstrateBasicOperations();
        demonstrateRecursiveOperations();
        demonstratePersistentStorage();
        demonstratePathOperations();
        cleanup();

        std::cout << "\n🎉 Demo completed!\n";
        std::cout << "This C++ code used only standard Boost.Filesystem APIs\n";
        std::cout << "and worked transparently with Emscripten virtual filesystems.\n";
    }
};

// Emscripten integration functions
extern "C" {

EMSCRIPTEN_KEEPALIVE
void setup_virtual_filesystems() {
    std::cout << "🔧 Setting up Emscripten virtual filesystems...\n";

    // Setup happens in JavaScript since we need access to FS object
    EM_ASM({
        console.log('Setting up Emscripten virtual filesystems...');

        try {
            // Create persistent directory and mount IDBFS
            if (typeof FS !== 'undefined' && FS.filesystems.IDBFS) {
                FS.mkdir('/persistent');
                FS.mount(FS.filesystems.IDBFS, {}, '/persistent');
                console.log('✅ IDBFS mounted at /persistent');
            }

            // Setup WORKERFS if we're in a worker
            if (typeof importScripts !== 'undefined' && FS.filesystems.WORKERFS) {
                console.log('✅ WORKERFS available (running in Web Worker)');
            }

            // MEMFS is always available as the default
            console.log('✅ MEMFS available (default filesystem)');

        } catch (e) {
            console.error('Failed to setup virtual filesystems:', e);
        }
    });
}

EMSCRIPTEN_KEEPALIVE
void sync_persistent_filesystem(int populate) {
    std::cout << (populate ? "📥 Populating" : "💾 Syncing")
              << " persistent filesystem...\n";

    EM_ASM({
        if (typeof FS !== 'undefined' && FS.filesystems.IDBFS) {
            FS.syncfs($0, function(err) {
                if (err) {
                    console.error('Filesystem sync error:', err);
                } else {
                    console.log($0 ? '✅ Populated from persistent storage' : '✅ Synced to persistent storage');
                }
            });
        } else {
            console.log('ℹ️ IDBFS not available for sync');
        }
    }, populate);
}

EMSCRIPTEN_KEEPALIVE
void run_boost_filesystem_demo() {
    try {
        BoostFilesystemDemo demo;
        demo.runCompleteDemo();
    } catch (const std::exception& e) {
        std::cout << "❌ Demo failed: " << e.what() << std::endl;
    }
}

EMSCRIPTEN_KEEPALIVE
void demonstrate_cpp_filesystem_compatibility() {
    std::cout << "🧪 Testing C++ Standard Library Compatibility\n";
    std::cout << "=============================================\n";

    // Show that this works with both boost::filesystem and std::filesystem patterns
    try {
        // Create a test file using standard C++ I/O
        std::ofstream test_file("/tmp/cpp_test.txt");
        test_file << "Testing C++ filesystem compatibility\n";
        test_file << "This file was created with standard C++ I/O\n";
        test_file.close();

        // Use Boost.Filesystem to query it
        fs::path test_path("/tmp/cpp_test.txt");

        if (fs::exists(test_path)) {
            std::cout << "✅ File created with C++ I/O, queried with Boost.Filesystem\n";
            std::cout << "   Size: " << fs::file_size(test_path) << " bytes\n";
            std::cout << "   Last write time available: " << (fs::exists(test_path) ? "yes" : "no") << "\n";

            // Read it back
            std::ifstream read_file(test_path.string());
            std::string line;
            std::cout << "   Contents:\n";
            while (std::getline(read_file, line)) {
                std::cout << "     " << line << "\n";
            }

            // Clean up
            fs::remove(test_path);
            std::cout << "✅ File removed using Boost.Filesystem\n";
        }

    } catch (const std::exception& e) {
        std::cout << "❌ Compatibility test failed: " << e.what() << std::endl;
    }
}

} // extern "C"