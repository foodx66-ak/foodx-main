import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { config } from "./config.js";
import { SECURITY_KNOWLEDGE, buildSystemPrompt } from "./prompt.js";
import {
  cookieName,
  dailyCapFor,
  dailyRedisKey,
  verifyUrl,
  variantFromRequest,
  withVariant,
} from "./variant.js";

const PROFILE = {
  company: "テスト店",
  title: "店長",
  stores: "1〜2店舗",
  band: "A（1〜2店舗）",
  aiType: "タイプ3：AIを使ったことがない",
};

function promptText(variant) {
  const prompt = buildSystemPrompt(PROFILE, variant);
  if (typeof prompt === "string") return prompt;
  return prompt.map((block) => block.text).join("\n");
}

describe("kabeuchi variant", () => {
  it("keeps the default cookie, daily key, and verify link", () => {
    assert.equal(cookieName("default"), "kb_sid");
    assert.equal(cookieName(undefined), "kb_sid");
    assert.equal(dailyRedisKey("default", "20261028"), "kb:daily:20261028");
    assert.equal(
      verifyUrl("default", "tok", "https://www.foodx.co.jp"),
      "https://www.foodx.co.jp/kabeuchi/?t=tok"
    );
  });

  it("uses a separate cookie, daily key, and page for security", () => {
    assert.equal(cookieName("security"), "kb_sec_sid");
    assert.notEqual(cookieName("security"), cookieName("default"));
    assert.equal(dailyRedisKey("security", "20261028"), "kb:daily:security:20261028");
    assert.notEqual(dailyRedisKey("security", "20261028"), dailyRedisKey("default", "20261028"));
    assert.equal(
      verifyUrl("security", "tok", "https://www.foodx.co.jp/"),
      "https://www.foodx.co.jp/kabeuchi/security/?t=tok"
    );
  });

  it("does not add variant to default GAS payloads", () => {
    const payload = { action: "verified", leadId: "kb_1" };
    assert.equal(withVariant(payload, "default"), payload);
    assert.equal(withVariant(payload, undefined), payload);
    assert.deepEqual(withVariant(payload, "security"), {
      action: "verified",
      leadId: "kb_1",
      variant: "security",
    });
  });

  it("reads the security daily cap from its own env", () => {
    const previous = process.env.KABEUCHI_SECURITY_DAILY_CAP;
    try {
      process.env.KABEUCHI_SECURITY_DAILY_CAP = "4";
      assert.equal(dailyCapFor("security"), 4);
      assert.equal(dailyCapFor("default"), config.dailyCap);
      process.env.KABEUCHI_SECURITY_DAILY_CAP = "0";
      assert.equal(dailyCapFor("security"), 10);
    } finally {
      if (previous == null) delete process.env.KABEUCHI_SECURITY_DAILY_CAP;
      else process.env.KABEUCHI_SECURITY_DAILY_CAP = previous;
    }
  });

  it("uses the same booking URL as the default wall-bounce when security booking env is unset", () => {
    const previousBook = process.env.KABEUCHI_BOOKING_URL;
    const previousSec = process.env.KABEUCHI_SECURITY_BOOKING_URL;
    try {
      delete process.env.KABEUCHI_SECURITY_BOOKING_URL;
      process.env.KABEUCHI_BOOKING_URL = "https://calendar.app.google/example";
      assert.equal(config.securityBookingUrl, "https://calendar.app.google/example");
      assert.equal(config.securityBookingUrl, config.bookingUrl);
      process.env.KABEUCHI_SECURITY_BOOKING_URL = "https://calendar.app.google/security-only";
      assert.equal(config.securityBookingUrl, "https://calendar.app.google/security-only");
    } finally {
      if (previousBook == null) delete process.env.KABEUCHI_BOOKING_URL;
      else process.env.KABEUCHI_BOOKING_URL = previousBook;
      if (previousSec == null) delete process.env.KABEUCHI_SECURITY_BOOKING_URL;
      else process.env.KABEUCHI_SECURITY_BOOKING_URL = previousSec;
    }
  });

  it("rejects mixed variant signals and defaults when absent", () => {
    const request = (header) => ({ headers: { get: () => header } });
    assert.deepEqual(variantFromRequest(request(""), null), { variant: "default" });
    assert.deepEqual(variantFromRequest(request("security"), { variant: "security" }), { variant: "security" });
    assert.equal(variantFromRequest(request("security"), { variant: "default" }).error, "variant_mismatch");
  });

  it("keeps the default prompt on the existing knowledge and news", () => {
    const text = promptText("default");
    assert.match(text, /壁打ちバディ/);
    assert.match(text, /【まとめ】/);
    assert.match(text, /食べログ/);
    assert.match(text, /確認日または公開日（YYYY-MM-DD）を同じ返答に書いてください/);
    assert.match(text, /年だけでは日付になりません/);
    assert.match(text, /手元にない/);
    assert.match(text, /確認日 2026-10-21/);
    assert.match(text, /会話は記録し、ご提案とサービス改善に使います/);
    assert.doesNotMatch(text, /【点検票】/);
    assert.doesNotMatch(text, /セキュリティ壁打ちバディ/);
  });

  it("builds the security prompt without industry news or the default summary mark", () => {
    const text = promptText("security");
    assert.equal(text.includes(SECURITY_KNOWLEDGE), true);
    assert.match(text, /【点検票】/);
    assert.match(text, /FooDXは助言までです/);
    assert.match(text, /123件/);
    assert.match(text, /約153万件/);
    assert.match(text, /この点検票をもとに、お店で進める/);
    assert.match(text, /進め方をFooDXに相談する/);
    assert.doesNotMatch(text, /食べログ/);
    assert.doesNotMatch(text, /1行目を「【まとめ】」/);
  });

  it("can render both prompts as plain strings", () => {
    const previous = process.env.KABEUCHI_PROMPT_CACHE;
    process.env.KABEUCHI_PROMPT_CACHE = "0";
    try {
      assert.equal(typeof buildSystemPrompt(PROFILE, "default"), "string");
      assert.equal(typeof buildSystemPrompt(PROFILE, "security"), "string");
      assert.match(buildSystemPrompt(PROFILE, "security"), /パスワード、カード番号、管理画面のURLを聞かないでください/);
    } finally {
      if (previous == null) delete process.env.KABEUCHI_PROMPT_CACHE;
      else process.env.KABEUCHI_PROMPT_CACHE = previous;
    }
  });
});

describe("security entry page", () => {
  const page = fs.readFileSync(new URL("../../kabeuchi/security/index.html", import.meta.url), "utf8");
  const home = fs.readFileSync(new URL("../../kabeuchi/index.html", import.meta.url), "utf8");
  const vercel = fs.readFileSync(new URL("../../vercel.json", import.meta.url), "utf8");
  const sitemap = fs.readFileSync(new URL("../../sitemap.xml", import.meta.url), "utf8");

  it("uses the existing kabeuchi shell and the three given figures", () => {
    assert.match(page, /data-kb="security"/);
    assert.match(page, /href="\/kabeuchi\/style\.css"/);
    assert.match(page, /src="\/kabeuchi\/app\.js"/);
    assert.match(page, /<title>セキュリティ壁打ちバディ｜お店のセキュリティ、どこから見る？｜FooDX合同会社<\/title>/);
    assert.match(page, /content="飲食店向けの無料の壁打ちです。7つの観点でお店のセキュリティを整理し、点検票にします。設定の変更や復旧は行わず、FooDXは助言までです。"/);
    assert.match(page, /2026年上半期の国内ランサムウェア被害。うち中小企業が79件（警察庁の発表）/);
    assert.match(page, /飲食周辺の予約システムへの不正アクセスで影響が出た件数/);
    assert.match(page, /店舗PCの感染から古いメールのパスワードが盗まれ、不正ログインが続いた例/);
    assert.match(page, /パスワード、カード番号、管理画面のURLは、会話の中でも入力しないでください。/);
    assert.match(
      page,
      /パスワード・カード番号・管理画面のURLと、個人名は入力しないでください。会話は記録し、FooDXからのご提案、サービス改善に使用致します（<a href="\/privacy\/"[^>]*>プライバシーポリシー<\/a>）。/,
    );
    assert.match(page, /この点検票をもとに、お店で進める/);
    assert.match(page, /進め方をFooDXに相談する/);
    assert.match(SECURITY_KNOWLEDGE, /会話は記録し、ご提案とサービス改善に使います/);
    assert.doesNotMatch(page, /window\.claude/);
    assert.doesNotMatch(page, /FAQPage/);
    for (const label of [
      "パスワードとアカウント",
      "メール",
      "店舗のパソコンとスマホ",
      "予約とお客様の情報",
      "会計と決済",
      "店のネット回線",
      "何か起きたときの初動",
    ]) {
      assert.equal(page.includes(label), true, label);
      assert.equal(SECURITY_KNOWLEDGE.includes(label), true, label);
    }
  });

  it("adds one link on the existing page and keeps that page's title", () => {
    assert.match(home, /<title>AI壁打ちバディ｜その悩み、AIで何とかなる？ 10分のAI壁打ちで確かめる｜FooDX合同会社<\/title>/);
    assert.equal((home.match(/\/kabeuchi\/security\//g) || []).length, 1);
    assert.doesNotMatch(home, /data-kb="security"/);
    assert.match(
      home,
      /スタッフやお客様の個人名は入力しないでください。会話は記録し、FooDXからのご提案、サービス改善に使用致します（<a href="\/privacy\/"[^>]*>プライバシーポリシー<\/a>）。/,
    );
  });

  it("keeps the kabeuchi CSP and redirects the security path", () => {
    const configJson = JSON.parse(vercel);
    const csp = configJson.headers.find((entry) => entry.source === "/kabeuchi/(.*)");
    assert.ok(csp);
    const policy = csp.headers.find((header) => header.key === "Content-Security-Policy").value;
    assert.match(policy, /script-src 'self' https:\/\/challenges\.cloudflare\.com/);
    assert.match(policy, /connect-src 'self'/);
    assert.ok(configJson.redirects.some((entry) => entry.source === "/kabeuchi/security" && entry.destination === "/kabeuchi/security/"));
    assert.match(sitemap, /https:\/\/www\.foodx\.co\.jp\/kabeuchi\/security\//);
  });
});
