/**
 * Player-billed/creator-billed generation patterns. Always show a cost estimate
 * and obtain an explicit player action before calling a billed method.
 */
import { asCreditsExhaustedError } from "@series-inc/rundot-game-sdk";
import type { Avatar3dConfig } from "@series-inc/rundot-game-sdk";
import { api, guarded, requireConfiguredId, requireExplicitAction } from "./guards";

export async function inspectGenerationAvailability() {
    return guarded("generation discovery", async () => ({
        billing: await api.credits.getBillingContext(),
        balance: await api.credits.getBalance(),
        plans: await api.credits.getPlans(),
        textModels: await api.textGen.getAvailableCompletionModels(),
        voices: await api.audioGen.listVoices(),
        spriteModels: await api.spriteGen.listModels(),
        spriteCosts: await api.spriteGen.getCosts(),
        avatar: await api.loadAvatar3dAsync(),
    }));
}

export async function estimateImage(prompt: string) {
    return guarded("image estimate", () =>
        api.credits.estimateGenerationCost({
            kind: "image",
            text: prompt,
            imageSize: "1K",
            quantity: 1,
        }),
    );
}

export async function generateImage(prompt: string, playerConfirmedEstimate: boolean) {
    requireExplicitAction(playerConfirmedEstimate, "Image generation");
    try {
        return await guarded("image generation", () =>
            api.imageGen.generate({
                prompt,
                aspectRatio: "1:1",
                model: "gemini-3.1-flash-image-preview",
            }),
        );
    } catch (error) {
        const creditsError = asCreditsExhaustedError(error);
        if (creditsError) console.warn("Generation credits exhausted", creditsError.billedTo);
        throw error;
    }
}

export async function generateText(promptId: string, input: string, playerConfirmedEstimate: boolean) {
    requireExplicitAction(playerConfirmedEstimate, "Text generation");
    return guarded("templated text generation", () =>
        api.textGen.requestPromptCompletionAsync({
            promptId: requireConfiguredId(promptId, "Server prompt ID"),
            input,
        }),
    );
}

export async function generateAudio(playerConfirmedEstimate: boolean) {
    requireExplicitAction(playerConfirmedEstimate, "Audio generation");
    return guarded("sound-effect generation", () =>
        api.audioGen.generate({
            type: "sfx",
            description: "short magical success chime, no speech",
            durationSec: 2,
            clientRef: crypto.randomUUID(),
        }),
    );
}

export async function generateSprite(playerConfirmedEstimate: boolean) {
    requireExplicitAction(playerConfirmedEstimate, "Sprite generation");
    return guarded("sprite generation", () =>
        api.spriteGen.generate({
            prompt: "single friendly forest creature, neutral pose",
            pixel: true,
            width: 128,
            height: 128,
            bgMode: "transparent",
        }),
    );
}

export async function generateVideo(playerConfirmedEstimate: boolean) {
    requireExplicitAction(playerConfirmedEstimate, "Video generation");
    return guarded("video generation", () =>
        api.videoGen.generate({
            provider: "seedance-2.0-fast",
            mode: "text-to-video",
            prompt: "abstract colorful shapes moving gently, game-safe, no text",
            aspectRatio: "9:16",
            resolution: "480p",
            durationSeconds: 4,
            generateAudio: false,
        }),
    );
}

export async function generate3dModel(playerConfirmedEstimate: boolean) {
    requireExplicitAction(playerConfirmedEstimate, "3D generation");
    return guarded("3D generation", () =>
        api.threeDGen.generate({
            provider: "meshy",
            mode: "text-to-3d",
            prompt: "simple stylized treasure chest game prop",
            quality: "draft",
        }),
    );
}

export async function openCreditsPaywall(playerTapped: boolean) {
    requireExplicitAction(playerTapped, "Creator credits paywall");
    return guarded("credits paywall", () =>
        api.credits.openPaywall({
            focus: "plans",
            screenName: "template-generation-demo",
        }),
    );
}

export async function editAvatar(playerTapped: boolean) {
    requireExplicitAction(playerTapped, "Avatar editor");
    return guarded("3D avatar editor", () =>
        api.showAvatar3dEditorAsync({
            contextData: { source: "template-demo" },
        }),
    );
}

export async function inspectAvatarAssets() {
    return guarded("3D avatar assets", async () => ({
        avatar: await api.loadAvatar3dAsync(),
        manifest: await api.downloadAvatar3dManifestAsync(),
        assetPaths: await api.downloadAvatar3dAssetPathsAsync(),
    }));
}

export async function saveAvatar(config: Avatar3dConfig, playerConfirmed: boolean) {
    requireExplicitAction(playerConfirmed, "3D avatar save");
    return guarded("3D avatar save", () => api.saveAvatar3dAsync(config));
}

export async function deleteAvatar(playerConfirmed: boolean) {
    requireExplicitAction(playerConfirmed, "3D avatar deletion");
    return guarded("3D avatar deletion", () => api.deleteAvatar3dAsync());
}
