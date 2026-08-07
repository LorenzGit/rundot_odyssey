/**
 * Minimal deterministic Syncplay simulation. Rendering, DOM, clocks, storage,
 * network calls, and Math.random never enter this file.
 */
import {
    createSyncplayGameRuntime,
    defineSyncplayGame,
    type DeterministicStep,
} from "@series-inc/rundot-game-sdk/syncplay/creator";

export interface CounterInput {
    direction: number;
    reset: boolean;
}

export interface CounterState {
    frame: number;
    values: number[];
}

export const counterDescriptor = defineSyncplayGame({
    deterministicVersion: "template-counter@1",
    tickRate: 30,
    maxPlayers: 4,
    input: {
        id: "template-counter-input/v1",
        fields: [
            { name: "direction", kind: "integer", policy: "repeat", defaultValue: 0, min: -1, max: 1 },
            { name: "reset", kind: "boolean", policy: "command", defaultValue: false },
        ],
    },
    state: {
        id: "template-counter-state/v1",
        fields: [
            { name: "frame", kind: "integer", checksummed: true, min: 0, max: 2_147_483_647 },
            {
                name: "values",
                kind: "integer",
                collectionOrdering: "indexed",
                checksummed: true,
                min: -1_000_000,
                max: 1_000_000,
            },
        ],
    },
    systems: [{ id: "input" }],
});

export const stepCounter: DeterministicStep<CounterState, CounterInput> = (state, inputs, frame) => {
    const reset = inputs.some((input) => input.reset);
    const values = reset ? state.values.map(() => 0) : [...state.values];
    if (!reset) {
        const slotCount = Math.min(inputs.length, values.length);
        for (let slot = 0; slot < slotCount; slot += 1) {
            const input = inputs[slot];
            const current = values[slot];
            if (!input || current === undefined) continue;
            values[slot] = Math.max(-1_000_000, Math.min(1_000_000, current + input.direction));
        }
    }
    return { frame: frame + 1, values };
};

export function createOfflineCounter(playerCount = 2) {
    const slots = Math.max(1, Math.min(4, Math.floor(playerCount)));
    return createSyncplayGameRuntime<CounterState, CounterInput>({
        descriptor: counterDescriptor,
        playerCount: slots,
        initialState: { frame: 0, values: Array.from({ length: slots }, () => 0) },
        defaultInput: { direction: 0, reset: false },
        step: stepCounter,
    });
}
