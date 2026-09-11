import { constants, promises as fs } from "fs";
import * as os from "os";
import * as path from "path";

export interface LibraryScore {
  name: string;
  relativePath: string;
  absolutePath: string;
}

export function defaultLibraryRoot(): string {
  return path.join(os.homedir(), ".cursor-drum");
}

/** 将扩展内置 examples 目录中缺失的 .drum 复制到谱库，已存在的不覆盖。返回新复制的文件名。 */
export async function ensureLibrary(root: string, bundledExamplesDir: string): Promise<string[]> {
  await fs.mkdir(root, { recursive: true });
  let entries: string[];
  try {
    entries = await fs.readdir(bundledExamplesDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const copied: string[] = [];
  await Promise.all(
    entries
      .filter((name) => name.toLowerCase().endsWith(".drum"))
      .map(async (name) => {
        try {
          await fs.copyFile(
            path.join(bundledExamplesDir, name),
            path.join(root, name),
            constants.COPYFILE_EXCL,
          );
          copied.push(name);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }
      }),
  );
  return copied.sort();
}

export async function listScores(root: string): Promise<LibraryScore[]> {
  const result: LibraryScore[] = [];
  async function walk(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".drum") {
        const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
        result.push({ name: entry.name, relativePath, absolutePath });
      }
    }));
  }
  try {
    await walk(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return result.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath, undefined, { numeric: true }));
}

export function sanitizeScoreName(rawName: string): string {
  const sanitized = rawName.trim().replace(/[\/\\:*?"<>|]/g, "-");
  const withoutTrailingDots = sanitized.replace(/[.\s]+$/g, "");
  if (!withoutTrailingDots || /^-+$/.test(withoutTrailingDots)) {
    throw new Error("鼓谱名称不能为空");
  }
  return withoutTrailingDots.toLowerCase().endsWith(".drum")
    ? withoutTrailingDots
    : `${withoutTrailingDots}.drum`;
}

function safeLibraryPath(root: string, fileName: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, sanitizeScoreName(fileName));
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("非法鼓谱路径");
  }
  return resolved;
}

function assertInsideLibrary(root: string, target: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("鼓谱不在谱库目录内");
  }
  return resolvedTarget;
}

export async function readLibraryScore(root: string, target: string): Promise<string> {
  return fs.readFile(assertInsideLibrary(root, target), "utf8");
}

export async function createLibraryScore(
  root: string,
  name: string,
  content: string,
  overwrite = false,
): Promise<string> {
  await fs.mkdir(root, { recursive: true });
  const target = safeLibraryPath(root, name);
  await fs.writeFile(target, content, { flag: overwrite ? "w" : "wx" });
  return target;
}

export async function deleteLibraryScore(root: string, target: string): Promise<void> {
  await fs.unlink(assertInsideLibrary(root, target));
}
