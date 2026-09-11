// A narrow allow-list sanitiser for Shopify product descriptions.
//
// PortalProductDetail rendered `products.description` straight into
// dangerouslySetInnerHTML. The content is operator-authored — it comes from the
// org's own Shopify store — so this is not a live exploit. But it is a
// client-facing page injecting unfiltered markup, and Shopify descriptions get
// pasted in from suppliers and agencies all the time.
//
// Deliberately narrow: an allow-list of formatting tags, no attributes at all
// except href on links, and hrefs restricted to http/https/mailto. Anything
// unrecognised has its tags dropped and its text kept, so a description never
// silently disappears. This is not a general-purpose sanitiser and should not be
// used as one — for untrusted user-generated HTML, take a real dependency.

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "span", "div", "a",
]);

const SAFE_HREF = /^(https?:|mailto:)/i;

/** Elements whose entire contents are dropped, not just their tags. */
const DROP_CONTENT = /<(script|style|iframe|object|embed|noscript)\b[\s\S]*?<\/\1\s*>/gi;
const DROP_UNCLOSED = /<(script|style|iframe|object|embed|noscript)\b[\s\S]*$/gi;

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function sanitizeDescriptionHtml(input: string | null | undefined): string {
  if (!input) return "";

  let html = input.replace(DROP_CONTENT, "").replace(DROP_UNCLOSED, "");
  // Comments can hide markup from a naive tag pass.
  html = html.replace(/<!--[\s\S]*?-->/g, "");

  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_match, rawTag: string, attrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";

    const closing = _match.startsWith("</");
    if (closing) return `</${tag}>`;

    if (tag === "a") {
      const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      const value = (href?.[1] ?? href?.[2] ?? href?.[3] ?? "").trim();
      if (!SAFE_HREF.test(value)) return "<a>";
      return `<a href="${escapeAttr(value)}" target="_blank" rel="noopener noreferrer nofollow">`;
    }

    // Every other allowed tag keeps no attributes — no style, no class, no
    // on* handler, nothing that can carry behaviour.
    return `<${tag}>`;
  });
}
