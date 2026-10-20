import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { get } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { createValidationServer, hasRequiredSourceLinks } from "../tools/validation-helpers.mjs";

const dataset = "https://huggingface.co/datasets/maxwellinked/time-lapse-artifacts";
const license = "https://creativecommons.org/licenses/by-nc/4.0/";

test("required source links compare whole href values, preserving canonical anchors", () => {
  assert.ok(hasRequiredSourceLinks(`<a\n href="${dataset}" target="_blank">Dataset</a><a href='${license}'>License</a>`));
  assert.ok(hasRequiredSourceLinks(`<A title="a > b" HREF = '${dataset}'>Dataset</A><a href="${license}">License</a>`));
  assert.ok(hasRequiredSourceLinks(`<a href=${dataset}>Dataset</a><a href=${license}>License</a>`));
  for (const expected of [dataset, license]) {
    const other = expected === dataset ? license : dataset;
    for (const invalid of [
      `https://evil.invalid/?next=${expected}`,
      `${expected}-different`,
      `${expected}?next=https://evil.invalid/`,
      expected.replace("https://", "https://evil.invalid/"),
    ]) {
      assert.equal(hasRequiredSourceLinks(`<a href="${invalid}">Wrong destination</a><a href="${other}">Other</a>`), false, invalid);
    }
    for (const fake of [
      expected,
      `<a data-href="${expected}">Not a link</a>`,
      `<a title="href='${expected}'">Attribute text</a>`,
      `<!-- <a href="${expected}">Comment</a> -->`,
      `<a href="https://evil.invalid/" href="${expected}">Duplicate</a>`,
      `<a href=https://evil.invalid/ href="${expected}">Unquoted duplicate</a>`,
      `<a href href="${expected}">Valueless duplicate</a>`,
      `<a-link href="${expected}">Custom element</a-link>`,
    ]) {
      assert.equal(hasRequiredSourceLinks(`${fake}<a href="${other}">Other</a>`), false, fake);
    }
  }
  const anchors = `<a href="${dataset}">Dataset</a><a href="${license}">License</a>`;
  for (const element of ["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "noscript"]) {
    assert.equal(hasRequiredSourceLinks(`<${element}>${anchors}</${element}>`), false, element);
    assert.equal(hasRequiredSourceLinks(`<${element}>${anchors}`), false, `unclosed ${element}`);
  }
  assert.equal(hasRequiredSourceLinks(`<plaintext>${anchors}`), false);
  assert.equal(hasRequiredSourceLinks(`<a\u00a0href="${dataset}">Not an anchor</a><a href="${license}">License</a>`), false);
});

test("required source links exclude anchors in template and select contexts", () => {
  const anchors = `<a href="${dataset}">Dataset</a><a href="${license}">License</a>`;
  for (const element of ["template", "select"]) {
    assert.equal(hasRequiredSourceLinks(`<${element}>${anchors}</${element}>`), false, element);
    assert.equal(hasRequiredSourceLinks(`<${element}>${anchors}`), false, `unclosed ${element}`);
    assert.equal(hasRequiredSourceLinks(`<${element.toUpperCase()}>${anchors}</${element.toUpperCase()}>`), false, `uppercase ${element}`);
    assert.equal(hasRequiredSourceLinks(`<${element}/>${anchors}`), false, `self-closing ${element}`);
    assert.ok(hasRequiredSourceLinks(`<${element}>Ignored</${element}>${anchors}`), `after ${element}`);
    for (const expected of [dataset, license]) {
      const other = expected === dataset ? license : dataset;
      assert.equal(hasRequiredSourceLinks(`<${element}><a href="${expected}">Hidden</a></${element}><a href="${other}">Visible</a>`), false, `${expected} in ${element}`);
    }
  }
  assert.equal(hasRequiredSourceLinks(`<template><template></template>${anchors}</template>`), false, "nested templates");
  assert.equal(hasRequiredSourceLinks(`<select><template></select></template>${anchors}</select>`), false, "crossed template and select closes");
  assert.equal(hasRequiredSourceLinks(`<template><script>"</template>"</script>${anchors}</template>`), false, "raw-text closing tag");
  assert.equal(hasRequiredSourceLinks(`<template><!-- </template> -->${anchors}</template>`), false, "comment closing tag");
  assert.equal(hasRequiredSourceLinks(`<template><span title="</template>"></span>${anchors}</template>`), false, "attribute closing tag");
  assert.ok(hasRequiredSourceLinks(`<template><template>Ignored</template></template>${anchors}`));
  assert.ok(hasRequiredSourceLinks(`<template><select>Ignored</select></template>${anchors}`));
});

test("required source links retain ordinary anchors beside unsupported rendering contexts", () => {
  const anchors = `<a href="${dataset}">Dataset</a><a href="${license}">License</a>`;
  for (const [context, markup] of [
    ["browser-repaired select", `<select><input>${anchors}</select>`],
    ["foreign template", `<svg><template>${anchors}</template></svg>`],
    ["declarative shadow root", `<div><template shadowrootmode="open">${anchors}</template></div>`],
  ]) {
    assert.equal(hasRequiredSourceLinks(markup), false, context);
    assert.ok(hasRequiredSourceLinks(`${markup}${anchors}`), `ordinary fallback after ${context}`);
  }
});

test("validation HTTP preserves its seven resources and rejects filesystem paths and aliases", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "tla-validation-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, "checkout");
  const resources = [
    ["/", "index.html", "text/html"],
    ["/assets/style.css", "assets/style.css", "text/css"],
    ["/assets/app.js", "assets/app.js", "text/javascript"],
    ["/assets/data-loader.js", "assets/data-loader.js", "text/javascript"],
    ["/assets/reference-policy.js", "assets/reference-policy.js", "text/javascript"],
    ["/assets/record-sequences.js", "assets/record-sequences.js", "text/javascript"],
    ["/data/records.json", "data/records.json", "application/json"],
  ];
  for (const [, path] of resources) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), `fixture: ${path}`);
  }
  await writeFile(join(directory, "outside.txt"), "outside the checkout");
  await writeFile(join(root, "unlisted.txt"), "not an allowed resource");
  await symlink(join(directory, "outside.txt"), join(root, "leak.txt"));
  const server = createValidationServer(root);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const request = (path) => new Promise((resolve, reject) => {
    // Preserve raw dot segments: fetch() would normalize the attack before sending.
    get({ hostname: "127.0.0.1", port: server.address().port, path }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, type: response.headers["content-type"], body }));
    }).on("error", reject);
  });
  for (const [route, path, type] of resources) {
    assert.deepEqual(await request(route), { status: 200, type, body: `fixture: ${path}` });
  }
  for (const path of [
    "/../../outside.txt", "/../../../etc/passwd", "/%2e%2e/%2e%2e/outside.txt",
    "/..%2f..%2foutside.txt", "/..\\..\\outside.txt", "/%252e%252e/outside.txt",
    "/unlisted.txt", "/leak.txt", "/assets/../index.html", "//assets/app.js",
    "/assets/app.js?query=1", "http://localhost/assets/app.js",
  ]) {
    const response = await request(path);
    assert.equal(response.status, 404, path);
    assert.equal(response.body, "Not found", path);
  }
  // The request handler continues to work without any request-time file access.
  await rm(root, { recursive: true });
  assert.equal((await request("/")).body, "fixture: index.html");
});
