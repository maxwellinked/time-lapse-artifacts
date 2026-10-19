import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const repository = fileURLToPath(new URL("../", import.meta.url));
const script = join(repository, "tools/publish-previews.sh");

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "tla-publish-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, "checkout"), remote = join(root, "remote.git");
  const git = async (...args) => (await exec("git", args, { cwd })).stdout.trim();
  await exec("git", ["init", "--bare", "-q", remote]);
  await mkdir(cwd);
  await git("init", "-q", "-b", "main");
  await git("config", "user.name", "Test");
  await git("config", "user.email", "test@example.invalid");
  for (const dir of ["previews", "assets/record-anchors"]) await mkdir(join(cwd, dir), { recursive: true });
  for (const file of ["previews/manifest.json", "assets/record-anchors/manifest.json", "unrelated.txt"]) await writeFile(join(cwd, file), "original\n");
  await git("add", ".");
  await git("commit", "-qm", "Baseline");
  await git("remote", "add", "origin", remote);
  await git("push", "-q", "origin", "main");
  const baseline = await git("rev-parse", "HEAD");
  const hook = join(remote, "hooks/pre-receive");
  await writeFile(hook, '#!/usr/bin/env bash\nwhile read -r old new ref; do\n  if [[ "$ref" == refs/heads/main ]]; then echo "GH013: validate required" >&2; exit 1; fi\ndone\n');
  await chmod(hook, 0o755);
  const bin = join(root, "bin"), log = join(root, "gh.jsonl");
  await mkdir(bin);
  await writeFile(join(bin, "gh"), `#!${process.execPath}\n
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n');
if (process.env.TEST_GH_FAIL === '1') process.exit(1);
`);
  await chmod(join(bin, "gh"), 0o755);
  await writeFile(join(root, "preview-toolchain.txt"), "fixture encoder provenance\n");
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REF: "refs/heads/main",
    GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "1", GITHUB_REPOSITORY: "example/archive",
    GITHUB_SERVER_URL: "https://github.com", RUNNER_TEMP: root };
  const run = (extra = {}) => exec("bash", [script], { cwd, env: { ...env, ...extra }, timeout: 15000 });
  const main = async () => (await exec("git", ["--git-dir", remote, "rev-parse", "refs/heads/main"])).stdout.trim();
  return { root, cwd, remote, log, git, run, main, baseline };
}

test("publication uses a PR branch and dispatches required validation without pushing main", async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.cwd, "previews/new.mp4"), "new preview bytes");
  await writeFile(join(f.cwd, "assets/record-anchors/new.webp"), "new image bytes");
  await writeFile(join(f.cwd, "unrelated.txt"), "must remain uncommitted\n");
  await f.run();
  const branch = "automation/recording-previews-123-1";
  assert.equal(await f.main(), f.baseline);
  assert.equal((await exec("git", ["--git-dir", f.remote, "rev-parse", `refs/heads/${branch}`])).stdout.trim(), await f.git("rev-parse", "HEAD"));
  const files = (await f.git("diff", "--name-only", f.baseline, "HEAD")).split("\n");
  assert.deepEqual(files.sort(), ["assets/record-anchors/new.webp", "previews/new.mp4", "previews/provenance/123-1.txt"]);
  const receipt = await readFile(join(f.cwd, "previews/provenance/123-1.txt"), "utf8");
  assert.match(receipt, /fixture encoder provenance/);
  assert.match(receipt, /previews\/new.mp4/);
  const calls = (await readFile(f.log, "utf8")).trim().split("\n").map(JSON.parse);
  assert.deepEqual(calls, [
    ["pr", "create", "--repo", "example/archive", "--base", "main", "--head", branch,
      "--title", "Update generated recording previews", "--body-file", join(f.root, "preview-pr.md")],
    ["workflow", "run", "validate-site.yml", "--repo", "example/archive", "--ref", branch],
  ]);
  // Prove this remote actually rejects the old workflow's publication route.
  await assert.rejects(f.git("push", "origin", "HEAD:refs/heads/main"), /GH013/);
});

test("cache-only publication produces no commit, branch or GitHub request", async (t) => {
  const f = await fixture(t);
  assert.match((await f.run()).stdout, /already complete/);
  assert.equal(await f.git("rev-parse", "HEAD"), f.baseline);
  assert.equal(await f.git("branch", "--show-current"), "main");
  await assert.rejects(readFile(f.log), { code: "ENOENT" });
});

test("publication rejects non-main input and unrelated staged files", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.run({ GITHUB_REF: "refs/heads/unreviewed" }), /must start from main/);
  await writeFile(join(f.cwd, "unrelated.txt"), "staged change");
  await f.git("add", "unrelated.txt");
  await assert.rejects(f.run(), /unrelated staged changes/);
  assert.equal(await f.main(), f.baseline);
  await assert.rejects(readFile(f.log), { code: "ENOENT" });
});

test("a GitHub publication failure stays failed and leaves protected main untouched", async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.cwd, "assets/record-anchors/new.webp"), "new image bytes");
  await assert.rejects(f.run({ TEST_GH_FAIL: "1" }));
  assert.equal(await f.main(), f.baseline);
});

test("workflow gates publication on strict validation and dispatch runs the same required check", async () => {
  const workflow = await readFile(join(repository, ".github/workflows/generate-previews.yml"), "utf8");
  const validation = await readFile(join(repository, ".github/workflows/validate-site.yml"), "utf8");
  assert.match(workflow, /push:\n    branches: \[main\]/);
  assert.match(workflow, /if: github.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /pull-requests: write/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /GH_TOKEN: \$\{\{ github.token \}\}/);
  assert.ok(workflow.indexOf("REQUIRE_PREVIEWS=1 node tools/validate.mjs") < workflow.indexOf("run: bash tools/publish-previews.sh"));
  assert.match(validation, /  workflow_dispatch:/);
  assert.match(validation, /jobs:\n  validate:/);
  assert.match(validation, /if: github.event_name != 'push'\n        run: REQUIRE_PREVIEWS=1 node tools\/validate.mjs/);
});
