import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { maskPii } from "./mask.js";

describe("maskPii", () => {
  it("masks halfwidth mobile numbers with hyphens", () => {
    assert.equal(maskPii("連絡先は090-1234-5678です"), "連絡先は［電話］です");
  });

  it("masks mobile numbers without separators", () => {
    assert.equal(maskPii("09012345678へ電話"), "［電話］へ電話");
  });

  it("masks landline with area code", () => {
    assert.equal(maskPii("03-1234-5678"), "［電話］");
  });

  it("masks +81 international form", () => {
    assert.equal(maskPii("+81-90-1234-5678"), "［電話］");
  });

  it("masks fullwidth digits and long vowel dash", () => {
    assert.equal(maskPii("電話：０９０ー１２３４ー５６７８"), "電話：［電話］");
  });

  it("masks email addresses", () => {
    assert.equal(maskPii("mail: owner@example.co.jp です"), "mail: ［メール］ です");
  });

  it("masks https URLs", () => {
    assert.equal(maskPii("詳細は https://example.com/path?x=1 を見て"), "詳細は ［URL］ を見て");
  });

  it("masks postal codes with and without 〒", () => {
    assert.equal(maskPii("〒150-0043 渋谷"), "［郵便番号］ 渋谷");
    assert.equal(maskPii("郵便 1500043 付近"), "郵便 ［郵便番号］ 付近");
  });

  it("masks fullwidth postal codes", () => {
    assert.equal(maskPii("〒１５０−００４３"), "［郵便番号］");
  });

  it("does not treat short numbers as phone", () => {
    const text = "売上は約120万円です";
    assert.equal(maskPii(text), text);
  });

  it("does not mask ISO-like dates as postal codes", () => {
    const text = "実施日は2026-10-26です";
    assert.equal(maskPii(text), text);
  });

  it("masks multiple kinds in one string", () => {
    const out = maskPii("090-1111-2222 / a@b.co.jp / https://x.test / 100-0001");
    assert.equal(out, "［電話］ / ［メール］ / ［URL］ / ［郵便番号］");
  });

  it("returns empty for empty input", () => {
    assert.equal(maskPii(""), "");
    assert.equal(maskPii(null), "");
  });
});
