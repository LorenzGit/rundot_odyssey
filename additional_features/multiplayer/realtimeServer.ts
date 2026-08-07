import { GameRoom, type GameMessage, type Player } from "@series-inc/rundot-game-sdk/mp-server";
import type { DemoRoomMessage } from "./realtimeClient";

interface Move {
    playerId: string;
    x: number;
    y: number;
}

export default class DemoRoomServer extends GameRoom<DemoRoomMessage> {
    private moves: Move[] = [];

    protected override getPersistState(): Record<string, unknown> {
        return { schemaVersion: 1, moves: this.moves };
    }

    protected override onRestore(snapshot: Record<string, unknown>): void {
        const moves = Array.isArray(snapshot.moves) ? snapshot.moves : [];
        this.moves = moves.filter(isMove);
    }

    protected override onPlayerJoin(player: Player): void {
        this.sendTo(player.id, { type: "state", moves: this.moves });
    }

    protected override onGameMessage(message: GameMessage<DemoRoomMessage>): void {
        if (message.payload.type !== "move") return;
        const x = finiteCoordinate(message.payload.x);
        const y = finiteCoordinate(message.payload.y);
        const move = { playerId: message.sender.id, x, y };
        this.moves.push(move);
        this.moves = this.moves.slice(-100);
        this.broadcast({ type: "move", x, y });
        this.save();
    }
}

function finiteCoordinate(value: number): number {
    if (!Number.isFinite(value)) throw new Error("Move coordinate must be finite");
    return Math.max(-10_000, Math.min(10_000, value));
}

function isMove(value: unknown): value is Move {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<Move>;
    return (
        typeof candidate.playerId === "string" &&
        typeof candidate.x === "number" &&
        Number.isFinite(candidate.x) &&
        typeof candidate.y === "number" &&
        Number.isFinite(candidate.y)
    );
}
