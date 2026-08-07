/**
 * ResizeObserver-based canvas sizing for a RUN.game title.
 *
 * Copy into `src/ui/responsive-canvas.ts`. Observes the container (element-level,
 * fires between layout and paint) and reports CSS pixel size + a DPR capped at 2.
 * Never call renderer.setPixelRatio(); size the renderer yourself in onResize.
 *
 * Example:
 *   const stop = observeCanvasResize(container, (w, h, dpr) => {
 *     renderer.setSize(w * dpr, h * dpr, false)   // false = don't touch CSS size
 *     canvas.style.width = `${w}px`
 *     canvas.style.height = `${h}px`
 *     camera.aspect = w / h
 *     camera.updateProjectionMatrix()
 *   })
 *   // later: stop()
 */
export function observeCanvasResize(
    container: HTMLElement,
    onResize: (cssWidth: number, cssHeight: number, dpr: number) => void,
): () => void {
    const apply = () => {
        const { width, height } = container.getBoundingClientRect();
        if (width === 0 || height === 0) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        onResize(width, height, dpr);
    };

    const observer = new ResizeObserver(apply);
    observer.observe(container);
    apply();

    return () => observer.disconnect();
}
