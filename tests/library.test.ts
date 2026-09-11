import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import {
  createLibraryFolder,
  createLibraryScore,
  deleteLibraryFolder,
  ensureLibrary,
  listAllFolders,
  listLibraryDirectory,
  listScores,
  readLibraryScore,
  renameLibraryEntry,
  sanitizeScoreName,
} from "../src/library";

let temporaryRoot: string;

beforeEach(async () => {
  temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-drum-"));
});

afterEach(async () => {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
});

test("首次初始化递归复制 examples 子目录，再次初始化不覆盖", async () => {
  const bundledDir = path.join(temporaryRoot, "examples");
  const library = path.join(temporaryRoot, "library");
  await fs.mkdir(path.join(bundledDir, "styles/rock"), { recursive: true });
  await fs.writeFile(path.join(bundledDir, "backbeat.drum"), "first");
  await fs.writeFile(path.join(bundledDir, "styles/rock/a.drum"), "rock");
  expect(await ensureLibrary(library, bundledDir)).toEqual([
    "backbeat.drum",
    "styles/rock/a.drum",
  ]);
  await fs.writeFile(path.join(library, "backbeat.drum"), "mine");
  await fs.writeFile(path.join(bundledDir, "backbeat.drum"), "second");
  expect(await ensureLibrary(library, bundledDir)).toEqual([]);
  expect(await fs.readFile(path.join(library, "backbeat.drum"), "utf8")).toBe("mine");
  expect(await fs.readFile(path.join(library, "styles/rock/a.drum"), "utf8")).toBe("rock");
});

test("listLibraryDirectory 返回当前层目录与鼓谱", async () => {
  await fs.mkdir(path.join(temporaryRoot, "styles/rock"), { recursive: true });
  await fs.writeFile(path.join(temporaryRoot, "root.drum"), "");
  await fs.writeFile(path.join(temporaryRoot, "styles/rock/a.drum"), "");
  const rootListing = await listLibraryDirectory(temporaryRoot, "");
  expect(rootListing.folders.map((folder) => folder.relativePath)).toEqual(["styles"]);
  expect(rootListing.scores.map((score) => score.name)).toEqual(["root.drum"]);
  const nested = await listLibraryDirectory(temporaryRoot, "styles");
  expect(nested.folders.map((folder) => folder.relativePath)).toEqual(["styles/rock"]);
});

test("递归扫描仅返回 drum 并按相对路径排序", async () => {
  const nested = path.join(temporaryRoot, "z");
  await fs.mkdir(nested);
  await fs.writeFile(path.join(temporaryRoot, "b.drum"), "");
  await fs.writeFile(path.join(temporaryRoot, "a.txt"), "");
  await fs.writeFile(path.join(nested, "a.drum"), "");
  const files = await listScores(temporaryRoot);
  expect(files.map((file) => file.relativePath)).toEqual(["b.drum", "z/a.drum"]);
});

test("可在指定目录创建鼓谱", async () => {
  const created = await createLibraryScore(
    temporaryRoot,
    "groove",
    "kick |x...|",
    { folder: "styles/funk" },
  );
  expect(created).toBe(path.join(temporaryRoot, "styles/funk/groove.drum"));
  expect(await fs.readFile(created, "utf8")).toBe("kick |x...|");
});

test("目录可创建、重命名、删除", async () => {
  await createLibraryFolder(temporaryRoot, "styles/rock");
  expect(await listAllFolders(temporaryRoot)).toEqual(["styles", "styles/rock"]);
  await renameLibraryEntry(temporaryRoot, "styles/rock", "styles/hard-rock");
  expect(await listAllFolders(temporaryRoot)).toEqual(["styles", "styles/hard-rock"]);
  await deleteLibraryFolder(temporaryRoot, "styles/hard-rock");
  await deleteLibraryFolder(temporaryRoot, "styles");
  expect(await listAllFolders(temporaryRoot)).toEqual([]);
});

test("文件名被清洗并自动补后缀", () => {
  expect(sanitizeScoreName("  my:/beat  ")).toBe("my--beat.drum");
  expect(sanitizeScoreName("groove.drum")).toBe("groove.drum");
  expect(() => sanitizeScoreName(" / ")).toThrow();
});

test("读取鼓谱限制在谱库根目录内", async () => {
  const target = path.join(temporaryRoot, "groove.drum");
  await fs.writeFile(target, "kick |x...|");
  expect(await readLibraryScore(temporaryRoot, target)).toBe("kick |x...|");
  await expect(readLibraryScore(temporaryRoot, path.join(temporaryRoot, "..", "x.drum")))
    .rejects.toThrow();
});

test("创建文件只能落在谱库根目录", async () => {
  const created = await createLibraryScore(temporaryRoot, "../escape", "score");
  expect(created).toBe(path.join(temporaryRoot, "..-escape.drum"));
  expect(await fs.readFile(created, "utf8")).toBe("score");
});
