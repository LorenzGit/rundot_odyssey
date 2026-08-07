/** Creator moderation APIs. Role-check every privileged operation. */
import { api, guarded, requireExplicitAction } from "./guards";

export async function inspectModerationQueues() {
    return guarded("moderation reads", async () => {
        const role = await api.app.getMyRole();
        if (role === "none") throw new Error("Creator role required");
        return {
            role,
            ugcReports: await api.app.adminUgc.listReports({ status: "pending", limit: 20 }),
            imageReports: await api.app.adminImageGen.listReports({ status: "pending", limit: 20 }),
            videoReports: await api.app.adminVideoGen.listReports({ status: "pending", limit: 20 }),
            spriteReports: await api.app.adminSpriteGen.listReports({ status: "pending", limit: 20 }),
            audioReports: await api.app.adminAudioGen.listReports({ status: "pending", limit: 20 }),
            threeDReports: await api.app.adminThreeDGen.listReports({ status: "pending", limit: 20 }),
        };
    });
}

export async function resolveUgcReport(reportId: string, action: "reviewed" | "dismissed", creatorConfirmed: boolean) {
    requireExplicitAction(creatorConfirmed, "Moderation action");
    return guarded("UGC report resolution", async () => {
        const role = await api.app.getMyRole();
        if (role !== "owner" && role !== "editor") throw new Error("Creator role required");
        await api.app.adminUgc.resolveReport(reportId, action);
    });
}
