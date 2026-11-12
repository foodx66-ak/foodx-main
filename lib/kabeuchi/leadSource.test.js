import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeLeadSource } from "./leadSource.js";

describe("normalizeLeadSource", () => {
  it("keeps a valid lowercase slug", () => {
    assert.equal(normalizeLeadSource("lab-googlemap"), "lab-googlemap");
    assert.equal(normalizeLeadSource("dual-mid"), "dual-mid");
  });

  it("lowercases uppercase letters", () => {
    assert.equal(normalizeLeadSource("Lab-GoogleMap"), "lab-googlemap");
    assert.equal(normalizeLeadSource("HEADER"), "header");
  });

  it("rejects symbols and spaces", () => {
    assert.equal(normalizeLeadSource("lab_googlemap"), "");
    assert.equal(normalizeLeadSource("lab googlemap"), "");
    assert.equal(normalizeLeadSource("lab/googlemap"), "");
    assert.equal(normalizeLeadSource("lab.googlemap"), "");
  });

  it("rejects values longer than 48 characters", () => {
    assert.equal(normalizeLeadSource("a".repeat(48)), "a".repeat(48));
    assert.equal(normalizeLeadSource("a".repeat(49)), "");
  });

  it("treats missing or blank values as empty", () => {
    assert.equal(normalizeLeadSource(undefined), "");
    assert.equal(normalizeLeadSource(null), "");
    assert.equal(normalizeLeadSource(""), "");
    assert.equal(normalizeLeadSource("   "), "");
    assert.equal(normalizeLeadSource(12), "");
  });
});
