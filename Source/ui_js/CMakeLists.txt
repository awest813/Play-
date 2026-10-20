cmake_minimum_required(VERSION 3.18)

set(CMAKE_MODULE_PATH
	${CMAKE_CURRENT_SOURCE_DIR}/../../deps/Dependencies/cmake-modules
	${CMAKE_MODULE_PATH}
)
include(Header)

project(Play)

if(NOT TARGET PlayCore)
	add_subdirectory(
		${CMAKE_CURRENT_SOURCE_DIR}/../
		${CMAKE_CURRENT_BINARY_DIR}/Source
	)
endif()
list(APPEND UI_JS_PROJECT_LIBS PlayCore)

if(NOT TARGET ui_shared)
	add_subdirectory(
		${CMAKE_CURRENT_SOURCE_DIR}/../ui_shared
		${CMAKE_CURRENT_BINARY_DIR}/ui_shared
	)
endif()
list(APPEND UI_JS_PROJECT_LIBS ui_shared)

if(NOT TARGET gsh_opengl)
	add_subdirectory(
		${CMAKE_CURRENT_SOURCE_DIR}/../gs/GSH_OpenGL
		${CMAKE_CURRENT_BINARY_DIR}/gs/GSH_OpenGL
	)
endif()
list(APPEND UI_JS_PROJECT_LIBS gsh_opengl)

if(NOT TARGET sh_openal)
	add_subdirectory(
		${CMAKE_CURRENT_SOURCE_DIR}/../sound/SH_OpenAL
		${CMAKE_CURRENT_BINARY_DIR}/SH_OpenAL
	)
endif()
list(APPEND UI_JS_PROJECT_LIBS sh_openal)

add_executable(Play
	GSH_OpenGLJs.cpp
	GSH_OpenGLJs.h
	InputProviderEmscripten.cpp
	InputProviderEmscripten.h
	Main.cpp
	Ps2VmJs.cpp
	Ps2VmJs.h
)
target_link_libraries(Play PUBLIC ${UI_JS_PROJECT_LIBS})

target_link_options(Play PRIVATE "--bind")
target_link_options(Play PRIVATE "-sMODULARIZE=1")
target_link_options(Play PRIVATE "-sEXPORT_ES6=1")
target_link_options(Play PRIVATE "-sUSE_ES6_IMPORT_META=0")
target_link_options(Play PRIVATE "-sEXPORTED_FUNCTIONS=['_main', '_initVm', '_EmptyBlockHandler', '_MemoryUtils_GetByteProxy', '_MemoryUtils_GetHalfProxy', '_MemoryUtils_GetWordProxy', '_MemoryUtils_GetDoubleProxy', '_MemoryUtils_SetByteProxy', '_MemoryUtils_SetHalfProxy', '_MemoryUtils_SetWordProxy', '_MemoryUtils_SetDoubleProxy', '_LWL_Proxy', '_LWR_Proxy', '_LDL_Proxy', '_LDR_Proxy', '_SWL_Proxy', '_SWR_Proxy', '_SDL_Proxy', '_SDR_Proxy']")
target_link_options(Play PRIVATE "-sEXPORTED_RUNTIME_METHODS=['ccall', 'FS']")
target_link_options(Play PRIVATE "-sFORCE_FILESYSTEM")
# Memory cards and save states live under the personal data path. IDBFS mirrors
# that directory into IndexedDB. FORCE_FILESYSTEM does not link IDBFS itself.
target_link_options(Play PRIVATE "-lidbfs.js")
target_link_options(Play PRIVATE "-sALLOW_TABLE_GROWTH")
# The default heap is 16MB. EE RAM alone is 32MB, so boot copies the
# SharedArrayBuffer several times as it grows. Start at 256MB, a size a
# cross-origin-isolated desktop browser can allocate, and allow growth up to
# 1GB for the JIT cache. A low-memory tab can still fail to instantiate.
target_link_options(Play PRIVATE "-sINITIAL_MEMORY=268435456")
target_link_options(Play PRIVATE "-sMAXIMUM_MEMORY=1073741824")
target_link_options(Play PRIVATE "-sALLOW_MEMORY_GROWTH")
#target_link_options(Play PRIVATE "-sASSERTIONS=2")
target_link_options(Play PRIVATE "-sEXPORT_NAME=Play")
target_link_options(Play PRIVATE "-sPTHREAD_POOL_SIZE=2")
target_link_options(Play PRIVATE "-sWASM_BIGINT")
# The GS thread owns #outputCanvas as an OffscreenCanvas and issues WebGL there.
# OFFSCREEN_FRAMEBUFFER would proxy every GL call back to the browser main thread.
target_link_options(Play PRIVATE "-sOFFSCREENCANVAS_SUPPORT=1")
target_link_options(Play PRIVATE "-sENVIRONMENT=web,worker")
target_link_options(Play PRIVATE "-sUSE_WEBGL2=1")
