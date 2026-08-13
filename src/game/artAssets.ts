/**
 * `target.png` disc layout (texels → UV). Physics face center/radius must pin to
 * this disc so a side-view Y-slice matches what the player sees:
 *   center height → bullseye · top/bottom of disc → outer ring.
 */
export const TARGET_DISC = {
    /** Horizontal center of the painted disc. */
    anchorX: 0.478,
    /** Vertical center of the painted disc. */
    anchorY: 0.502,
    /** Outer disc radius in texture pixels. */
    radiusPx: 376.5,
} as const;

/** Bundled Odyssey sprite and backdrop URLs (Vite resolves via import.meta.url). */
export const ODYSSEY_ART = {
    level1: new URL("../assets/art/odyssey/level-1.webp", import.meta.url).href,
    level2: new URL("../assets/art/odyssey/level-2.webp", import.meta.url).href,
    level3: new URL("../assets/art/odyssey/level-3.webp", import.meta.url).href,
    ulyssesUpper: new URL("../assets/art/odyssey/ulysses-upper.png", import.meta.url).href,
    ulyssesLower: new URL("../assets/art/odyssey/ulysses-lower.png", import.meta.url).href,
    ulyssesBelt: new URL("../assets/art/odyssey/ulysses-belt.png", import.meta.url).href,
    target: new URL("../assets/art/odyssey/target.png", import.meta.url).href,
    pillar: new URL("../assets/art/odyssey/pillar.png", import.meta.url).href,
    rock: new URL("../assets/art/odyssey/rock.png", import.meta.url).href,
} as const;

export type OdysseyArtKey = keyof typeof ODYSSEY_ART;

/** Lightweight 2-bone rig for aim (feet fixed, torso+bow rotate at belt). */
export interface UlyssesRig {
    fullSize: [number, number];
    hip: [number, number];
    feetY: number;
    upper: { box: [number, number, number, number]; size: [number, number]; pivot: [number, number] };
    lower: { box: [number, number, number, number]; size: [number, number]; pivot: [number, number] };
    belt: { box: [number, number, number, number]; size: [number, number]; pivot: [number, number] };
    bowTip: [number, number];
    bowTipInUpper: [number, number];
}
