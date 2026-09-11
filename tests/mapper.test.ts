import { columnToStep, stepToColumn } from "../src/mapper";

const line = "kick   |x...x...|x...x...|";

test("列映射忽略乐器名和小节线", () => {
  const first = line.indexOf("x");
  expect(columnToStep(line, 0)).toBe(0);
  expect(columnToStep(line, first + 1)).toBe(1);
  expect(columnToStep(line, line.lastIndexOf("|x") + 1)).toBe(8);
});

test("step 映射落到格子字符而非小节线", () => {
  expect(line[stepToColumn(line, 0)]).toBe("x");
  expect(line[stepToColumn(line, 4)]).toBe("x");
  expect(line[stepToColumn(line, 8)]).toBe("x");
});
