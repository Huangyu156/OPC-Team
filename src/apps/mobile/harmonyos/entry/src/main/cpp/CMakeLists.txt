cmake_minimum_required(VERSION 3.5.0)
project(opc_crypto)

# Argon2 is a shared, platform-neutral source set. HarmonyOS and the KMP iOS
# actual both build this same implementation; keep the algorithm out of either
# platform directory so the two copies cannot drift.
set(OPC_ARGON2_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../../../shared/argon2)

add_library(opc_crypto SHARED
  napi_argon2.cpp
  ${OPC_ARGON2_DIR}/argon2.c
  ${OPC_ARGON2_DIR}/core.c
  ${OPC_ARGON2_DIR}/encoding.c
  ${OPC_ARGON2_DIR}/ref.c
  ${OPC_ARGON2_DIR}/run.c
  ${OPC_ARGON2_DIR}/thread.c
  ${OPC_ARGON2_DIR}/blake2/blake2b.c
)

target_include_directories(opc_crypto PRIVATE ${OPC_ARGON2_DIR})
target_compile_definitions(opc_crypto PRIVATE A2_VISCTL)
target_link_libraries(opc_crypto PUBLIC libace_napi.z.so)
