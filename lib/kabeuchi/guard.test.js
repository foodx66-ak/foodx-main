import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GUARD_REPLACEMENT,
  checkAssistantReply,
  encodeReplaceEvent,
  hasForbiddenPrice,
  hasGuarantee,
  parseStreamBody,
} from "./guard.js";

describe("guard", () => {
  it("allows public fees 15000 and 33000", () => {
    assert.equal(hasForbiddenPrice("スポット診断は33,000円です"), false);
    assert.equal(hasForbiddenPrice("入口は15,000円です"), false);
    assert.equal(hasForbiddenPrice("¥33,000〜"), false);
  });

  it("flags other fee-like amounts", () => {
    assert.equal(hasForbiddenPrice("月額110,000円です"), true);
    assert.equal(hasForbiddenPrice("11万円です"), true);
  });

  it("ignores small yen amounts such as minimum wage", () => {
    assert.equal(hasForbiddenPrice("最低賃金は1,177円です"), false);
  });

  it("detects guarantee language", () => {
    assert.equal(hasGuarantee("必ず売上が上がります"), true);
    assert.equal(hasGuarantee("効果を保証します"), true);
    assert.equal(hasGuarantee("一緒に整理しましょう"), false);
  });

  it("detects blocked names", () => {
    const reasons = checkAssistantReply("〇〇社の事例では", ["〇〇社"]);
    assert.deepEqual(reasons, ["blocked_name"]);
  });

  it("encodes and parses replace events", () => {
    const body = "途中まで見えた返答" + encodeReplaceEvent(["price"], GUARD_REPLACEMENT);
    const parsed = parseStreamBody(body);
    assert.equal(parsed.replaced, true);
    assert.equal(parsed.text, GUARD_REPLACEMENT);
    assert.deepEqual(parsed.reasons, ["price"]);
  });
});
