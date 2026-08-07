/** File, clip, UGC, and native-video patterns that need product policy. */
import { api, guarded, requireConfiguredId, requireExplicitAction } from "./guards";

export async function browseCommunityContent(contentType: string) {
    return guarded("UGC browse", async () => ({
        moderationPreview: await api.ugc.checkTextAsync("A player-created title"),
        entries: await api.ugc.browse({ contentType, sortBy: "recent", limit: 20 }),
        count: await api.ugc.count({ contentType }),
    }));
}

export async function inspectOwnedCommunityContent(contentType?: string) {
    return guarded("owned UGC", () => api.ugc.listMine(contentType ? { contentType, limit: 20 } : { limit: 20 }));
}

export async function createPrivateUgc(playerSubmitted: boolean, title: string, data: Record<string, unknown>) {
    requireExplicitAction(playerSubmitted, "UGC creation");
    const moderation = await api.ugc.checkTextAsync(title);
    if (!moderation.clean) throw new Error("Title did not pass the local moderation preview");
    return guarded("UGC create", () =>
        api.ugc.create({
            contentType: "template-demo",
            title,
            data,
            isPublic: false,
        }),
    );
}

export async function readFileState(prefix = "additional-features/") {
    return guarded("file reads", async () => ({
        quota: await api.files.getQuota(),
        files: await api.files.list({ prefix, limit: 20 }),
        completedJobs: await api.files.getCompletedJobs(),
    }));
}

/** Two-step upload: upload bytes with returned headers, then confirm the key. */
export async function uploadPrivateFile(key: string, blob: Blob, playerSubmitted: boolean) {
    requireExplicitAction(playerSubmitted, "File upload");
    if (!blob.type) throw new Error("File upload requires an explicit MIME type");
    return guarded("file upload", async () => {
        const ticket = await api.files.upload({
            key,
            contentType: blob.type,
            sizeBytes: blob.size,
            visibility: "private",
        });
        const response = await fetch(ticket.uploadUrl, {
            method: "PUT",
            headers: ticket.uploadHeaders,
            body: blob,
        });
        if (!response.ok) throw new Error(`Upload failed with ${response.status}`);
        const confirmation = ticket.uploadToken === undefined ? {} : { uploadToken: ticket.uploadToken };
        return api.files.confirmUpload(ticket.key, confirmation);
    });
}

export async function recordClip(
    playerTapped: boolean,
    canvas: HTMLCanvasElement,
    options: { camera?: boolean; microphone?: boolean } = {},
) {
    requireExplicitAction(playerTapped, "Gameplay recording");
    return guarded("clip recording", async () => {
        const support = await api.clips.isSupportedAsync();
        if (!support.canRecord) throw new Error(support.reason ?? "Recording unavailable");
        const consent = await api.clips.requestCaptureConsentAsync({ includesCamera: options.camera === true });
        if (consent.status !== "granted") throw new Error("Capture consent was not granted");
        await api.clips.startRecordingAsync({
            canvas,
            maxDurationMs: 15_000,
            audio: { microphone: options.microphone === true },
            camera: options.camera === true,
            onCameraUnavailable: () => console.info("[clip] camera unavailable; continuing without picture-in-picture"),
        });
        return api.clips.stopRecordingAsync({ persist: "ugc", title: "Gameplay clip" });
    });
}

export async function openNativeVideo(playerTapped: boolean, videoUrl: string) {
    requireExplicitAction(playerTapped, "Native video");
    return guarded("native picture-in-picture", () =>
        api.video.requestPiPAsync({
            contentId: requireConfiguredId("template-video", "Content ID"),
            videoUrl,
            positionSeconds: 0,
            contentLabel: "Template video",
        }),
    );
}
