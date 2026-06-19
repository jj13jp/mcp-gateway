import { expect, test } from "vitest";
import { resolveToolChoice } from "./tool-choice.js";

const names = ["filesystem__read_file", "brave__web_search"];

// OLD: server名の名指しで強制する → NEW: server名だけでは強制しない
test("server名だけでは強制しない（auto を返す）", () => {
  expect(resolveToolChoice("braveを使って東京の天気を調べて", names)).toBe("auto");
});

test("server名だけでは強制しない（大文字）", () => {
  expect(resolveToolChoice("use FILESYSTEM please", names)).toBe("auto");
});

test("tool名（bare）をトークン境界で強制する", () => {
  expect(resolveToolChoice("read_file で中身を見せて", names)).toEqual({
    type: "function",
    function: { name: "filesystem__read_file" },
  });
});

test("tool名（bare）が日本語に隣接してもトークン境界で強制する", () => {
  expect(resolveToolChoice("read_fileで読んで", names)).toEqual({
    type: "function",
    function: { name: "filesystem__read_file" },
  });
});

test("修飾名（qualified）をトークン境界で強制する", () => {
  expect(resolveToolChoice("use brave__web_search now", names)).toEqual({
    type: "function",
    function: { name: "brave__web_search" },
  });
});

test("tool名が大きな識別子の一部である場合は強制しない", () => {
  // "read" は "thread" の中に含まれるが token 境界なし
  const fsNames = ["fs__read"];
  expect(resolveToolChoice("thread the needle", fsNames)).toBe("auto");
});

test("該当なしは auto", () => {
  expect(resolveToolChoice("こんにちは", names)).toBe("auto");
});
