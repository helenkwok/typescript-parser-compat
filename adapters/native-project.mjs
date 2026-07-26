import { API } from "@typescript/native-preview/unstable/sync";
import { createVirtualFileSystem } from "@typescript/native-preview/unstable/fs";

function normalizePath(fileName) {
  return fileName.startsWith("/") ? fileName : `/${fileName}`;
}

export function createNativeProject(files, compilerOptions = {}) {
  const normalizedFiles = Object.fromEntries(
    Object.entries(files).map(([fileName, text]) => [normalizePath(fileName), text]),
  );
  const sourceFiles = Object.keys(normalizedFiles);
  const fs = createVirtualFileSystem({
    "/tsconfig.json": JSON.stringify({
      compilerOptions: {
        allowJs: true,
        checkJs: false,
        experimentalDecorators: true,
        jsx: "preserve",
        noLib: true,
        skipLibCheck: true,
        ...compilerOptions,
      },
      files: sourceFiles,
    }),
    ...normalizedFiles,
  });

  const api = new API({ cwd: "/", fs });

  try {
    const snapshot = api.updateSnapshot({ openProject: "/tsconfig.json" });
    const project = snapshot.getProject("/tsconfig.json");
    if (!project) {
      throw new Error("Native preview did not create the virtual project");
    }

    return {
      api,
      snapshot,
      project,
      getSourceFile(fileName) {
        const normalized = normalizePath(fileName);
        const sourceFile = project.program.getSourceFile(normalized);
        if (!sourceFile) {
          throw new Error(`Native preview did not load ${normalized}`);
        }
        return sourceFile;
      },
      close() {
        api.close();
      },
    };
  } catch (error) {
    api.close();
    throw error;
  }
}

export function withNativeProject(files, callback, compilerOptions = {}) {
  const context = createNativeProject(files, compilerOptions);
  try {
    return callback(context);
  } finally {
    context.close();
  }
}
