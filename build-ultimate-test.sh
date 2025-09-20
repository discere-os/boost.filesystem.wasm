#!/bin/bash
# build-ultimate-test.sh - Build the ultimate compatibility test
#
# Builds a pure C++ application using only Boost.Filesystem APIs
# that works transparently with all Emscripten virtual filesystem backends

set -euo pipefail

VARIANT="${1:-test}"
BUILD_DIR="${BUILD_DIR:-./build-test}"
INSTALL_PREFIX="${INSTALL_PREFIX:-./install}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Build the ultimate test as standalone MAIN_MODULE
build_ultimate_test() {
    log_info "Building ultimate C++ compatibility test..."
    mkdir -p "${BUILD_DIR}"
    cd "${BUILD_DIR}"

    # Essential Boost.Filesystem sources only
    BOOST_FS_SOURCES="../src/directory.cpp ../src/exception.cpp ../src/operations.cpp ../src/path.cpp ../src/path_traits.cpp ../src/portability.cpp ../src/unique_path.cpp"

    # Boost.System sources for static linking
    BOOST_SYS_SOURCES="../../boost.system.wasm/wasm/boost_system_wasm.cpp"

    # Integration layer
    INTEGRATION_SOURCES="../src/boost_filesystem_emscripten.cpp ../src/emscripten_fs_backend.cpp"

    # Pure C++ test application
    TEST_APP="../test-native-integration.cpp"

    log_info "Compiling with native Boost.Filesystem + Emscripten FS integration..."

    emcc ${BOOST_FS_SOURCES} ${BOOST_SYS_SOURCES} ${INTEGRATION_SOURCES} ${TEST_APP} \
        -I../include \
        -I../../boost.system.wasm/include \
        -O3 -flto \
        -sMODULARIZE=1 \
        -sEXPORT_ES6=1 \
        -sEXPORT_NAME="BoostFilesystemTestModule" \
        -sEXPORTED_FUNCTIONS='["_main","_setup_virtual_filesystems","_sync_persistent_filesystem","_run_boost_filesystem_demo","_demonstrate_cpp_filesystem_compatibility","_boost_emscripten_setup","_boost_emscripten_demo_backends","_boost_emscripten_test_cross_fs","_boost_emscripten_sync_persistent","_boost_emscripten_get_fs_stats","_boost_emscripten_create_virtual_file","_handle_sync_complete","_malloc","_free"]' \
        -sEXPORTED_RUNTIME_METHODS='["cwrap","ccall","UTF8ToString","stringToUTF8","lengthBytesUTF8","HEAPU8","FS","PATH"]' \
        -sALLOW_MEMORY_GROWTH=1 \
        -sINITIAL_MEMORY=67108864 \
        -sMAXIMUM_MEMORY=536870912 \
        -sWASM_BIGINT=1 \
        -sENVIRONMENT=web,webview,worker \
        -sNODEJS_CATCH_EXIT=0 \
        -sNODEJS_CATCH_REJECTION=0 \
        -sFORCE_FILESYSTEM=1 \
        -sINVOKE_RUN=0 \
        -sEXIT_RUNTIME=1 \
        -sEXTRA_EXPORTED_RUNTIME_METHODS='["callMain"]' \
        -DBOOST_FILESYSTEM_NO_DEPRECATED=1 \
        -DBOOST_FILESYSTEM_STATIC_LINK=1 \
        -DBOOST_ALL_NO_LIB=1 \
        -DEMSCRIPTEN=1 \
        -o boost-filesystem-test.js

    # Install artifacts
    mkdir -p "${INSTALL_PREFIX}/test"
    cp boost-filesystem-test.js "${INSTALL_PREFIX}/test/"
    cp boost-filesystem-test.wasm "${INSTALL_PREFIX}/test/"

    log_success "Ultimate test: ${INSTALL_PREFIX}/test/boost-filesystem-test.js ($(stat -c%s "${INSTALL_PREFIX}/test/boost-filesystem-test.wasm" | numfmt --to=iec))"
    cd ..
}

# Build standalone demo that can be run directly
build_demo_executable() {
    log_info "Building standalone demo executable..."
    mkdir -p "${BUILD_DIR}-demo"
    cd "${BUILD_DIR}-demo"

    # Same sources as test but with different main
    BOOST_FS_SOURCES="../src/directory.cpp ../src/exception.cpp ../src/operations.cpp ../src/path.cpp ../src/path_traits.cpp ../src/portability.cpp ../src/unique_path.cpp"
    BOOST_SYS_SOURCES="../../boost.system.wasm/wasm/boost_system_wasm.cpp"
    INTEGRATION_SOURCES="../src/boost_filesystem_emscripten.cpp ../src/emscripten_fs_backend.cpp"

    # Create demo main that calls all functions
    cat > demo_main.cpp << 'EOF'
#include <emscripten.h>
extern "C" {
    void setup_virtual_filesystems();
    void run_boost_filesystem_demo();
    void demonstrate_cpp_filesystem_compatibility();
    void boost_emscripten_setup();
    void boost_emscripten_demo_backends();
    void boost_emscripten_test_cross_fs();
}

int main() {
    printf("🚀 Starting Boost.Filesystem Emscripten Integration Demo\n");

    // Setup filesystem environment
    setup_virtual_filesystems();
    boost_emscripten_setup();

    // Run demos
    boost_emscripten_demo_backends();
    run_boost_filesystem_demo();
    demonstrate_cpp_filesystem_compatibility();
    boost_emscripten_test_cross_fs();

    printf("✅ Demo completed successfully!\n");
    return 0;
}
EOF

    emcc ${BOOST_FS_SOURCES} ${BOOST_SYS_SOURCES} ${INTEGRATION_SOURCES} demo_main.cpp \
        -I../include \
        -I../../boost.system.wasm/include \
        -O3 -flto \
        -sMODULARIZE=1 \
        -sEXPORT_ES6=1 \
        -sEXPORT_NAME="BoostFilesystemDemoModule" \
        -sEXPORTED_FUNCTIONS='["_main"]' \
        -sEXPORTED_RUNTIME_METHODS='["callMain","FS","PATH"]' \
        -sALLOW_MEMORY_GROWTH=1 \
        -sWASM_BIGINT=1 \
        -sENVIRONMENT=web,webview,worker \
        -sFORCE_FILESYSTEM=1 \
        -sINVOKE_RUN=0 \
        -sEXIT_RUNTIME=1 \
        -DBOOST_FILESYSTEM_NO_DEPRECATED=1 \
        -DBOOST_FILESYSTEM_STATIC_LINK=1 \
        -DBOOST_ALL_NO_LIB=1 \
        -DEMSCRIPTEN=1 \
        -o boost-filesystem-demo.js

    mkdir -p "${INSTALL_PREFIX}/demo"
    cp boost-filesystem-demo.js "${INSTALL_PREFIX}/demo/"
    cp boost-filesystem-demo.wasm "${INSTALL_PREFIX}/demo/"

    log_success "Demo executable: ${INSTALL_PREFIX}/demo/boost-filesystem-demo.js"
    cd ..
}

case "$VARIANT" in
    test) build_ultimate_test ;;
    demo) build_demo_executable ;;
    all) build_ultimate_test && build_demo_executable ;;
    clean) rm -rf "${BUILD_DIR}"* "${INSTALL_PREFIX}/test" "${INSTALL_PREFIX}/demo" ;;
    *) echo "Usage: $0 [test|demo|all|clean]"; exit 1 ;;
esac