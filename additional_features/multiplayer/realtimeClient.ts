/** Current realtime API (not the deprecated `rooms` namespace). */
import type { ServerRoom } from "@series-inc/rundot-game-sdk";
import { api, guarded, requireExplicitAction } from "../client/guards";

export type DemoRoomMessage =
    | { type: "move"; x: number; y: number }
    | { type: "state"; moves: Array<{ playerId: string; x: number; y: number }> };

export async function createDemoRoom(playerTapped: boolean): Promise<ServerRoom<DemoRoomMessage>> {
    requireExplicitAction(playerTapped, "Create room");
    return guarded("create realtime room", () =>
        api.realtime.createRoom<DemoRoomMessage>("template-demo-room", {
            createOptions: { maxPlayers: 4, isPrivate: true },
        }),
    );
}

export async function joinDemoRoom(code: string, playerTapped: boolean): Promise<ServerRoom<DemoRoomMessage>> {
    requireExplicitAction(playerTapped, "Join room");
    const room = await guarded("join realtime room", () => api.realtime.joinRoomByCode<DemoRoomMessage>(code));
    room.on({
        onMessage: (message) => console.info("room message", message),
        onDelta: () => console.info("authoritative world delta received"),
        onResync: () => console.info("full authoritative state must be reloaded"),
        onError: (message) => console.warn("room error", message),
    });
    return room;
}

export function sendMove(room: ServerRoom<DemoRoomMessage>, x: number, y: number): void {
    room.send({ type: "move", x, y });
}
