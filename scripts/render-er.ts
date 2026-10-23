// Renders the Mermaid ER diagram in docs/er-diagram.md to docs/er-diagram.png using the installed Edge/Chrome.
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

async function main() {
  const md = readFileSync("docs/er-diagram.md", "utf8");
  const src = /```mermaid\n([\s\S]*?)```/.exec(md)?.[1];
  if (!src) throw new Error("no mermaid block found");
  const html = `<!doctype html><body style="margin:0;background:#fff"><pre class="mermaid">${src.replace(/</g, "&lt;")}</pre>
<script type="module">import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs";
mermaid.initialize({ startOnLoad: false, theme: "neutral", er: { useMaxWidth: false } });
await mermaid.run(); document.body.dataset.done = "1";</script>`;
  const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch({ channel: "chrome" }));
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 2 });
  await page.setContent(html);
  await page.waitForSelector("body[data-done] svg", { timeout: 60_000 });
  await (await page.$("svg"))!.screenshot({ path: "docs/er-diagram.png" });
  await browser.close();
  console.log("wrote docs/er-diagram.png");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
