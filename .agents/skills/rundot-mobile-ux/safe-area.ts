/**
 * Read the host safe-area insets and expose them as CSS variables.
 *
 * Copy into `src/ui/safe-area.ts`. After this runs, CSS can anchor against
 * --safe-top / --safe-right / --safe-bottom / --safe-left (all px). Call AFTER
 * the SDK has initialized (e.g. after your first await / in a ready hook) —
 * getSafeArea() throws pre-init on a real device. The value is static; call once.
 */
import RundotGameAPI from "@series-inc/rundot-game-sdk/api";

export function applySafeAreaVars(target: HTMLElement = document.documentElement): void {
    try {
        const { top, right, bottom, left } = RundotGameAPI.system.getSafeArea();
        target.style.setProperty("--safe-top", `${top}px`);
        target.style.setProperty("--safe-right", `${right}px`);
        target.style.setProperty("--safe-bottom", `${bottom}px`);
        target.style.setProperty("--safe-left", `${left}px`);
    } catch (err) {
        // Thrown when read before SDK init — call this after init in every environment.
        RundotGameAPI.error("mobile-ux: getSafeArea() read before init", err);
    }
}
