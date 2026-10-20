import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

const REQUIRED_LINKS = [
  "https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts",
  "https://creativecommons.org/licenses/by-nc/4.0/",
];

// Inspect complete quoted attributes in the static source, not URL substrings.
export function hasRequiredSourceLinks(html) {
  const links = new Set();
  const rawText = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "noscript"]);
  const inertElements = new Set(["template", "select"]);
  const inertStack = [];
  const tags = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-z][a-z0-9:-]*)(?=[\t\n\f\r />])((?:[^"'<>]|"[^"]*"|'[^']*')*)>/gi;
  let tag;
  while ((tag = tags.exec(html))) {
    if (!tag[2]) continue; // Comments are not links.
    const closing = Boolean(tag[1]);
    const name = tag[2].toLowerCase();
    // Template contents are inert; select descendants do not satisfy source links.
    // Only matching closes leave these contexts; malformed crossed closes can
    // be ignored by HTML parsing. A stray "/>" does not close either element.
    if (inertElements.has(name)) {
      if (!closing) inertStack.push(name);
      else if (inertStack.at(-1) === name) inertStack.pop();
      continue;
    }
    if (closing) continue;
    if (name === "plaintext") break;
    if (rawText.has(name)) {
      const end = new RegExp(`</${name}[\\t\\n\\f\\r ]*>`, "gi");
      end.lastIndex = tags.lastIndex;
      tags.lastIndex = end.exec(html) ? end.lastIndex : html.length;
      continue;
    }
    if (name !== "a" || inertStack.length) continue;
    // Include unquoted and valueless attributes so a later duplicate cannot win.
    const attributes = tag[3].matchAll(/([^\t\n\f\r />=]+)(?:[\t\n\f\r ]*=[\t\n\f\r ]*(?:"([^"]*)"|'([^']*)'|([^\t\n\f\r >]*)))?/g);
    for (const [, name, doubleQuoted, singleQuoted, unquoted] of attributes) {
      if (name.toLowerCase() === "href") {
        links.add(doubleQuoted ?? singleQuoted ?? unquoted ?? "");
        break; // Browsers use the first value when an attribute is duplicated.
      }
    }
  }
  return REQUIRED_LINKS.every((url) => links.has(url));
}

export function createValidationServer(root) {
  // This server only checks these fixed resources. Requests never name files.
  const routes = new Map([
    ["/", "index.html", "text/html"],
    ["/assets/style.css", "assets/style.css", "text/css"],
    ["/assets/app.js", "assets/app.js", "text/javascript"],
    ["/assets/data-loader.js", "assets/data-loader.js", "text/javascript"],
    ["/assets/reference-policy.js", "assets/reference-policy.js", "text/javascript"],
    ["/assets/record-sequences.js", "assets/record-sequences.js", "text/javascript"],
    ["/data/records.json", "data/records.json", "application/json"],
  ].map(([route, path, contentType]) => [route, { body: readFileSync(join(root, path)), contentType }]));

  return createServer((request, response) => {
    const resource = routes.get(request.url);
    if (!resource) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "content-type": resource.contentType });
    response.end(resource.body);
  });
}
