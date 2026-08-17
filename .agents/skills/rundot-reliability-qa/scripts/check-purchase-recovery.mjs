#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const SKIPPED_DIRECTORIES = new Set([".git", "dist", "node_modules"]);

export function analyzePurchaseCoordinator(source) {
    const failures = [];
    const stableAttempt =
        /purchase\s*\(\s*[A-Za-z_$][\w$]*\.catalogItemId\s*,\s*[A-Za-z_$][\w$]*\.idempotencyKey\s*\)/s;

    if (!stableAttempt.test(source)) {
        failures.push("checkout does not visibly reuse the persisted catalog item and idempotency key");
    }

    if (
        !/attempt\s*\(\s*existing\s*\)/s.test(source) &&
        !/purchase\s*\(\s*existing\.catalogItemId\s*,\s*existing\.idempotencyKey\s*\)/s.test(source)
    ) {
        failures.push("a fresh direct tap cannot retry an unresolved intent with its original idempotency key");
    }

    const reconcileStart = source.search(/(?:async\s+)?reconcilePending\s*\(\s*\)/s);
    const reconcileEnd = reconcileStart < 0 ? -1 : source.indexOf("pendingIntent", reconcileStart);
    const reconcileBody =
        reconcileStart < 0 ? "" : source.slice(reconcileStart, reconcileEnd < 0 ? source.length : reconcileEnd);

    if (!reconcileBody) {
        failures.push("no background reconcilePending path was found");
    } else if (/\battempt\s*\(/s.test(reconcileBody) || /\.purchase\s*\(/s.test(reconcileBody)) {
        failures.push("background reconciliation can reopen checkout without direct player intent");
    }

    return failures;
}

async function collectSourceFiles(targetPath) {
    const targetStats = await stat(targetPath);
    if (targetStats.isFile()) return [targetPath];

    const sourceRoot = path.join(targetPath, "src");
    try {
        if (!(await stat(sourceRoot)).isDirectory()) return [];
    } catch {
        return [];
    }

    const files = [];
    async function visit(directory) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue;
            const entryPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                await visit(entryPath);
            } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
                files.push(entryPath);
            }
        }
    }
    await visit(sourceRoot);
    return files;
}

/**
 * Only the coordinator itself, never a file that merely uses one.
 *
 * Matching on the presence of the `createPurchaseCoordinator` token flagged
 * every `commerce.ts` that imports the factory, and then scanned that consumer
 * for retry/idempotency logic which correctly lives inside the coordinator it
 * delegates to — a guaranteed false FAIL. Whether a consumer tripped it came
 * down to whether it happened to import the `PendingPurchaseIntent` type.
 *
 * A coordinator DEFINES the factory; a consumer imports it. Require the
 * definition.
 */
function isCopiedPurchaseCoordinator(source) {
    const definesFactory =
        /export\s+function\s+createPurchaseCoordinator\b/.test(source) ||
        /export\s+(?:const|let|var)\s+createPurchaseCoordinator\s*[:=]/.test(source);
    return (
        definesFactory &&
        source.includes("PendingPurchaseIntent") &&
        source.includes("getOrderHistory") &&
        source.includes("idempotencyKey")
    );
}

async function runRuntimeProbe(coordinatorFile) {
    const moduleUrl = pathToFileURL(coordinatorFile);
    moduleUrl.searchParams.set("purchase-recovery-probe", String(Date.now()));
    const coordinatorModule = await import(moduleUrl.href);
    assert.equal(
        typeof coordinatorModule.createPurchaseCoordinator,
        "function",
        "createPurchaseCoordinator must be exported",
    );

    let pending = null;
    let saves = 0;
    let checkoutShouldTimeout = true;
    const purchaseCalls = [];
    const coordinator = coordinatorModule.createPurchaseCoordinator({
        shop: {
            async purchase(itemId, idempotencyKey) {
                purchaseCalls.push({ itemId, idempotencyKey });
                if (checkoutShouldTimeout) throw new Error("simulated host bridge timeout");
                return { orderId: "probe-order" };
            },
            async getOrderHistory() {
                return [];
            },
        },
        pending: {
            load: () => pending,
            save: (intent) => {
                pending = intent;
                saves += 1;
            },
            clear: () => {
                pending = null;
            },
        },
        findConfirmedOrder: () => null,
        syncEntitlements: async () => undefined,
        classifyError: () => "unknown",
        isDefinitiveCancellation: () => false,
        createId: () => "probe-intent",
        now: () => 1_000,
    });

    const firstOutcome = await coordinator.purchase("probe_product", "probe.catalog.item");
    assert.equal(firstOutcome.status, "unknown", "ambiguous checkout must remain unresolved");
    assert.equal(purchaseCalls.length, 1);
    assert.equal(saves, 1);
    assert.ok(pending, "ambiguous checkout must preserve the pending intent");

    const resumeOutcome = await coordinator.reconcilePending();
    assert.equal(resumeOutcome?.status, "unknown");
    assert.equal(purchaseCalls.length, 1, "background reconciliation must not reopen checkout");

    checkoutShouldTimeout = false;
    const retryOutcome = await coordinator.purchase("probe_product", "probe.catalog.item");
    assert.equal(retryOutcome.status, "confirmed", "a fresh direct tap must recover the unresolved purchase");
    assert.equal(purchaseCalls.length, 2, "the fresh tap must make exactly one retry");
    assert.equal(saves, 1, "the retry must not create a second logical intent");
    assert.equal(purchaseCalls[0].itemId, purchaseCalls[1].itemId);
    assert.equal(purchaseCalls[0].idempotencyKey, purchaseCalls[1].idempotencyKey);
    assert.equal(pending, null, "confirmation must clear the pending intent");
}

function probeInTypeStrippingProcess(coordinatorFile) {
    const result = spawnSync(
        process.execPath,
        ["--no-warnings", "--experimental-strip-types", import.meta.filename, "--runtime-probe", coordinatorFile],
        { encoding: "utf8" },
    );
    if (result.status === 0) return null;
    const detail = (result.stderr || result.stdout || `exit ${result.status}`).trim();
    return `runtime unresolved-intent simulation failed: ${detail}`;
}

async function inspect(targetPath) {
    const candidates = [];
    for (const file of await collectSourceFiles(targetPath)) {
        const source = await readFile(file, "utf8");
        if (isCopiedPurchaseCoordinator(source)) candidates.push({ file, source });
    }

    if (candidates.length === 0) {
        console.log("SKIP no persisted Shop purchase coordinator detected");
        return 0;
    }

    let failures = 0;
    for (const candidate of candidates) {
        const relativeFile = path.relative(process.cwd(), candidate.file) || candidate.file;
        const problems = analyzePurchaseCoordinator(candidate.source);
        if (problems.length === 0) {
            const runtimeProblem = probeInTypeStrippingProcess(candidate.file);
            if (runtimeProblem) problems.push(runtimeProblem);
        }
        if (problems.length === 0) {
            console.log(`PASS ${relativeFile}: unresolved purchase recovery simulation`);
            continue;
        }

        failures += 1;
        console.error(`FAIL ${relativeFile}: unresolved purchase recovery contract`);
        for (const problem of problems) console.error(`  - ${problem}`);
    }
    return failures === 0 ? 0 : 1;
}

function selfTest() {
    const fixed = `
    async function attempt(intent) {
      return config.shop.purchase(intent.catalogItemId, intent.idempotencyKey);
    }
    async function runNew(productId, catalogItemId) {
      const existing = config.pending.load();
      if (existing) {
        const reconciled = await reconcile(existing);
        if (reconciled.status === 'confirmed') return reconciled;
        if (existing.productId === productId && existing.catalogItemId === catalogItemId) {
          return attempt(existing);
        }
        return reconciled;
      }
    }
    return {
      async reconcilePending() {
        const intent = config.pending.load();
        return intent ? reconcile(intent) : null;
      },
      pendingIntent: () => config.pending.load(),
    };
  `;
    const stale = `
    async function attempt(intent) {
      return config.shop.purchase(intent.catalogItemId, intent.idempotencyKey);
    }
    async function runNew() {
      const existing = config.pending.load();
      if (existing) return reconcile(existing);
    }
    return {
      async reconcilePending() {
        const intent = config.pending.load();
        return intent ? reconcile(intent) : null;
      },
      pendingIntent: () => config.pending.load(),
    };
  `;
    const unsafeBackgroundRetry = fixed.replace(
        "return intent ? reconcile(intent) : null;",
        "return intent ? attempt(intent) : null;",
    );

    assert.deepEqual(analyzePurchaseCoordinator(fixed), []);
    assert.match(analyzePurchaseCoordinator(stale).join("\n"), /fresh direct tap/);
    assert.match(analyzePurchaseCoordinator(unsafeBackgroundRetry).join("\n"), /background reconciliation/);
    console.log("PASS purchase recovery checker self-test");
}

const target = process.argv[2];
if (!target) {
    console.error("Usage: check-purchase-recovery.mjs <project-directory|coordinator-file>");
    process.exitCode = 2;
} else if (target === "--runtime-probe") {
    await runRuntimeProbe(path.resolve(process.argv[3]));
} else if (target === "--self-test") {
    selfTest();
} else {
    process.exitCode = await inspect(path.resolve(target));
}
