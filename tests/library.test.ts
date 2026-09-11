import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import {
  createLibraryScore,
  ensureLibrary,
  listScores,
  readLibraryScore,
  sanitizeScoreName,
} from "../src/library";

let temporaryRoot: string;

beforeEach(async () => {
  temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-drum-"));
});

afterEach(async () => {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
});

test("首次初始化复制 examples 目录，再次初始化不覆盖", async () => {
  const bundledDir = path.join(temporaryRoot, "examples");
  const library = path.join(temporaryRoot, "library");
  await fs.mkdir(bundledDir);
  await fs.writeFile(path.join(bundledDir, "backbeat.drum"), "first");
  await fs.writeFile(path.join(bundledDir, "funk.drum"), "funk");
  await ensureLibrary(library, bundledDir);
  await fs.writeFile(path.join(library, "backbeat.drum"), "mine");
  await fs.writeFile(path.join(bundledDir, "backbeat.drum"), "second");
  await ensureLibrary(library, bundledDir);
  expect(await fs.readFile(path.join(library, "backbeat.drum"), "utf8")).toBe("mine");
  expect(await fs.readFile(path.join(library, "funk.drum"), "utf8")).toBe("funk");
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
