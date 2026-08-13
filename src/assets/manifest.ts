/**
 * Boot assets stay renderer-free. Importing Pixi here put the entire gameplay
 * renderer on the critical path even though the menu is ordinary DOM/CSS.
 *
 * The source masters remain full-resolution PNGs in this folder. Production
 * uses full-resolution, high-quality WebP encodes at the same 1504x688 size.
 */
import shoreBackdropUrl from "./art/odyssey/level-1.webp";

export const MENU_BACKDROP = {
    id: "menu_backdrop",
    url: shoreBackdropUrl,
} as const;
