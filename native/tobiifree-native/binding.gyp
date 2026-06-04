{
  "targets": [
    {
      "target_name": "tobiifree_native",
      "sources": [
        "src/addon.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_CPP_EXCEPTIONS"
      ],
      "cflags_cc": [
        "-std=c++20",
        "-fexceptions"
      ],
      "xcode_settings": {
        "MACOSX_DEPLOYMENT_TARGET": "12.0",
        "CLANG_CXX_LANGUAGE_STANDARD": "c++20",
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES"
      }
    }
  ]
}
