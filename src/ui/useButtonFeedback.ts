/**
 * Sound and haptics for every button in the game, from one place.
 *
 * Delegated rather than wired per component: any new button added to a fork
 * would otherwise silently ship without feedback. A single capture-phase
 * listener cannot be forgotten. Screens keep only their OUTCOME cues
 * (reward/error) — the plain click acknowledgement lives here.
 *
 * Fires on click, not pointerdown: the release is the moment the button
 * actually commits, and press-and-drag-away no longer acknowledges an action
 * that never happened.
 */
import { useEffect } from "react";
import { audioManager, type SfxCue } from "../audio/audioManager.ts";
import { runtimeServices } from "../systems/runtimeServices.ts";
import type { HapticStyle } from "../sdk/runSdk.ts";

/** Weightier feedback for the choices that actually commit to something. */
function feedbackFor(element: HTMLElement): { cue: SfxCue; haptic: HapticStyle } {
    // ADAPT: map the game's own CTA classes to heavier cues.
    if (element.closest(".ody-btn:not(.ody-btn-blue):not(.ody-btn-slate), .claim-action, .level-chip"))
        return { cue: "start", haptic: "medium" };
    return { cue: "tap", haptic: "light" };
}

export function useButtonFeedback(): void {
    useEffect(() => {
        const onClick = (event: Event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            const control = target.closest("button, input[type='checkbox'], select, [role='tab']");
            if (!(control instanceof HTMLElement)) return;
            // A disabled control gives no feedback: pretending a dead button
            // responded is worse than silence.
            if (control.matches(":disabled")) return;

            const { cue, haptic } = feedbackFor(control);
            audioManager.play(cue);
            // Fire and forget. runtimeServices.haptic already respects the
            // player's haptics setting and resolves false off-device.
            void runtimeServices.haptic(haptic);
        };

        window.addEventListener("click", onClick, { capture: true });
        return () => window.removeEventListener("click", onClick, { capture: true });
    }, []);
}
