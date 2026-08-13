/**
 * Typed RUN boundary. SDK 5.24 initializes on import; this facade waits only
 * for a bounded host handshake and keeps platform calls out of game/UI code.
 *
 * Posture (applies to ALL SDK usage): every RundotGameAPI call can reject,
 * and an unhandled rejection crashes the game — so everything here is
 * try/catch'd, and outside the RUN host (plain `vite dev` in a browser) the
 * app must boot and run anyway.
 */
import RundotGameAPI from "@series-inc/rundot-game-sdk/api";
import { audioManager } from "../audio/audioManager.ts";
import { safeAreaOffsetsForFrame } from "./safeArea.ts";
// Type-only import from the package root (the /api entry doesn't re-export it);
// erased at build time, so no extra runtime code is pulled in.
import { HapticFeedbackStyle } from "@series-inc/rundot-game-sdk";
import type { IdentityChangedEvent, Subscription } from "@series-inc/rundot-game-sdk";

let _ready = false;

export interface RunCapabilities {
    host: boolean;
    mock: boolean;
    storage: boolean;
    analytics: boolean;
    liveops: boolean;
    notifications: boolean;
    haptics: boolean;
    ads: boolean;
    purchases: boolean;
    subscriptions: boolean;
    leaderboard: boolean;
    popups: boolean;
}

const OFFLINE_CAPABILITIES: RunCapabilities = {
    host: false,
    mock: false,
    storage: false,
    analytics: false,
    liveops: false,
    notifications: false,
    haptics: false,
    ads: false,
    purchases: false,
    subscriptions: false,
    leaderboard: false,
    popups: false,
};

let capabilities: RunCapabilities = OFFLINE_CAPABILITIES;

function sdkNamespace(name: string): boolean {
    return typeof (RundotGameAPI as unknown as Record<string, unknown>)[name] === "object";
}

/**
 * PITFALL: there is NO runtime RundotGameAPI.haptics namespace (the HapticsApi
 * interface in the .d.ts is types-only). Support comes from DeviceInfo, and the
 * trigger lives on the API root. Read LIVE at every call site that acts on it:
 * `enabled` reflects the player's system setting, which can change mid-session,
 * and a cached false at boot must never gate a later action.
 */
function hapticsAvailableNow(): boolean {
    if (!_ready) return false;
    try {
        const device = RundotGameAPI.system.getDevice();
        return device?.haptics?.supported === true && device?.haptics?.enabled === true;
    } catch {
        return false;
    }
}

function snapshotCapabilities(): RunCapabilities {
    if (!_ready) return OFFLINE_CAPABILITIES;
    const environment = RundotGameAPI._environmentData?.capabilities;
    return {
        host: true,
        mock: RundotGameAPI.isMock(),
        storage: sdkNamespace("appStorage"),
        analytics: sdkNamespace("analytics"),
        liveops: sdkNamespace("liveops"),
        notifications: sdkNamespace("notifications"),
        haptics: hapticsAvailableNow(),
        ads: environment?.ads === true,
        purchases: environment?.purchases === true,
        subscriptions: environment?.subscriptions === true,
        leaderboard: sdkNamespace("leaderboard"),
        popups: sdkNamespace("popups"),
    };
}

export function getRunCapabilities(): Readonly<RunCapabilities> {
    return capabilities;
}

/**
 * Re-read host capabilities. Wired to onAwake (the SDK's "refresh stale data"
 * hook) so a session that started before a grant or attach does not stay
 * frozen on its boot snapshot.
 */
export function refreshRunCapabilities(): Readonly<RunCapabilities> {
    capabilities = snapshotCapabilities();
    return capabilities;
}

export interface RunSafeArea {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

const ZERO_SAFE_AREA: Readonly<RunSafeArea> = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

function normalizeSafeArea(area: Partial<RunSafeArea>): RunSafeArea {
    return {
        top: Math.max(0, Number(area.top) || 0),
        right: Math.max(0, Number(area.right) || 0),
        bottom: Math.max(0, Number(area.bottom) || 0),
        left: Math.max(0, Number(area.left) || 0),
    };
}

function readViewDeckSafeArea(): RunSafeArea | null {
    const serialized = document.documentElement.dataset.viewdeckSafeArea;
    if (!serialized) return null;
    try {
        return normalizeSafeArea(JSON.parse(serialized) as Partial<RunSafeArea>);
    } catch {
        return null;
    }
}

export function getRunSafeArea(): Readonly<RunSafeArea> {
    // ViewDeck's device profile is authoritative while it is simulating a
    // handset. Its oriented values must win over the SDK's local mock, whose
    // browser-derived env() values can remain in portrait after rotation.
    const viewDeckArea = readViewDeckSafeArea();
    if (viewDeckArea) return viewDeckArea;
    if (!_ready) return ZERO_SAFE_AREA;
    try {
        return normalizeSafeArea(RundotGameAPI.system.getSafeArea());
    } catch {
        return ZERO_SAFE_AREA;
    }
}

/** Publish the resolved device insets without coupling UI code to the source. */
export function applyRunSafeArea(): Readonly<RunSafeArea> {
    const viewDeckArea = readViewDeckSafeArea();
    const root = document.documentElement;
    if (import.meta.env.DEV) {
        const count = Number(root.dataset.safeAreaRefreshCount ?? 0);
        root.dataset.safeAreaRefreshCount = String(count + 1);
    }
    if (viewDeckArea) {
        // Keep ViewDeck's custom properties live instead of copying a snapshot.
        // Its rotation updates then flow through CSS without a reload or race.
        for (const edge of ["top", "right", "bottom", "left"]) {
            root.style.removeProperty(`--safe-${edge}`);
        }
        return viewDeckArea;
    }
    const area = getRunSafeArea();
    // Outside RUN, leave the stylesheet's ViewDeck/browser fallback chain
    // intact. Publishing zero-valued host data would erase real device insets.
    if (!_ready) return area;
    // Host insets are viewport-relative, but #app-frame is letterboxed: on any
    // viewport wider than --game-w, raw values overpad the frame by the gutter.
    // Convert to frame-local offsets, clamped at zero because --safe-* is
    // consumed as padding.
    const frame = document.getElementById("app-frame");
    const local = frame
        ? safeAreaOffsetsForFrame(area, frame.getBoundingClientRect(), {
              width: window.innerWidth,
              height: window.innerHeight,
          })
        : area;
    root.style.setProperty("--safe-top", `${Math.max(0, local.top)}px`);
    root.style.setProperty("--safe-right", `${Math.max(0, local.right)}px`);
    root.style.setProperty("--safe-bottom", `${Math.max(0, local.bottom)}px`);
    root.style.setProperty("--safe-left", `${Math.max(0, local.left)}px`);
    return area;
}

export async function withTimeout<T>(operation: Promise<T>, timeoutMs = 2_000, label = "RUN operation"): Promise<T> {
    let timeoutId = 0;
    const timeout = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    });
    try {
        return await Promise.race([operation, timeout]);
    } finally {
        window.clearTimeout(timeoutId);
    }
}

/** True once the import-initialized SDK reports an attached host/mock. */
export function sdkReady(): boolean {
    return _ready;
}

/**
 * SDK 5.24 initializes on import. In a RUN iframe, allow a short bounded
 * handshake; in ordinary local development return immediately.
 */
export async function initSdk(): Promise<boolean> {
    const embedded = window.parent !== window;
    const deadline = performance.now() + (embedded ? 1_500 : 0);
    do {
        try {
            if (RundotGameAPI.isAvailable() || RundotGameAPI.isMock()) {
                _ready = true;
                break;
            }
        } catch {
            break;
        }
        await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
    } while (performance.now() < deadline);

    capabilities = snapshotCapabilities();
    if (!_ready) {
        console.info("[runSdk] RUN host unavailable; using local non-authoritative fallbacks");
        // Inside an iframe the host is expected — a cold WebView can simply be
        // slower than the bounded handshake. Keep watching so a late attach
        // upgrades this session instead of stranding it offline until relaunch.
        if (embedded) watchForLateHostAttach();
    }
    return _ready;
}

function watchForLateHostAttach(): void {
    const deadline = performance.now() + 30_000;
    const watcher = window.setInterval(() => {
        try {
            if (RundotGameAPI.isAvailable() || RundotGameAPI.isMock()) {
                window.clearInterval(watcher);
                _ready = true;
                capabilities = snapshotCapabilities();
                applyRunSafeArea();
                console.info("[runSdk] RUN host attached after the boot handshake; capabilities refreshed");
                return;
            }
        } catch {
            window.clearInterval(watcher);
            return;
        }
        if (performance.now() >= deadline) window.clearInterval(watcher);
    }, 500);
}

export async function readAppStorage(key: string): Promise<{ ok: boolean; value: string | null }> {
    if (!capabilities.storage) return { ok: false, value: null };
    try {
        const value = await withTimeout(RundotGameAPI.appStorage.getItem(key), 2_000, "appStorage.getItem");
        return { ok: true, value };
    } catch (error) {
        console.warn("[runSdk] appStorage read failed", error);
        return { ok: false, value: null };
    }
}

export async function writeAppStorage(key: string, value: string): Promise<boolean> {
    if (!capabilities.storage) return false;
    try {
        await withTimeout(RundotGameAPI.appStorage.setItem(key, value), 2_000, "appStorage.setItem");
        return true;
    } catch (error) {
        console.warn("[runSdk] appStorage write failed", error);
        return false;
    }
}

export async function requestServerEpochMs(): Promise<number | null> {
    if (!_ready) return null;
    try {
        const result = await withTimeout(RundotGameAPI.requestTimeAsync(), 2_000, "requestTimeAsync");
        return typeof result.serverTime === "number" ? result.serverTime : null;
    } catch (error) {
        console.warn("[runSdk] trusted time unavailable", error);
        return null;
    }
}

export type NotificationPreferenceResult = "enabled" | "disabled" | "unavailable" | "failed";

export async function setNotificationPreference(enabled: boolean): Promise<NotificationPreferenceResult> {
    if (!capabilities.notifications) return "unavailable";
    try {
        await withTimeout(
            RundotGameAPI.notifications.setLocalNotificationsEnabled(enabled),
            4_000,
            "notifications.setLocalNotificationsEnabled",
        );
        const actual = await withTimeout(
            RundotGameAPI.notifications.isLocalNotificationsEnabled(),
            2_000,
            "notifications.isLocalNotificationsEnabled",
        );
        if (actual !== enabled) return "failed";
        return enabled ? "enabled" : "disabled";
    } catch (error) {
        console.warn("[runSdk] notification preference failed", error);
        return "failed";
    }
}

export type HapticStyle = "light" | "medium" | "heavy" | "success" | "warning" | "error";

export async function triggerHaptic(style: HapticStyle): Promise<boolean> {
    // Live read, not the boot snapshot: the player can toggle system haptics
    // mid-session, and a cached false must never gate a later action.
    if (hapticsAvailableNow()) {
        try {
            const map: Record<HapticStyle, HapticFeedbackStyle> = {
                light: HapticFeedbackStyle.Light,
                medium: HapticFeedbackStyle.Medium,
                heavy: HapticFeedbackStyle.Heavy,
                success: HapticFeedbackStyle.Success,
                warning: HapticFeedbackStyle.Warning,
                error: HapticFeedbackStyle.Error,
            };
            await withTimeout(RundotGameAPI.triggerHapticAsync(map[style]), 1_000, "triggerHapticAsync");
            return true;
        } catch {
            // fall through to the web-vibration fallback
        }
    }
    // Outside a haptics-capable host: navigator.vibrate covers Android web;
    // iOS Safari has no vibration API, so this is a silent no-op there.
    try {
        const nav = navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean };
        if (typeof nav.vibrate === "function") {
            const patterns: Record<HapticStyle, number | number[]> = {
                light: 10,
                medium: 20,
                heavy: 40,
                success: [15, 40, 15],
                warning: [25, 40, 25],
                error: [35, 50, 35],
            };
            return nav.vibrate(patterns[style]);
        }
    } catch {
        // no vibration surface — fine
    }
    return false;
}

export interface RunLiveOpsSnapshot {
    values: Record<string, unknown>;
    configVersion: string;
    nextChangeAt: number | null;
    activeOverrideIds: string[];
}

export async function fetchLiveOps(): Promise<RunLiveOpsSnapshot | null> {
    if (!capabilities.liveops) return null;
    try {
        const result = await withTimeout(RundotGameAPI.liveops.getConfigAsync(), 3_000, "liveops.getConfigAsync");
        return {
            values: result.values,
            configVersion: result.configVersion,
            nextChangeAt: result.nextChangeAt,
            activeOverrideIds: result.activeOverrideIds,
        };
    } catch (error) {
        console.warn("[runSdk] LiveOps unavailable; defaults retained", error);
        return null;
    }
}

export async function recordAnalytics(eventName: string, payload: Record<string, unknown> = {}): Promise<boolean> {
    if (!capabilities.analytics) return false;
    try {
        await withTimeout(
            RundotGameAPI.analytics.recordCustomEvent(eventName, payload),
            1_500,
            "analytics.recordCustomEvent",
        );
        return true;
    } catch {
        return false;
    }
}

/** Human-readable production error log for RUN support tooling. */
export function recordErrorLog(context: string, message: string, payload: Record<string, unknown> = {}): void {
    if (!_ready) return;
    try {
        RundotGameAPI.error(`[odyssey:${context}] ${message.slice(0, 300)}`, payload);
    } catch {
        // Logging is observational and must never alter gameplay or recovery.
    }
}

export async function recordFunnelStep(step: number, name: string, funnel: string, funnelOrder = 0): Promise<boolean> {
    if (!capabilities.analytics) return false;
    try {
        await withTimeout(
            RundotGameAPI.analytics.trackFunnelStep(step, name, funnel, funnelOrder),
            1_500,
            "analytics.trackFunnelStep",
        );
        return true;
    } catch {
        return false;
    }
}

export type LeaderboardSubmission =
    | { status: "ranked"; rank: number | null }
    | { status: "not_improved"; reason: string | null; rank: null }
    | { status: "unavailable" | "failed"; rank: null };

/** Submit the deterministic career depth to RUN's keep-best all-time board. */
export async function submitCareerDepth(input: {
    depth: number;
    durationSeconds: number;
    stars: number;
    score: number;
}): Promise<LeaderboardSubmission> {
    if (!capabilities.leaderboard) return { status: "unavailable", rank: null };
    try {
        const result = await withTimeout(
            RundotGameAPI.leaderboard.submitScore({
                score: Math.max(1, Math.floor(input.depth)),
                // SDK 5.24 validates 10..3600 locally before the host sees the
                // configured board. Keep fast first courses and long-idle
                // courses inside that public contract.
                duration: Math.max(10, Math.min(3_600, Math.ceil(input.durationSeconds))),
                period: "alltime",
                metadata: {
                    course: Math.max(1, Math.floor(input.depth)),
                    stars: Math.max(1, Math.min(3, Math.floor(input.stars))),
                    shot_score: Math.max(0, Math.floor(input.score)),
                },
            }),
            5_000,
            "leaderboard.submitScore",
        );
        return result.accepted
            ? { status: "ranked", rank: typeof result.rank === "number" ? result.rank : null }
            : { status: "not_improved", reason: result.reason ?? null, rank: null };
    } catch (error) {
        console.warn("[runSdk] leaderboard submission failed", error);
        return { status: "failed", rank: null };
    }
}

export type LikePromptOutcome = "liked" | "dismissed" | "already_liked" | "unavailable" | "failed";

/** Ask once, after a satisfying achievement, using only platform-owned UI. */
export async function showContextualLikePrompt(): Promise<LikePromptOutcome> {
    if (!capabilities.popups) return "unavailable";
    try {
        const state = await withTimeout(RundotGameAPI.popups.getLikeState(), 2_000, "popups.getLikeState");
        if (state.isLiked) return "already_liked";
        const capability = await withTimeout(
            RundotGameAPI.popups.canShowLikeDialog(),
            2_000,
            "popups.canShowLikeDialog",
        );
        if (!capability.available) return "unavailable";
        // This is player-mediated UI; do not time it out while the player acts.
        const result = await withHostOverlay(() => RundotGameAPI.popups.showLikeDialog());
        if (!result.shown) return "unavailable";
        return result.liked ? "liked" : "dismissed";
    } catch (error) {
        console.warn("[runSdk] Like prompt failed", error);
        return "failed";
    }
}

/**
 * Cancel a scheduled local notification. Used as the retention kill switch:
 * once the reward a reminder promised has been claimed, the reminder must go.
 */
export async function cancelLocalNotification(id: string): Promise<void> {
    if (!capabilities.notifications) return;
    try {
        await withTimeout(RundotGameAPI.notifications.cancelNotification(id), 1_500, "notifications.cancel");
    } catch (error) {
        console.warn("[runSdk] notification cancel failed", error);
    }
}

/**
 * How this session was launched (notification tap, share, deep link, or cold).
 * Returns null when the host cannot answer — `timed_out` is deliberately
 * treated as "unknown", never as "organic", so attribution stays honest.
 */
export async function resolveLaunchIntent(): Promise<{ kind: string; params: Record<string, string> } | null> {
    if (!_ready) return null;
    try {
        const intent = await withTimeout(
            RundotGameAPI.app.resolveLaunchIntent({ maxWaitMs: 800 }),
            1_500,
            "app.resolveLaunchIntent",
        );
        if (!intent || intent.kind === "timed_out") return null;
        return { kind: intent.kind, params: intent.params ?? {} };
    } catch {
        return null;
    }
}

/**
 * Landing attribution (UTM / click ids), merged into `session_start` so paid
 * and organic cohorts are separable without a dashboard join. Web-only and
 * best-effort: the namespace is absent in most hosts, so absence is normal and
 * must never delay boot.
 */
export async function readAttribution(): Promise<Record<string, string>> {
    const fields: Record<string, string> = {};
    if (!sdkNamespace("attribution")) return fields;
    try {
        const params = await withTimeout(
            RundotGameAPI.attribution.getAttributionParams(),
            1_500,
            "attribution.getAttributionParams",
        );
        if (!params) return fields;
        const source = params as unknown as Record<string, unknown>;
        for (const field of ["utm_source", "utm_medium", "utm_campaign", "fbclid", "gclid"] as const) {
            const value = source[field];
            if (typeof value === "string" && value !== "") fields[field] = value;
        }
    } catch {
        // attribution is observational; never let it block or throw into boot
    }
    return fields;
}

export async function rearmLocalNotification(input: {
    id: string;
    legacyIds?: readonly string[];
    title: string;
    body: string;
    delaySeconds: number;
}): Promise<boolean> {
    if (!capabilities.notifications) return false;
    try {
        for (const id of new Set([input.id, ...(input.legacyIds ?? [])])) {
            await withTimeout(RundotGameAPI.notifications.cancelNotification(id), 1_500, "notifications.cancel");
        }
        const result = await withTimeout(
            RundotGameAPI.notifications.submitMessageAsync({
                channels: ["local"],
                title: input.title,
                body: input.body,
                delaySeconds: Math.max(60, input.delaySeconds),
                notificationId: input.id,
                collapseKey: input.id,
                // Rides back to us as `LaunchIntent.params` when the player taps
                // the notification — without it a notification-driven return is
                // indistinguishable from an organic one.
                payload: { reminder_id: input.id },
            }),
            3_000,
            "notifications.submitMessage",
        );
        return result.results.some((channel) => channel.channel === "local" && channel.status === "scheduled");
    } catch (error) {
        console.warn("[runSdk] notification re-arm failed", error);
        return false;
    }
}

export type VerifiedActionResult = "verified" | "unavailable" | "cancelled" | "failed";

let hostOverlayCount = 0;

/** Whether an ad, checkout, or other game-requested host surface is open. */
export function hostOverlayInFlight(): boolean {
    return hostOverlayCount > 0;
}

/**
 * Own the complete lifetime of host-mediated UI at the SDK boundary. The
 * counter makes overlapping surfaces safe and keeps audio suspended until the
 * final surface closes.
 *
 * Exported: game code opening any host-owned surface of its own (an offer
 * sheet, an external link) must reuse this guard rather than reinventing it.
 */
export async function withHostOverlay<T>(run: () => Promise<T>): Promise<T> {
    hostOverlayCount += 1;
    if (hostOverlayCount === 1) audioManager.setHostOverlayVisible(true);
    try {
        return await run();
    } finally {
        // Clamped so a double-release can never leave the count negative and
        // the audio guard permanently stuck.
        hostOverlayCount = Math.max(0, hostOverlayCount - 1);
        if (hostOverlayCount === 0) audioManager.setHostOverlayVisible(false);
    }
}

/**
 * Budget for an ad-readiness probe.
 *
 * On web the host answers this from the ad SDK, which on a cold first call
 * waits out its consent manager (~5s) and then loads the ad script (~5s). The
 * old 2s budget expired during that first probe and reported "no ad available"
 * on a host that was merely still warming up — while every later probe, served
 * from the host's cache, returned instantly. That is what made rewarded ads
 * work only sometimes.
 */
const AD_READY_TIMEOUT_MS = 12_000;

/** True when the host can currently show a rewarded ad. */
export async function isRewardedAdReady(): Promise<boolean> {
    if (!capabilities.ads) return false;
    try {
        return (
            (await withTimeout(RundotGameAPI.ads.isRewardedAdReadyAsync(), AD_READY_TIMEOUT_MS, "ads.ready")) === true
        );
    } catch {
        return false;
    }
}

/** True when the host can currently show an interstitial. */
export async function isInterstitialAdReady(): Promise<boolean> {
    if (!capabilities.ads) return false;
    try {
        return (
            (await withTimeout(
                RundotGameAPI.ads.isInterstitialAdReadyAsync(),
                AD_READY_TIMEOUT_MS,
                "ads.interstitial.ready",
            )) === true
        );
    } catch {
        return false;
    }
}

export async function showVerifiedRewardedAd(id: string, name: string): Promise<VerifiedActionResult> {
    if (!capabilities.ads) return "unavailable";
    try {
        const ready = await withTimeout(RundotGameAPI.ads.isRewardedAdReadyAsync(), AD_READY_TIMEOUT_MS, "ads.ready");
        if (!ready) return "unavailable";
        // Do not timeout a user-mediated overlay: the interruption must last
        // until the host tells us it has actually closed.
        const completed = await withHostOverlay(() =>
            RundotGameAPI.ads.showRewardedAdAsync({ adDisplayId: id, adDisplayName: name }),
        );
        return completed === true ? "verified" : "cancelled";
    } catch {
        return "failed";
    }
}

export async function showVerifiedInterstitialAd(id: string, name: string): Promise<VerifiedActionResult> {
    if (!capabilities.ads) return "unavailable";
    try {
        const ready = await withTimeout(
            RundotGameAPI.ads.isInterstitialAdReadyAsync(),
            AD_READY_TIMEOUT_MS,
            "ads.interstitial.ready",
        );
        if (!ready) return "unavailable";
        const displayed = await withHostOverlay(() =>
            RundotGameAPI.ads.showInterstitialAd({ adDisplayId: id, adDisplayName: name }),
        );
        return displayed === true ? "verified" : "unavailable";
    } catch {
        return "failed";
    }
}

/**
 * Outcome of a RUN checkout, carrying enough detail to tell a clean, uncharged
 * decline from a genuinely ambiguous one. Collapsing these (as a bare
 * `catch { return "failed" }` does) makes every dismissed top-up sheet look
 * like an in-flight order.
 */
export type ShopCheckoutResult =
    | { result: "verified" }
    /** The RUN shop is not reachable from this host at all. */
    | { result: "unavailable" }
    /** The host returned a structured verdict; `code` is `RundotApiError.code`. */
    | { result: "rejected"; code: string; message: string }
    /** No verdict ever arrived — transport failure, timeout, or an unsettled order. */
    | { result: "indeterminate"; message: string };

/** The only order status that means the player has actually been served. */
const FULFILLED_ORDER_STATUS = "fulfilled";

export async function purchaseVerifiedShopItem(itemId: string, idempotencyKey: string): Promise<ShopCheckoutResult> {
    if (!capabilities.purchases || !sdkNamespace("shop")) return { result: "unavailable" };
    try {
        // Checkout is host-owned UI. A timeout would clear the audio guard
        // while the purchase sheet could still be open, so wait for the host.
        const response = await withHostOverlay(() => RundotGameAPI.shop.purchase(itemId, idempotencyKey));
        // `success` only reports that the host accepted the request. Replaying
        // an idempotency key returns the ORIGINAL order verbatim, so an order
        // still in `pending_payment` also arrives as `success: true` — paying
        // out on that would grant an unpaid purchase.
        const status = response?.order?.status;
        if (response?.success === true && status === FULFILLED_ORDER_STATUS) return { result: "verified" };
        return { result: "indeterminate", message: `RUN shop returned order status "${status ?? "none"}"` };
    } catch (error) {
        return checkoutRejection(error);
    }
}

/**
 * A structured host rejection carries `RundotApiError.code`; a transport
 * failure or timeout does not. Duck-typed rather than `instanceof`, because
 * that class lives on the package root while this module talks to `/api` —
 * importing it as a value would pull the root bundle in at runtime.
 */
function checkoutRejection(error: unknown): ShopCheckoutResult {
    const code = (error as { code?: unknown } | null)?.code;
    const message = error instanceof Error ? error.message : String(error);
    // "UNKNOWN" is the RPC layer's placeholder for an error envelope that
    // carried no machine code, so it says nothing and must not be trusted.
    return typeof code === "string" && code !== "" && code !== "UNKNOWN"
        ? { result: "rejected", code, message }
        : { result: "indeterminate", message };
}

/**
 * Live catalog price for a shop item, as a display string.
 *
 * Never fall back to a hardcoded number here: a stale price in the UI is a
 * promise the checkout will not keep. `null` means "unknown", and the caller
 * hides the price rather than inventing one.
 */
export async function readShopPrice(itemId: string): Promise<string | null> {
    if (!capabilities.purchases || !sdkNamespace("shop")) return null;
    try {
        const item = await withTimeout(RundotGameAPI.shop.getItemDetail(itemId), 4_000, "shop.getItemDetail");
        const value = item?.price?.value;
        return typeof value === "string" ? value : typeof value === "number" ? String(value) : null;
    } catch (error) {
        console.warn("[runSdk] shop price unavailable", error);
        return null;
    }
}

export interface OwnedEntitlement {
    id: string;
    quantity: number;
    consumable: boolean;
}

/**
 * Active entitlements for this game, or `null` when the host cannot be asked.
 *
 * `null` is deliberately distinct from `[]`: an empty list means the player
 * genuinely owns nothing, while null must never revoke a live grant.
 */
export async function listEntitlements(): Promise<OwnedEntitlement[] | null> {
    if (!_ready || !sdkNamespace("entitlements")) return null;
    try {
        const entitlements = await withTimeout(
            RundotGameAPI.entitlements.listEntitlements(),
            4_000,
            "entitlements.list",
        );
        return entitlements
            .filter((entry) => entry.status === "active" && entry.quantity > 0)
            .map((entry) => ({ id: entry.entitlementId, quantity: entry.quantity, consumable: entry.consumable }));
    } catch (error) {
        console.warn("[runSdk] entitlement read failed", error);
        return null;
    }
}

/**
 * Consume a consumable entitlement and run `grant` exactly once on success.
 *
 * This is the SDK's documented retry shape: the first call generates a
 * referenceId, and if anything after it throws we retry with that same id so
 * the server treats it as the same request. Without that, a failure between
 * "server consumed" and "client saved" would either lose the purchase or pay
 * it out twice.
 *
 * @returns true when the quantity was consumed and the grant applied.
 */
export async function consumeEntitlement(
    entitlementId: string,
    quantity: number,
    grant: () => void | Promise<void>,
    reason = "template-grant",
): Promise<boolean> {
    if (!_ready || !sdkNamespace("entitlements") || quantity <= 0) return false;
    let referenceId: string | undefined;
    // Tracked separately from `referenceId` because the outer promise can
    // still reject after the callback has already paid out — retrying under
    // the same reference is correct, granting a second time is not.
    let granted = false;
    try {
        await withTimeout(
            RundotGameAPI.entitlements.consumeEntitlement(
                entitlementId,
                quantity,
                async (_entitlement, usedReferenceId) => {
                    referenceId = usedReferenceId;
                    await grant();
                    granted = true;
                },
                reason,
            ),
            10_000,
            "entitlements.consume",
        );
        return true;
    } catch (error) {
        if (!referenceId) {
            console.warn("[runSdk] entitlement consume failed", error);
            return false;
        }
        try {
            await withTimeout(
                RundotGameAPI.entitlements.consumeEntitlement(entitlementId, quantity, undefined, reason, referenceId),
                10_000,
                "entitlements.consume.retry",
            );
            if (!granted) await grant();
            return true;
        } catch (retryError) {
            console.warn("[runSdk] entitlement consume retry failed", retryError);
            return false;
        }
    }
}

/** Continue Android back navigation once the template's own stack is empty. */
export async function requestHostExit(reason = "template-root-back"): Promise<boolean> {
    if (!_ready) return false;
    try {
        return await withTimeout(RundotGameAPI.requestPopOrQuit({ reason }), 4_000, "requestPopOrQuit");
    } catch (error) {
        console.warn("[runSdk] host exit request failed", error);
        return false;
    }
}

/**
 * Lifecycle callbacks are `() => void` per the SDK types. Async handlers are
 * fine to pass: a Promise-returning function is assignable where a void
 * return is expected (the SDK just won't await it).
 */
export type LifecycleCallback = () => void;

/** All seven hooks are optional. See registerLifecycles for what each means. */
export interface LifecycleConfig {
    onPause?: LifecycleCallback;
    onResume?: LifecycleCallback;
    onSleep?: LifecycleCallback;
    onAwake?: LifecycleCallback;
    onQuit?: LifecycleCallback;
    onBackButton?: LifecycleCallback;
    onIdentityChanged?: (event: IdentityChangedEvent) => void;
}

/**
 * Register host lifecycle callbacks. All seven hooks are optional; each SDK
 * hook returns an { unsubscribe() } handle, collected so hot-reload / scene
 * swaps can detach cleanly.
 *
 * Hook meanings (SDK docs):
 *   onPause/onResume — host overlay or brief focus loss: pause/resume loops + audio
 *   onSleep/onAwake  — long background suspend: persist progress / refresh stale data
 *   onQuit           — host teardown: last-chance flush (may NOT fire on hard close)
 *   onBackButton     — Android back button (no-op elsewhere); without a handler the
 *                      host quits by default — call RundotGameAPI.requestPopOrQuit()
 *                      yourself when your in-game back navigation is exhausted
 */
export function registerLifecycles({
    onPause,
    onResume,
    onSleep,
    onAwake,
    onQuit,
    onBackButton,
    onIdentityChanged,
}: LifecycleConfig = {}): { unsubscribeAll(): void } {
    const subs: Subscription[] = [];
    const hook = (name: keyof LifecycleConfig, cb: LifecycleCallback | undefined) => {
        if (!cb) return;
        try {
            subs.push(RundotGameAPI.lifecycles[name](cb));
        } catch (err) {
            console.warn(`[runSdk] lifecycles.${name} registration failed`, err);
        }
    };
    hook("onPause", onPause);
    hook("onResume", onResume);
    hook("onSleep", onSleep);
    hook("onAwake", onAwake);
    hook("onQuit", onQuit);
    hook("onBackButton", onBackButton);
    if (onIdentityChanged) {
        try {
            subs.push(RundotGameAPI.lifecycles.onIdentityChanged(onIdentityChanged));
        } catch (error) {
            console.warn("[runSdk] lifecycles.onIdentityChanged registration failed", error);
        }
    }
    return {
        unsubscribeAll() {
            for (const s of subs) {
                try {
                    s?.unsubscribe?.();
                } catch {
                    /* already gone */
                }
            }
            subs.length = 0;
        },
    };
}
