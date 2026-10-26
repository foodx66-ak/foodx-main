import assert from "node:assert/strict";
import { describe, it } from "node:test";

const DETAIL_RE =
  /^- (\d{4}-\d{2}-\d{2})｜([^｜\n]+)｜([^：\n]+)：(.+)\n {2}出典：(https:\/\/\S+)（公開日：(\d{4}-\d{2}(?:-\d{2})?)）$/;

describe("industry news detail format", () => {
  it("accepts the canonical two-line item", () => {
    const raw =
      "- 2026-10-26｜人件費｜最低賃金の改定：全国加重平均が引き上げられた。発効は都道府県ごとに順次。\n" +
      "  出典：https://www.example.go.jp/path（公開日：2026-10-01）";
    assert.match(raw, DETAIL_RE);
  });

  it("rejects missing source line", () => {
    const raw = "- 2026-10-26｜人件費｜見出し：要約だけ";
    assert.equal(DETAIL_RE.test(raw), false);
  });
});
