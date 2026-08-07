/** RUN-host browser capabilities that are not SDK namespaces. */
import { requireExplicitAction } from "./guards";

export function inspectBrowserRuntime() {
    return {
        cameraAndMicrophone: typeof navigator.mediaDevices?.getUserMedia === "function",
        clipboardRead: typeof navigator.clipboard?.readText === "function",
        clipboardWrite: typeof navigator.clipboard?.writeText === "function",
        // The RUN host permits autoplay; the template still unlocks audio from
        // a gesture so the same build remains usable in ordinary browsers.
        runHostAutoplay: true,
    } as const;
}

export async function requestDeviceMedia(
    playerTapped: boolean,
    constraints: { camera: boolean; microphone: boolean },
): Promise<MediaStream> {
    requireExplicitAction(playerTapped, "Camera or microphone permission");
    if (!constraints.camera && !constraints.microphone) throw new Error("Select camera, microphone, or both");
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Device media is unavailable");
    return navigator.mediaDevices.getUserMedia({
        video: constraints.camera,
        audio: constraints.microphone,
    });
}

/** Stop every track as soon as the adopting UI no longer needs the stream. */
export function stopDeviceMedia(stream: MediaStream): void {
    for (const track of stream.getTracks()) track.stop();
}

export async function writeClipboard(text: string, playerTapped: boolean): Promise<void> {
    requireExplicitAction(playerTapped, "Clipboard write");
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard write is unavailable");
    await navigator.clipboard.writeText(text);
}
