#!/bin/bash
# build-native.sh - Native Boost.Filesystem + Emscripten FS integration
#
# Copyright (c) Boost.org contributors
# Copyright (c) 2025 Superstruct Ltd, New Zealand
# Licensed under BSL-1.0

set -euo pipefail

VARIANT="${1:-all}"
BUILD_DIR="${BUILD_DIR:-./build-native}"
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

# Check prerequisites
check_prerequisites() {
    log_info "Checking build prerequisites..."

    if ! command -v emcc &> /dev/null; then
        log_error "Emscripten not found. Please install and activate EMSDK."
        exit 1
    fi

    # Check for boost.system.wasm dependency
    if [ ! -f "../boost.system.wasm/install/wasm/boost-system-side.wasm" ]; then
        log_warning "Building boost.system.wasm dependency..."
        cd ../boost.system.wasm && ./build-dual.sh side && cd -
    fi

    log_success "Prerequisites check completed"
}

# Build native integration SIDE_MODULE
build_side_module() {
    log_info "Building native Boost.Filesystem + Emscripten integration (SIDE_MODULE)..."
    mkdir -p "${BUILD_DIR}-side"
    cd "${BUILD_DIR}-side"

    # Core Boost.Filesystem sources (reduced set for essential functionality)
    BOOST_SOURCES="../src/directory.cpp ../src/exception.cpp ../src/operations.cpp ../src/path.cpp ../src/path_traits.cpp ../src/portability.cpp ../src/unique_path.cpp"

    # Native integration sources
    INTEGRATION_SOURCES="../src/boost_filesystem_emscripten.cpp ../src/emscripten_fs_backend.cpp"

    emcc ${BOOST_SOURCES} ${INTEGRATION_SOURCES} \
        -I../include \
        -I../../boost.system.wasm/include \
        -O3 -flto \
        -sSIDE_MODULE=2 \
        -sSTANDALONE_WASM=1 \
        -sWASM_BIGINT=1 \
        -sEXPORTED_FUNCTIONS='["_setup_virtual_filesystems","_sync_persistent_filesystem","_run_boost_filesystem_demo","_demonstrate_cpp_filesystem_compatibility","_boost_emscripten_setup","_boost_emscripten_demo_backends","_boost_emscripten_test_cross_fs","_boost_emscripten_sync_persistent","_boost_emscripten_get_fs_stats","_boost_emscripten_create_virtual_file","_handle_sync_complete"]' \
        -sASSERTIONS=0 \
        -sDISABLE_EXCEPTION_CATCHING=0 \
        -sUSE_BOOST_HEADERS=1 \
        -DBOOST_FILESYSTEM_NO_DEPRECATED=1 \
        -DBOOST_FILESYSTEM_STATIC_LINK=1 \
        -DBOOST_ALL_NO_LIB=1 \
        -DEMSCRIPTEN=1 \
        -o boost-filesystem-native-side.wasm

    # Install artifacts
    mkdir -p "${INSTALL_PREFIX}/wasm"
    cp boost-filesystem-native-side.wasm "${INSTALL_PREFIX}/wasm/"

    log_success "SIDE_MODULE: ${INSTALL_PREFIX}/wasm/boost-filesystem-native-side.wasm ($(stat -c%s "${INSTALL_PREFIX}/wasm/boost-filesystem-native-side.wasm" | numfmt --to=iec))"
    cd ..
}

# Build native integration MAIN_MODULE
build_main_module() {
    log_info "Building native Boost.Filesystem + Emscripten integration (MAIN_MODULE)..."
    mkdir -p "${BUILD_DIR}-main"
    cd "${BUILD_DIR}-main"

    # Core Boost.Filesystem sources + boost.system for static linking
    BOOST_SOURCES="../src/directory.cpp ../src/exception.cpp ../src/operations.cpp ../src/path.cpp ../src/path_traits.cpp ../src/portability.cpp ../src/unique_path.cpp"

    # Add boost.system WASM sources for static linking in MAIN_MODULE
    BOOST_SYSTEM_SOURCES="../../boost.system.wasm/wasm/boost_system_wasm.cpp"

    # Native integration sources
    INTEGRATION_SOURCES="../src/boost_filesystem_emscripten.cpp ../src/emscripten_fs_backend.cpp"

    emcc ${BOOST_SOURCES} ${BOOST_SYSTEM_SOURCES} ${INTEGRATION_SOURCES} \
        -I../include \
        -I../../boost.system.wasm/include \
        -O3 -flto \
        -sMODULARIZE=1 \
        -sEXPORT_ES6=1 \
        -sEXPORT_NAME="BoostFilesystemNativeModule" \
        -sEXPORTED_FUNCTIONS='["_setup_virtual_filesystems","_sync_persistent_filesystem","_run_boost_filesystem_demo","_demonstrate_cpp_filesystem_compatibility","_boost_emscripten_setup","_boost_emscripten_demo_backends","_boost_emscripten_test_cross_fs","_boost_emscripten_sync_persistent","_boost_emscripten_get_fs_stats","_boost_emscripten_create_virtual_file","_handle_sync_complete","_malloc","_free"]' \
        -sEXPORTED_RUNTIME_METHODS='["cwrap","ccall","UTF8ToString","stringToUTF8","lengthBytesUTF8","HEAPU8","FS","PATH"]' \
        -sALLOW_MEMORY_GROWTH=1 \
        -sINITIAL_MEMORY=67108864 \
        -sMAXIMUM_MEMORY=536870912 \
        -sWASM_BIGINT=1 \
        -sENVIRONMENT=web,webview,worker \
        -sNODEJS_CATCH_EXIT=0 \
        -sNODEJS_CATCH_REJECTION=0 \
        -sFORCE_FILESYSTEM=1 \
        -sEXTRA_EXPORTED_RUNTIME_METHODS='["FS"]' \
        -sUSE_BOOST_HEADERS=1 \
        -DBOOST_FILESYSTEM_NO_DEPRECATED=1 \
        -DBOOST_FILESYSTEM_STATIC_LINK=1 \
        -DBOOST_ALL_NO_LIB=1 \
        -DEMSCRIPTEN=1 \
        -o boost-filesystem-native-main.js

    # Install artifacts
    mkdir -p "${INSTALL_PREFIX}/wasm"
    cp boost-filesystem-native-main.js "${INSTALL_PREFIX}/wasm/"
    cp boost-filesystem-native-main.wasm "${INSTALL_PREFIX}/wasm/"

    log_success "MAIN_MODULE: ${INSTALL_PREFIX}/wasm/boost-filesystem-native-main.js ($(stat -c%s "${INSTALL_PREFIX}/wasm/boost-filesystem-native-main.wasm" | numfmt --to=iec))"
    cd ..
}

case "$VARIANT" in
    side) check_prerequisites && build_side_module ;;
    main) check_prerequisites && build_main_module ;;
    all) check_prerequisites && build_side_module && build_main_module ;;
    clean) rm -rf "${BUILD_DIR}"* "${INSTALL_PREFIX}" ;;
    *) echo "Usage: $0 [side|main|all|clean]"; exit 1 ;;
esac