import React from "react";
import { analytics } from "../systems/analytics/analyticsConfig.ts";

interface ErrorBoundaryState {
    failed: boolean;
}

export default class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
    state: ErrorBoundaryState = { failed: false };

    static getDerivedStateFromError(): ErrorBoundaryState {
        return { failed: true };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo): void {
        console.error("[ui] render failed", error);
        analytics.trackError("react_render_boundary", error, {
            component_stack: info.componentStack?.slice(0, 500) ?? "",
        });
    }

    render(): React.ReactNode {
        if (this.state.failed) {
            return (
                <main className="fatal-error" role="alert">
                    <p className="eyebrow">RECOVERY MODE</p>
                    <h1>Something went wrong.</h1>
                    <p>Your saved progress is still intact. Reload to try again.</p>
                    <button type="button" onClick={() => window.location.reload()}>
                        RELOAD
                    </button>
                </main>
            );
        }
        return this.props.children;
    }
}
