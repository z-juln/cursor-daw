import { constants, promises as fs } from "fs";
import * as os from "os";
import * as path from "path";

export interface LibraryScore {
  name: string;
  relativePath: string;
  absolutePath: string;
}

export interface LibraryFolder {
  name: string;
  relativePath: string;
  absolutePath: string;
}

export interface LibraryDirectoryListing {
  folders: LibraryFolder[];
  scores: LibraryScore[];
}

export interface CreateScoreOptions {
  folder?: string;
  overwrite?: boolean;
}

export function defaultLibraryRoot(): string {
  return path.join(os.homedir(), ".cursor-daw");
}

function resolvedLibraryRoot(root: string): string {
  return path.resolve(root);
}

/** 解析并校验路径在谱库根目录内。 */
export function resolveInsideLibrary(root: string, relativePath: string): string {
  const resolvedRoot = resolvedLibraryRoot(root);
  const normalized = relativePath.split(/[\\/]+/).filter(Boolean).join(path.sep);
  const resolved = path.resolve(resolvedRoot, normalized || ".");
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("路径不在谱库目录内");
  }
  return resolved;
}

export function sanitizeFolderSegment(rawName: string): string {
  const sanitized = rawName.trim().replace(/[\/\\:*?"<>|]/g, "-");
  const withoutTrailingDots = sanitized.replace(/[.\s]+$/g, "");
  if (!withoutTrailingDots || /^-+$/.test(withoutTrailingDots)) {
    throw new Error("目录名称不能为空");
  }
  return withoutTrailingDots;
}

/** 规范化相对目录路径（不含文件名）。 */
export function sanitizeFolderPath(rawPath: string): string {
  if (!rawPath.trim()) return "";
  return rawPath
    .split(/[\\/]+/)
    .map((segment) => sanitizeFolderSegment(segment))
    .join("/");
}

export function sanitizeScoreName(rawName: string): string {
  const sanitized = rawName.trim().replace(/[\/\\:*?"<>|]/g, "-");
  const withoutTrailingDots = sanitized.replace(/[.\s]+$/g, "");
  if (!withoutTrailingDots || /^-+$/.test(withoutTrailingDots)) {
    throw new Error("鼓谱名称不能为空");
  }
  return withoutTrailingDots.toLowerCase().endsWith(".daw")
    ? withoutTrailingDots
    : `${withoutTrailingDots}.daw`;
}

export function resolveLibraryFile(root: string, folder: string, fileName: string): string {
  const safeFolder = sanitizeFolderPath(folder);
  const safeName = sanitizeScoreName(fileName);
  const resolvedRoot = resolvedLibraryRoot(root);
  const resolved = path.resolve(resolvedRoot, safeFolder.split("/").join(path.sep), safeName);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("非法鼓谱路径");
  }
  return resolved;
}

function assertInsideLibrary(root: string, target: string): string {
  const resolvedRoot = resolvedLibraryRoot(root);
  const resolvedTarget = path.resolve(target);
  if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("鼓谱不在谱库目录内");
  }
  return resolvedTarget;
}

async function copyBundledDrums(
  bundledExamplesDir: string,
  libraryRoot: string,
  relativeDir = "",
): Promise<string[]> {
  let entries: import("fs").Dirent[];
  const sourceDir = relativeDir
    ? path.join(bundledExamplesDir, relativeDir)
    : bundledExamplesDir;
  try {
    entries = await fs.readdir(sourceDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const copied: string[] = [];
  await Promise.all(entries.map(async (entry) => {
    const relPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      copied.push(...await copyBundledDrums(bundledExamplesDir, libraryRoot, relPath));
      return;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".daw")) return;
    const target = resolveInsideLibrary(libraryRoot, relPath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      await fs.copyFile(path.join(sourceDir, entry.name), target, constants.COPYFILE_EXCL);
      copied.push(relPath.split(path.sep).join("/"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }));
  return copied;
}

/** 递归复制扩展 examples 中缺失的 .daw，保留子目录结构。 */
export async function ensureLibrary(root: string, bundledExamplesDir: string): Promise<string[]> {
  await fs.mkdir(root, { recursive: true });
  const copied = await copyBundledDrums(bundledExamplesDir, root);
  return copied.sort();
}

export async function listLibraryDirectory(
  root: string,
  relativeDir = "",
): Promise<LibraryDirectoryListing> {
  const absoluteDir = resolveInsideLibrary(root, relativeDir || ".");
  const folders: LibraryFolder[] = [];
  const scores: LibraryScore[] = [];
  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { folders, scores };
    }
    throw error;
  }

  for (const entry of entries) {
    const absolutePath = path.join(absoluteDir, entry.name);
    const rel = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    const relativePath = rel.split(path.sep).join("/");
    if (entry.isDirectory()) {
      folders.push({ name: entry.name, relativePath, absolutePath });
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".daw") {
      scores.push({ name: entry.name, relativePath, absolutePath });
    }
  }

  folders.sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { numeric: true }));
  scores.sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { numeric: true }));
  return { folders, scores };
}

export async function listScores(root: string): Promise<LibraryScore[]> {
  const result: LibraryScore[] = [];
  async function walk(directory: string, relativeDir: string): Promise<void> {
    const listing = await listLibraryDirectory(root, relativeDir);
    result.push(...listing.scores);
    await Promise.all(listing.folders.map(async (folder) => {
      await walk(folder.absolutePath, folder.relativePath);
    }));
  }
  await walk(root, "");
  return result.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath, undefined, { numeric: true }));
}

export async function listAllFolders(root: string): Promise<string[]> {
  const folders: string[] = [];
  async function walk(relativeDir: string): Promise<void> {
    const listing = await listLibraryDirectory(root, relativeDir);
    for (const folder of listing.folders) {
      folders.push(folder.relativePath);
      await walk(folder.relativePath);
    }
  }
  await walk("");
  return folders.sort();
}

export async function readLibraryScore(root: string, target: string): Promise<string> {
  return fs.readFile(assertInsideLibrary(root, target), "utf8");
}

export async function createLibraryScore(
  root: string,
  name: string,
  content: string,
  options: CreateScoreOptions = {},
): Promise<string> {
  const target = resolveLibraryFile(root, options.folder ?? "", name);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, { flag: options.overwrite ? "w" : "wx" });
  return target;
}

export async function createLibraryFolder(root: string, relativePath: string): Promise<string> {
  const safePath = sanitizeFolderPath(relativePath);
  const target = resolveInsideLibrary(root, safePath || ".");
  await fs.mkdir(target, { recursive: true });
  return target;
}

/** 校验谱库内移动/重命名：禁止落到自身或子路径。同路径视为无操作。 */
export function assertLibraryMove(
  root: string,
  fromRelative: string,
  toRelative: string,
): void {
  const from = fromRelative.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const to = toRelative.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!from || !to) throw new Error("路径无效");
  resolveInsideLibrary(root, from);
  resolveInsideLibrary(root, to);
  if (from === to) return;
  if (to === from || to.startsWith(`${from}/`)) {
    throw new Error("不能移动到自身或子目录");
  }
}

export async function renameLibraryEntry(
  root: string,
  fromRelative: string,
  toRelative: string,
): Promise<string> {
  assertLibraryMove(root, fromRelative, toRelative);
  const from = resolveInsideLibrary(root, fromRelative);
  const to = resolveInsideLibrary(root, toRelative);
  if (path.resolve(from) === path.resolve(to)) return to;
  try {
    await fs.access(to, constants.F_OK);
    throw new Error("目标已存在");
  } catch (error) {
    if ((error as Error).message === "目标已存在") throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.rename(from, to);
  return to;
}

export async function isLibraryFolderEmpty(root: string, relativePath: string): Promise<boolean> {
  const target = resolveInsideLibrary(root, relativePath);
  const entries = await fs.readdir(target);
  return entries.length === 0;
}

export async function deleteLibraryFolder(root: string, relativePath: string): Promise<void> {
  const target = resolveInsideLibrary(root, relativePath);
  const stat = await fs.stat(target);
  if (!stat.isDirectory()) throw new Error("不是目录");
  await fs.rm(target, { recursive: true });
}

export async function deleteLibraryScore(root: string, target: string): Promise<void> {
  await fs.unlink(assertInsideLibrary(root, target));
}
