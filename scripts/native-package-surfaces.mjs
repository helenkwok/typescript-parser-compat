import * as currentNativeAst from "@typescript/native/unstable/ast";
import { API as CurrentNativeAPI } from "@typescript/native/unstable/sync";

import * as previewNativeAst from "@typescript/native-preview/unstable/ast";
import { createVirtualFileSystem as createPreviewVirtualFileSystem } from "@typescript/native-preview/unstable/fs";
import { API as PreviewNativeAPI } from "@typescript/native-preview/unstable/sync";

export const nativePackageSurfaces = [
  {
    id: "current-native",
    packageName: "@typescript/native",
    primary: true,
    nativeAstModule: currentNativeAst,
    ApiClass: CurrentNativeAPI,
    createFs: undefined,
  },
  {
    id: "native-preview",
    packageName: "@typescript/native-preview",
    primary: false,
    nativeAstModule: previewNativeAst,
    ApiClass: PreviewNativeAPI,
    createFs: createPreviewVirtualFileSystem,
  },
];

export const primaryNativeSurface = nativePackageSurfaces.find(
  (surface) => surface.primary,
);

if (!primaryNativeSurface) {
  throw new Error("No primary TypeScript native package surface configured");
}
