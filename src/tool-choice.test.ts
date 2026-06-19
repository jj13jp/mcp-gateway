import { expect, test } from "vitest";
import { resolveToolChoice } from "./tool-choice.js";

const names = ["filesystem__read_file", "brave__web_search"];

test("server名の名指しで強制する", () => {
  expect(resolveToolChoice("braveを使って東京の天気を調べて", names)).toEqual({
    type: "function",
    function: { name: "brave__web_search" },
  });
});

test("tool名の名指しで強制する", () => {
  expect(resolveToolChoice("read_file で中身を見せて", names)).toEqual({
    type: "function",
    function: { name: "filesystem__read_file" },
  });
});

test("大小文字を無視する", () => {
  expect(resolveToolChoice("use FILESYSTEM please", names)).toEqual({
    type: "function",
    function: { name: "filesystem__read_file" },
  });
});

test("該当なしは auto", () => {
  expect(resolveToolChoice("こんにちは", names)).toBe("auto");
});
