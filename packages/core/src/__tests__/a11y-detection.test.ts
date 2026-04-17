/**
 * a11y 不適切なページ構造が CLI 出力で「崩れ」として可視化されるかの検証。
 *
 * aria-palina は AX ツリーをそのまま平坦化・読み上げテキスト化するツールであるため、
 * ページの a11y 品質が低い場合、その「欠落」や「空白」が出力に直接反映される。
 * ここでは代表的な a11y アンチパターンを CDP 相当の生ツリーとして与え、
 * 出力がどう「壊れて見える」かを検証する。
 */
import { describe, expect, test } from "vite-plus/test";

import { flattenAXTree } from "../flatten.js";
import { node } from "./helpers.js";

describe("a11y 不適切パターンの検出可視性", () => {
  describe("名前なしインタラクティブ要素", () => {
    test("ラベルなしボタンは名前が空の [button] として出力され、問題が可視化される", () => {
      const result = flattenAXTree([
        node({
          nodeId: "root",
          ignored: false,
          role: { type: "role", value: "main" },
          childIds: ["btn-good", "btn-bad"],
        }),
        // 適切: ラベルあり
        node({
          nodeId: "btn-good",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "button" },
          name: { type: "computedString", value: "送信" },
        }),
        // 不適切: ラベルなし (<button></button> や <button><img></button> で alt なし)
        node({
          nodeId: "btn-bad",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "button" },
          name: { type: "computedString", value: "" },
        }),
      ]);

      const speeches = result.map((n) => n.speechText);
      // 適切なボタンは名前が表示される
      expect(speeches).toContain("[button] 送信");
      // 不適切なボタンは名前が欠落して [button] だけ — 明らかに「名前がない」とわかる
      expect(speeches).toContain("[button]");
    });

    test("alt なし画像は名前が空の [img] として出力される", () => {
      const result = flattenAXTree([
        node({
          nodeId: "root",
          ignored: false,
          role: { type: "role", value: "main" },
          childIds: ["img-good", "img-bad"],
        }),
        node({
          nodeId: "img-good",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "img" },
          name: { type: "computedString", value: "会社ロゴ" },
        }),
        node({
          nodeId: "img-bad",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "img" },
          name: { type: "computedString", value: "" },
        }),
      ]);

      const speeches = result.map((n) => n.speechText);
      expect(speeches).toContain("[img] 会社ロゴ");
      // alt なし画像: [img] だけで何の画像か不明 — a11y 問題が一目瞭然
      expect(speeches).toContain("[img]");
    });

    test("ラベルなしフォーム要素は名前が空で出力される", () => {
      const result = flattenAXTree([
        node({
          nodeId: "form",
          ignored: false,
          role: { type: "role", value: "form" },
          childIds: ["input-good", "input-bad", "cb-bad"],
        }),
        // 適切: label で紐づけ済み
        node({
          nodeId: "input-good",
          parentId: "form",
          ignored: false,
          role: { type: "role", value: "textbox" },
          name: { type: "computedString", value: "メールアドレス" },
        }),
        // 不適切: <input type="text"> に label なし
        node({
          nodeId: "input-bad",
          parentId: "form",
          ignored: false,
          role: { type: "role", value: "textbox" },
          name: { type: "computedString", value: "" },
        }),
        // 不適切: <input type="checkbox"> に label なし
        node({
          nodeId: "cb-bad",
          parentId: "form",
          ignored: false,
          role: { type: "role", value: "checkbox" },
          name: { type: "computedString", value: "" },
          properties: [{ name: "checked", value: { type: "boolean", value: false } }],
        }),
      ]);

      const speeches = result.map((n) => n.speechText);
      expect(speeches).toContain("[textbox] メールアドレス");
      // 名前なしフォーム要素 — スクリーンリーダーが何のフィールドかわからない
      expect(speeches).toContain("[textbox]");
      expect(speeches).toContain("[checkbox] (未チェック)");
    });

    test("名前なしリンクは [link] だけで出力される", () => {
      const result = flattenAXTree([
        node({
          nodeId: "nav",
          ignored: false,
          role: { type: "role", value: "navigation" },
          childIds: ["link-good", "link-bad"],
        }),
        node({
          nodeId: "link-good",
          parentId: "nav",
          ignored: false,
          role: { type: "role", value: "link" },
          name: { type: "computedString", value: "ホーム" },
        }),
        // <a href="..."><img src="..."></a> で alt なし → name 空
        node({
          nodeId: "link-bad",
          parentId: "nav",
          ignored: false,
          role: { type: "role", value: "link" },
          name: { type: "computedString", value: "" },
        }),
      ]);

      const speeches = result.map((n) => n.speechText);
      expect(speeches).toContain("[link] ホーム");
      expect(speeches).toContain("[link]");
    });
  });

  describe("div スープ (非セマンティックマークアップ)", () => {
    test("onclick 付き div はボタンロールを持たず generic として透過消滅する", () => {
      // <div onclick="submit()">送信</div> — Chrome は role=generic で返す
      const result = flattenAXTree([
        node({
          nodeId: "root",
          ignored: false,
          role: { type: "role", value: "RootWebArea" },
          name: { type: "computedString", value: "テストページ" },
          childIds: ["fake-btn"],
        }),
        node({
          nodeId: "fake-btn",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "generic" },
          name: { type: "computedString", value: "" },
          childIds: ["text"],
        }),
        node({
          nodeId: "text",
          parentId: "fake-btn",
          ignored: false,
          role: { type: "role", value: "StaticText" },
          name: { type: "computedString", value: "送信" },
        }),
      ]);

      // generic (名前なし) は透過的 → ボタンとしての存在がツリーから消える
      // 適切な <button> なら [button] 送信 になるはず
      const roles = result.map((n) => n.role);
      expect(roles).not.toContain("button");
      // テキストだけが浮いている — インタラクティブ要素が見えない問題
      expect(result.map((n) => n.speechText)).toEqual([
        "[RootWebArea] テストページ",
        "[StaticText] 送信",
      ]);
    });

    test("全体が div スープだとランドマークもインタラクション要素もない平坦な出力になる", () => {
      // <div id="header"><div>サイト名</div></div>
      // <div id="content"><div>本文</div></div>
      // <div id="footer"><div>© 2024</div></div>
      const result = flattenAXTree([
        node({
          nodeId: "root",
          ignored: false,
          role: { type: "role", value: "RootWebArea" },
          name: { type: "computedString", value: "" },
          childIds: ["d1", "d2", "d3"],
        }),
        node({
          nodeId: "d1",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "generic" },
          name: { type: "computedString", value: "" },
          childIds: ["t1"],
        }),
        node({
          nodeId: "t1",
          parentId: "d1",
          ignored: false,
          role: { type: "role", value: "StaticText" },
          name: { type: "computedString", value: "サイト名" },
        }),
        node({
          nodeId: "d2",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "generic" },
          name: { type: "computedString", value: "" },
          childIds: ["t2"],
        }),
        node({
          nodeId: "t2",
          parentId: "d2",
          ignored: false,
          role: { type: "role", value: "StaticText" },
          name: { type: "computedString", value: "本文テキスト" },
        }),
        node({
          nodeId: "d3",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "generic" },
          name: { type: "computedString", value: "" },
          childIds: ["t3"],
        }),
        node({
          nodeId: "t3",
          parentId: "d3",
          ignored: false,
          role: { type: "role", value: "StaticText" },
          name: { type: "computedString", value: "© 2024" },
        }),
      ]);

      // div スープ: ランドマークが一切ない → テキストノードが root 直下にべた並び
      const roles = result.map((n) => n.role);
      expect(roles).not.toContain("banner");
      expect(roles).not.toContain("main");
      expect(roles).not.toContain("contentinfo");
      expect(roles).not.toContain("navigation");
      expect(roles).not.toContain("heading");

      // 構造がなくテキストだけの平坦な出力 — セマンティクスの欠如が明白
      expect(result.map((n) => n.speechText)).toEqual([
        "[RootWebArea]",
        "[StaticText] サイト名",
        "[StaticText] 本文テキスト",
        "[StaticText] © 2024",
      ]);
      // すべて depth 0 または 1 — 深い構造がない
      expect(result.every((n) => n.depth <= 1)).toBe(true);
    });
  });

  describe("見出し階層の問題", () => {
    test("見出しレベルの飛び (h1→h4) が出力から読み取れる", () => {
      const result = flattenAXTree([
        node({
          nodeId: "root",
          ignored: false,
          role: { type: "role", value: "main" },
          childIds: ["h1", "h4"],
        }),
        node({
          nodeId: "h1",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "heading" },
          name: { type: "computedString", value: "タイトル" },
          properties: [{ name: "level", value: { type: "integer", value: 1 } }],
        }),
        // h2, h3 を飛ばしていきなり h4
        node({
          nodeId: "h4",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "heading" },
          name: { type: "computedString", value: "詳細セクション" },
          properties: [{ name: "level", value: { type: "integer", value: 4 } }],
        }),
      ]);

      const speeches = result.map((n) => n.speechText);
      // [heading1] の直後に [heading4] — レベル 2,3 が欠落している
      expect(speeches).toContain("[heading1] タイトル");
      expect(speeches).toContain("[heading4] 詳細セクション");
      // heading2, heading3 がないことが確認できる
      expect(speeches.filter((s) => s.startsWith("[heading"))).toEqual([
        "[heading1] タイトル",
        "[heading4] 詳細セクション",
      ]);
    });

    test("見出しが一切ないページは heading ロールが出力に含まれない", () => {
      const result = flattenAXTree([
        node({
          nodeId: "root",
          ignored: false,
          role: { type: "role", value: "main" },
          childIds: ["p1", "p2"],
        }),
        node({
          nodeId: "p1",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "paragraph" },
          name: { type: "computedString", value: "" },
          childIds: ["t1"],
        }),
        node({
          nodeId: "t1",
          parentId: "p1",
          ignored: false,
          role: { type: "role", value: "StaticText" },
          name: { type: "computedString", value: "これはタイトルのつもり" },
        }),
        node({
          nodeId: "p2",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "paragraph" },
          name: { type: "computedString", value: "" },
          childIds: ["t2"],
        }),
        node({
          nodeId: "t2",
          parentId: "p2",
          ignored: false,
          role: { type: "role", value: "StaticText" },
          name: { type: "computedString", value: "本文です" },
        }),
      ]);

      // heading が一切ない → スクリーンリーダーのナビゲーションに支障
      const roles = result.map((n) => n.role);
      expect(roles).not.toContain("heading");
      // すべてが段落とテキストだけ — 構造が読み取れない
      // (唯一の StaticText 子は親 paragraph に吸収される)
      expect(result.map((n) => n.speechText)).toEqual([
        "[main]",
        "[paragraph] これはタイトルのつもり",
        "[paragraph] 本文です",
      ]);
    });
  });

  describe("ランドマークの欠如", () => {
    test("適切なページはランドマークロールが含まれる (対照)", () => {
      const result = flattenAXTree([
        node({
          nodeId: "root",
          ignored: false,
          role: { type: "role", value: "RootWebArea" },
          name: { type: "computedString", value: "テスト" },
          childIds: ["banner", "nav", "main", "ci"],
        }),
        node({
          nodeId: "banner",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "banner" },
        }),
        node({
          nodeId: "nav",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "navigation" },
          name: { type: "computedString", value: "メイン" },
        }),
        node({
          nodeId: "main",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "main" },
        }),
        node({
          nodeId: "ci",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "contentinfo" },
        }),
      ]);

      const roles = result.map((n) => n.role);
      expect(roles).toContain("banner");
      expect(roles).toContain("navigation");
      expect(roles).toContain("main");
      expect(roles).toContain("contentinfo");
    });

    test("ランドマークなしページは構造ロールが出力されない", () => {
      // <html><body><div>...<div> だけのページ
      const result = flattenAXTree([
        node({
          nodeId: "root",
          ignored: false,
          role: { type: "role", value: "RootWebArea" },
          name: { type: "computedString", value: "" },
          childIds: ["d1"],
        }),
        node({
          nodeId: "d1",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "generic" },
          name: { type: "computedString", value: "" },
          childIds: ["link"],
        }),
        node({
          nodeId: "link",
          parentId: "d1",
          ignored: false,
          role: { type: "role", value: "link" },
          name: { type: "computedString", value: "トップへ" },
        }),
      ]);

      const landmarkRoles = ["banner", "navigation", "main", "contentinfo", "complementary"];
      const roles = result.map((n) => n.role);
      for (const landmark of landmarkRoles) {
        expect(roles).not.toContain(landmark);
      }
    });
  });

  describe("適切なページとの比較", () => {
    test("適切なページ vs 不適切なページの出力差が明確", () => {
      // --- 適切なページ ---
      const good = flattenAXTree([
        node({
          nodeId: "root",
          ignored: false,
          role: { type: "role", value: "RootWebArea" },
          name: { type: "computedString", value: "ECサイト" },
          childIds: ["banner", "nav", "main"],
        }),
        node({
          nodeId: "banner",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "banner" },
          childIds: ["logo"],
        }),
        node({
          nodeId: "logo",
          parentId: "banner",
          ignored: false,
          role: { type: "role", value: "img" },
          name: { type: "computedString", value: "ECサイトロゴ" },
        }),
        node({
          nodeId: "nav",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "navigation" },
          name: { type: "computedString", value: "メインメニュー" },
          childIds: ["link1"],
        }),
        node({
          nodeId: "link1",
          parentId: "nav",
          ignored: false,
          role: { type: "role", value: "link" },
          name: { type: "computedString", value: "商品一覧" },
        }),
        node({
          nodeId: "main",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "main" },
          childIds: ["h1", "search"],
        }),
        node({
          nodeId: "h1",
          parentId: "main",
          ignored: false,
          role: { type: "role", value: "heading" },
          name: { type: "computedString", value: "商品を探す" },
          properties: [{ name: "level", value: { type: "integer", value: 1 } }],
        }),
        node({
          nodeId: "search",
          parentId: "main",
          ignored: false,
          role: { type: "role", value: "searchbox" },
          name: { type: "computedString", value: "商品を検索" },
        }),
      ]);

      // --- 不適切なページ (同等の機能を div スープで構築) ---
      const bad = flattenAXTree([
        node({
          nodeId: "root",
          ignored: false,
          role: { type: "role", value: "RootWebArea" },
          name: { type: "computedString", value: "" }, // title なし
          childIds: ["d-header", "d-nav", "d-main"],
        }),
        node({
          nodeId: "d-header",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "generic" },
          name: { type: "computedString", value: "" },
          childIds: ["img-no-alt"],
        }),
        node({
          nodeId: "img-no-alt",
          parentId: "d-header",
          ignored: false,
          role: { type: "role", value: "img" },
          name: { type: "computedString", value: "" }, // alt なし
        }),
        node({
          nodeId: "d-nav",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "generic" },
          name: { type: "computedString", value: "" },
          childIds: ["a-no-text"],
        }),
        node({
          nodeId: "a-no-text",
          parentId: "d-nav",
          ignored: false,
          role: { type: "role", value: "link" },
          name: { type: "computedString", value: "" }, // テキストなしリンク
        }),
        node({
          nodeId: "d-main",
          parentId: "root",
          ignored: false,
          role: { type: "role", value: "generic" },
          name: { type: "computedString", value: "" },
          childIds: ["big-text", "input-no-label"],
        }),
        node({
          nodeId: "big-text",
          parentId: "d-main",
          ignored: false,
          role: { type: "role", value: "StaticText" },
          name: { type: "computedString", value: "商品を探す" }, // CSS で大きく見せてるだけ
        }),
        node({
          nodeId: "input-no-label",
          parentId: "d-main",
          ignored: false,
          role: { type: "role", value: "textbox" },
          name: { type: "computedString", value: "" }, // label なし
        }),
      ]);

      // 適切なページ: ランドマーク・見出し・名前がすべて揃っている
      const goodSpeeches = good.map((n) => n.speechText);
      expect(goodSpeeches).toEqual([
        "[RootWebArea] ECサイト",
        "[banner]",
        "[img] ECサイトロゴ",
        "[navigation] メインメニュー",
        "[link] 商品一覧",
        "[main]",
        "[heading1] 商品を探す",
        "[searchbox] 商品を検索",
      ]);

      // 不適切なページ: 名前が欠落し、ランドマークも見出しもない
      const badSpeeches = bad.map((n) => n.speechText);
      expect(badSpeeches).toEqual([
        "[RootWebArea]", // ← title なし
        "[img]", // ← alt なし
        "[link]", // ← テキストなし
        "[StaticText] 商品を探す", // ← heading ではなくただのテキスト
        "[textbox]", // ← label なし
      ]);

      // 差分の定量比較
      const goodLandmarks = good.filter((n) =>
        ["banner", "navigation", "main", "contentinfo"].includes(n.role),
      );
      const badLandmarks = bad.filter((n) =>
        ["banner", "navigation", "main", "contentinfo"].includes(n.role),
      );
      expect(goodLandmarks.length).toBeGreaterThan(0);
      expect(badLandmarks.length).toBe(0);

      // 適切なページはすべてのインタラクティブ要素に名前がある
      const goodInteractive = good.filter((n) =>
        ["button", "link", "textbox", "searchbox", "checkbox"].includes(n.role),
      );
      expect(goodInteractive.every((n) => n.name.length > 0)).toBe(true);

      // 不適切なページはインタラクティブ要素に名前がない
      const badInteractive = bad.filter((n) =>
        ["button", "link", "textbox", "searchbox", "checkbox"].includes(n.role),
      );
      expect(badInteractive.every((n) => n.name.length === 0)).toBe(true);
    });
  });
});
