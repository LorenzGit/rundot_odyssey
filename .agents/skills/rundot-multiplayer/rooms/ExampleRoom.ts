import { GameRoom, type GameMessage, type Player, type LeaveReason } from "@series-inc/rundot-game-sdk/mp-server";

/**
 * Minimal server-authoritative GameRoom skeleton for RUN multiplayer.
 *
 * Copy this into your project (e.g. src/rooms/ExampleRoom.ts) and register it
 * in rundot/realtime.config.json:
 *
 *   { "rooms": [ { "type": "example", "file": "src/rooms/ExampleRoom.ts",
 *                  "config": { "maxPlayers": 2, "allowReconnect": true } } ] }
 *
 * The server owns all state and validates every action. Clients only propose
 * moves (room.send) and observe broadcasts (room.on onMessage).
 *
 * Rules of thumb baked in below:
 *  - Validate every inbound message before applying it (never trust the client).
 *  - Send initial state to each joiner via sendTo.
 *  - Handle disconnects/quitters in onPlayerLeave.
 *  - Persist critical state so a crash recovers via onRestore.
 *  - Never name a payload field `type` (the wire protocol overwrites it).
 */

// -- Protocol: one discriminated union covering both directions --------------
interface MoveMessage {
    type: "move";
    cell: number;
}
interface StateMessage {
    type: "state";
    board: string[];
    turn: string; // player id whose turn it is
    winner: string | null;
}
interface ErrorMessage {
    type: "error";
    reason: string;
}
type Protocol = MoveMessage | StateMessage | ErrorMessage;

export default class ExampleRoom extends GameRoom<Protocol> {
    private board: string[] = Array(9).fill("");
    private turn = "";
    private winner: string | null = null;

    onCreate() {
        this.log.info("room created", { roomId: this.roomId, roomType: this.roomType });
    }

    onPlayerJoin(player: Player) {
        // First player to arrive takes the first turn.
        if (this.turn === "") this.turn = player.id;
        // Send current state to the joiner only.
        this.sendTo(player.id, this.stateMessage());
        // Lock once full so no one else can join this match.
        if (this.playerCount >= this.config.maxPlayers) this.lock();
    }

    onGameMessage(message: GameMessage<Protocol>) {
        const { sender, payload } = message;
        if (payload.type !== "move") return;

        // --- SERVER AUTHORITY: validate before mutating -------------------------
        if (this.winner) return; // game over
        if (!sender.connected) return; // defensive
        if (sender.id !== this.turn) {
            this.sendTo(sender.id, { type: "error", reason: "Not your turn" });
            return;
        }
        if (payload.cell < 0 || payload.cell > 8 || this.board[payload.cell] !== "") {
            this.sendTo(sender.id, { type: "error", reason: "Illegal move" });
            return;
        }

        // --- Apply + advance ----------------------------------------------------
        this.board[payload.cell] = sender.username;
        this.winner = this.checkWinner();
        if (!this.winner) this.turn = this.nextPlayerId(sender.id);

        this.broadcast(this.stateMessage());
        this.save(); // persist after a meaningful state change
    }

    onPlayerLeave(player: Player, reason: LeaveReason) {
        this.log.info("player left", { id: player.id, reason });
        // A quitter ends the match here; adapt (pause, forfeit, hand off) to taste.
        if (reason !== "disconnect" && !this.winner && this.playerCount <= 1) {
            this.winner = [...this.players.keys()].find((id) => id !== player.id) ?? null;
            this.broadcast(this.stateMessage());
        }
    }

    onDispose() {
        this.log.info("room disposed", { roomId: this.roomId });
    }

    // -- Persistence (crash recovery) ------------------------------------------
    protected getPersistState() {
        return { board: this.board, turn: this.turn, winner: this.winner };
    }

    onRestore(snapshot: Record<string, unknown>) {
        this.board = (snapshot.board as string[]) ?? Array(9).fill("");
        this.turn = (snapshot.turn as string) ?? "";
        this.winner = (snapshot.winner as string | null) ?? null;
    }

    // -- Helpers ---------------------------------------------------------------
    private stateMessage(): StateMessage {
        return { type: "state", board: this.board, turn: this.turn, winner: this.winner };
    }

    private nextPlayerId(currentId: string): string {
        const ids = [...this.players.keys()];
        if (ids.length === 0) return currentId;
        return ids[(ids.indexOf(currentId) + 1) % ids.length];
    }

    private checkWinner(): string | null {
        const lines = [
            [0, 1, 2],
            [3, 4, 5],
            [6, 7, 8],
            [0, 3, 6],
            [1, 4, 7],
            [2, 5, 8],
            [0, 4, 8],
            [2, 4, 6],
        ];
        for (const [a, b, c] of lines) {
            if (this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c]) {
                return this.board[a];
            }
        }
        return null;
    }
}
