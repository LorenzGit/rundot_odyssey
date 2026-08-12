import type { ReactNode } from "react";
import { store, type MenuScreen } from "../state/store.ts";
import { t } from "../systems/localization.ts";

export default function MenuScreenLayout({
    title,
    kicker,
    children,
    actions,
    backScreen = "main",
}: {
    title: string;
    kicker: string;
    children: ReactNode;
    actions?: ReactNode;
    backScreen?: MenuScreen;
}) {
    const back = () => store.patch({ menuScreen: backScreen });
    return (
        <main className="subscreen">
            <header className="subscreen-header">
                <button type="button" className="back-button" onClick={back} aria-label={t("ButtonBack")}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m15 5-7 7 7 7" />
                    </svg>
                </button>
                <div>
                    <p className="eyebrow">{kicker}</p>
                    <h2>{title}</h2>
                </div>
            </header>
            <div className="subscreen-content" data-testid="screen-scroll-region">
                {children}
                <span className="subscreen-end" data-testid="screen-end" aria-hidden="true" />
            </div>
            {actions && <div className="subscreen-action-rail">{actions}</div>}
        </main>
    );
}
