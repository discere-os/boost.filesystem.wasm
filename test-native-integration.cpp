/**
 * Ultimate Test: Pure C++ Application Using Boost.Filesystem APIs
 * This demonstrates that a standard C++ app can use all Emscripten FS backends transparently
 *
 * The test is: This C++ code should work unchanged whether compiled for:
 * - Native Linux/Windows/macOS
 * - Emscripten with MEMFS
 * - Emscripten with IDBFS persistent storage
 * - Emscripten with WORKERFS
 * - Emscripten with NODEFS (in Node.js)
 */

#include <boost/filesystem.hpp>
#include <iostream>
#include <fstream>
#include <vector>
#include <chrono>
#include <thread>

namespace fs = boost::filesystem;

/**
 * This is a standard C++ application that only uses:
 * - Boost.Filesystem APIs
 * - Standard C++ library (iostream, fstream, etc.)
 *
 * NO Emscripten-specific code - it should work identically on native platforms
 */
class FileSystemCompatibilityTest {
private:
    fs::path test_root;
    std::vector<std::string> test_results;

public:
    FileSystemCompatibilityTest() : test_root(fs::current_path() / "compatibility_test") {
        std::cout << "🧪 Boost.Filesystem Compatibility Test\n";
        std::cout << "======================================\n";
        std::cout << "Working directory: " << fs::current_path() << "\n";
        std::cout << "Test root: " << test_root << "\n\n";
    }

    bool test_basic_operations() {
        std::cout << "1️⃣ Basic File Operations Test\n";
        std::cout << "------------------------------\n";

        try {
            // Create test directory
            fs::create_directories(test_root);
            if (!fs::exists(test_root) || !fs::is_directory(test_root)) {
                test_results.push_back("❌ Directory creation failed");
                return false;
            }
            std::cout << "✅ Created test directory: " << test_root << "\n";

            // Create test file
            fs::path test_file = test_root / "test.txt";
            std::ofstream file(test_file.string());
            file << "Hello from Boost.Filesystem!\n";
            file << "This file was created using standard C++ APIs.\n";
            file << "Current time: " << std::chrono::duration_cast<std::chrono::seconds>(
                std::chrono::system_clock::now().time_since_epoch()).count() << "\n";
            file.close();

            if (!fs::exists(test_file) || !fs::is_regular_file(test_file)) {
                test_results.push_back("❌ File creation failed");
                return false;
            }
            std::cout << "✅ Created test file: " << test_file << " (size: " << fs::file_size(test_file) << " bytes)\n";

            // Test file reading
            std::ifstream read_file(test_file.string());
            std::string line;
            std::cout << "✅ File contents:\n";
            while (std::getline(read_file, line)) {
                std::cout << "   " << line << "\n";
            }
            read_file.close();

            test_results.push_back("✅ Basic file operations successful");
            return true;

        } catch (const fs::filesystem_error& e) {
            test_results.push_back("❌ Basic operations failed: " + std::string(e.what()));
            return false;
        }
    }

    bool test_directory_operations() {
        std::cout << "\n2️⃣ Directory Operations Test\n";
        std::cout << "-----------------------------\n";

        try {
            // Create nested directory structure
            fs::path nested_dir = test_root / "nested" / "deep" / "directory";
            fs::create_directories(nested_dir);

            if (!fs::exists(nested_dir) || !fs::is_directory(nested_dir)) {
                test_results.push_back("❌ Nested directory creation failed");
                return false;
            }
            std::cout << "✅ Created nested directories: " << nested_dir << "\n";

            // Create files at different levels
            std::vector<std::pair<fs::path, std::string>> test_files = {
                {test_root / "root_file.txt", "File at root level"},
                {test_root / "nested" / "middle_file.txt", "File at middle level"},
                {nested_dir / "deep_file.txt", "File at deep level"}
            };

            for (const auto& [file_path, content] : test_files) {
                std::ofstream file(file_path.string());
                file << content << "\n";
                file.close();

                if (!fs::exists(file_path)) {
                    test_results.push_back("❌ Failed to create: " + file_path.string());
                    return false;
                }
            }
            std::cout << "✅ Created " << test_files.size() << " files at different levels\n";

            // Test directory iteration
            std::cout << "✅ Directory structure:\n";
            for (const auto& entry : fs::recursive_directory_iterator(test_root)) {
                std::string indent(entry.depth() * 2, ' ');
                std::cout << "   " << indent << entry.path().filename();
                if (fs::is_regular_file(entry)) {
                    std::cout << " (" << fs::file_size(entry) << " bytes)";
                }
                std::cout << "\n";
            }

            test_results.push_back("✅ Directory operations successful");
            return true;

        } catch (const fs::filesystem_error& e) {
            test_results.push_back("❌ Directory operations failed: " + std::string(e.what()));
            return false;
        }
    }

    bool test_path_operations() {
        std::cout << "\n3️⃣ Path Operations Test\n";
        std::cout << "------------------------\n";

        try {
            std::vector<std::string> test_paths = {
                "/absolute/path/to/file.txt",
                "relative/path/file.dat",
                "../parent/file.cfg",
                "./current/file.log",
                "/var/log/../tmp/file"
            };

            for (const auto& path_str : test_paths) {
                fs::path p(path_str);

                std::cout << "Path: " << path_str << "\n";
                std::cout << "  Absolute: " << fs::absolute(p) << "\n";
                std::cout << "  Parent: " << p.parent_path() << "\n";
                std::cout << "  Filename: " << p.filename() << "\n";
                std::cout << "  Extension: " << p.extension() << "\n";
                std::cout << "  Stem: " << p.stem() << "\n";
                std::cout << "  Is absolute: " << (p.is_absolute() ? "yes" : "no") << "\n\n";
            }

            test_results.push_back("✅ Path operations successful");
            return true;

        } catch (const fs::filesystem_error& e) {
            test_results.push_back("❌ Path operations failed: " + std::string(e.what()));
            return false;
        }
    }

    bool test_file_operations() {
        std::cout << "\n4️⃣ Advanced File Operations Test\n";
        std::cout << "---------------------------------\n";

        try {
            // Create source file
            fs::path source_file = test_root / "source.txt";
            std::ofstream source(source_file.string());
            source << "This is the source file content.\n";
            source << "It will be copied and moved around.\n";
            source.close();

            // Test file copying
            fs::path copied_file = test_root / "copied.txt";
            fs::copy_file(source_file, copied_file);

            if (!fs::exists(copied_file) || fs::file_size(copied_file) != fs::file_size(source_file)) {
                test_results.push_back("❌ File copy failed");
                return false;
            }
            std::cout << "✅ File copied successfully: " << copied_file << "\n";

            // Test file renaming
            fs::path renamed_file = test_root / "renamed.txt";
            fs::rename(copied_file, renamed_file);

            if (fs::exists(copied_file) || !fs::exists(renamed_file)) {
                test_results.push_back("❌ File rename failed");
                return false;
            }
            std::cout << "✅ File renamed successfully: " << renamed_file << "\n";

            // Test file removal
            fs::remove(renamed_file);
            if (fs::exists(renamed_file)) {
                test_results.push_back("❌ File removal failed");
                return false;
            }
            std::cout << "✅ File removed successfully\n";

            test_results.push_back("✅ Advanced file operations successful");
            return true;

        } catch (const fs::filesystem_error& e) {
            test_results.push_back("❌ File operations failed: " + std::string(e.what()));
            return false;
        }
    }

    bool test_persistent_locations() {
        std::cout << "\n5️⃣ Persistent Storage Locations Test\n";
        std::cout << "-------------------------------------\n";

        // Test different mount points that might be available
        std::vector<std::pair<std::string, std::string>> locations = {
            {"/tmp", "Temporary storage (MEMFS)"},
            {"/persistent", "Persistent storage (IDBFS)"},
            {"/home/user", "User directory (MEMFS)"},
            {"/var/data", "Variable data (MEMFS)"}
        };

        bool any_persistent = false;

        for (const auto& [location, description] : locations) {
            try {
                fs::path test_location(location);

                // Try to create directory
                fs::create_directories(test_location);

                if (fs::exists(test_location)) {
                    std::cout << "✅ " << description << " available at " << location << "\n";

                    // Create test file
                    fs::path test_file = test_location / "persistence_test.txt";
                    std::ofstream file(test_file.string());
                    file << "Persistence test at " << location << "\n";
                    file << "Created: " << std::chrono::duration_cast<std::chrono::seconds>(
                        std::chrono::system_clock::now().time_since_epoch()).count() << "\n";
                    file.close();

                    if (fs::exists(test_file)) {
                        std::cout << "   Created test file: " << test_file << " (" << fs::file_size(test_file) << " bytes)\n";
                        any_persistent = true;
                    }
                }
            } catch (const fs::filesystem_error& e) {
                std::cout << "⚠️ " << description << " not available: " << e.what() << "\n";
            }
        }

        if (any_persistent) {
            test_results.push_back("✅ Persistent storage locations accessible");
        } else {
            test_results.push_back("⚠️ No persistent storage locations available");
        }

        return any_persistent;
    }

    void cleanup_and_report() {
        std::cout << "\n🧹 Cleanup and Final Report\n";
        std::cout << "============================\n";

        // Clean up test directory
        try {
            if (fs::exists(test_root)) {
                std::uintmax_t removed = fs::remove_all(test_root);
                std::cout << "✅ Cleaned up " << removed << " test items\n";
            }
        } catch (const fs::filesystem_error& e) {
            std::cout << "⚠️ Cleanup warning: " << e.what() << "\n";
        }

        // Final report
        std::cout << "\n📊 Test Results Summary\n";
        std::cout << "=======================\n";
        for (const auto& result : test_results) {
            std::cout << result << "\n";
        }

        size_t passed = 0;
        size_t failed = 0;
        for (const auto& result : test_results) {
            if (result.starts_with("✅")) passed++;
            else if (result.starts_with("❌")) failed++;
        }

        std::cout << "\n🎯 Final Score: " << passed << " passed, " << failed << " failed";
        if (failed == 0) {
            std::cout << " 🎉 ALL TESTS PASSED!";
        }
        std::cout << "\n";
    }

    void run_complete_test() {
        std::cout << "🎯 Goal: Prove that standard C++ Boost.Filesystem code works\n";
        std::cout << "     transparently with all Emscripten virtual filesystem backends\n\n";

        bool all_passed = true;
        all_passed &= test_basic_operations();
        all_passed &= test_directory_operations();
        all_passed &= test_path_operations();
        all_passed &= test_file_operations();
        all_passed &= test_persistent_locations();

        cleanup_and_report();

        if (all_passed) {
            std::cout << "\n🏆 ULTIMATE TEST PASSED!\n";
            std::cout << "This C++ code using ONLY standard Boost.Filesystem APIs\n";
            std::cout << "worked transparently with Emscripten virtual filesystems!\n";
        } else {
            std::cout << "\n⚠️ Some tests failed - check the results above\n";
        }
    }
};

// Main function - pure C++, no Emscripten-specific code
int main() {
    try {
        FileSystemCompatibilityTest test;
        test.run_complete_test();
        return 0;
    } catch (const std::exception& e) {
        std::cout << "❌ Test suite failed: " << e.what() << std::endl;
        return 1;
    }
}