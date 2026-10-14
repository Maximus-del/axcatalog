import { describe, expect, it } from "vitest";
import { sanitizeDescriptionHtml as clean } from "./sanitize-html";

describe("sanitizeDescriptionHtml", () => {
  it("handles nothing", () => {
    expect(clean(null)).toBe("");
    expect(clean(undefined)).toBe("");
    expect(clean("")).toBe("");
  });

  it("keeps ordinary formatting", () => {
    expect(clean("<p>Heavy <strong>12oz</strong> fleece</p>")).toBe(
      "<p>Heavy <strong>12oz</strong> fleece</p>",
    );
    expect(clean("<ul><li>One</li><li>Two</li></ul>")).toBe("<ul><li>One</li><li>Two</li></ul>");
  });

  it("removes script elements and their contents", () => {
    expect(clean("<p>a</p><script>alert(1)</script><p>b</p>")).toBe("<p>a</p><p>b</p>");
  });

  it("removes an unclosed script rather than leaving the payload as text", () => {
    expect(clean("<p>a</p><script>alert(1)")).toBe("<p>a</p>");
  });

  it("removes style, iframe, object and embed", () => {
    expect(clean("<style>body{}</style><p>x</p>")).toBe("<p>x</p>");
    expect(clean('<iframe src="https://evil"></iframe><p>x</p>')).toBe("<p>x</p>");
    expect(clean("<object data='x'></object><p>x</p>")).toBe("<p>x</p>");
  });

  it("strips every attribute from ordinary tags", () => {
    expect(clean('<p onclick="steal()" style="color:red" class="x">hi</p>')).toBe("<p>hi</p>");
    expect(clean('<div onmouseover="x">y</div>')).toBe("<div>y</div>");
  });

  it("drops an img rather than letting onerror through", () => {
    expect(clean('<img src="x" onerror="alert(1)">')).toBe("");
  });

  it("keeps text when it drops an unknown tag", () => {
    expect(clean("<marquee>still readable</marquee>")).toBe("still readable");
  });

  it("keeps safe links and hardens them", () => {
    expect(clean('<a href="https://ax.com">shop</a>')).toBe(
      '<a href="https://ax.com" target="_blank" rel="noopener noreferrer nofollow">shop</a>',
    );
    expect(clean('<a href="mailto:a@b.com">mail</a>')).toContain('href="mailto:a@b.com"');
  });

  it("strips a javascript: href but keeps the link text", () => {
    expect(clean('<a href="javascript:alert(1)">click</a>')).toBe("<a>click</a>");
    expect(clean("<a href=\"JaVaScRiPt:alert(1)\">click</a>")).toBe("<a>click</a>");
  });

  it("strips a data: href", () => {
    expect(clean('<a href="data:text/html,<script>alert(1)</script>">x</a>')).toBe("<a>x</a>");
  });

  it("handles unquoted and single-quoted hrefs", () => {
    expect(clean("<a href='https://ax.com'>x</a>")).toContain('href="https://ax.com"');
    expect(clean("<a href=https://ax.com>x</a>")).toContain('href="https://ax.com"');
  });

  it("escapes quotes in an href so it cannot break out of the attribute", () => {
    const out = clean('<a href="https://ax.com/&quot; onmouseover=&quot;x">y</a>');
    expect(out).not.toContain("onmouseover=\"x\"");
  });

  it("removes comments, which can hide markup from a tag pass", () => {
    expect(clean("<p>a</p><!-- <script>alert(1)</script> --><p>b</p>")).toBe("<p>a</p><p>b</p>");
  });

  it("is case-insensitive about tag names", () => {
    expect(clean("<P>x</P>")).toBe("<p>x</p>");
    expect(clean("<SCRIPT>alert(1)</SCRIPT><p>y</p>")).toBe("<p>y</p>");
  });

  it("leaves plain text alone", () => {
    expect(clean("Just a description, 12oz, garment dyed.")).toBe(
      "Just a description, 12oz, garment dyed.",
    );
  });

  it("never emits an on* handler or a script tag, whatever the input", () => {
    const nasty = [
      '<svg/onload=alert(1)>',
      '<body onload=alert(1)>',
      '<a href="#" onclick="alert(1)">x</a>',
      '<p><script>alert(1)</script></p>',
      '<IMG SRC=javascript:alert(1)>',
    ];
    for (const input of nasty) {
      const out = clean(input);
      expect(out.toLowerCase()).not.toContain("<script");
      expect(out.toLowerCase()).not.toMatch(/\son[a-z]+\s*=/);
      expect(out.toLowerCase()).not.toContain("javascript:");
    }
  });
});
