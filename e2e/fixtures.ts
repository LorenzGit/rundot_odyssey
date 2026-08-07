import { expect, test as base } from "@playwright/test";

interface RuntimeIssue {
    source: "console" | "page" | "request";
    message: string;
}

export const test = base.extend<{ runtimeIssues: RuntimeIssue[] }>({
    runtimeIssues: [
        async ({ page }, use) => {
            const issues: RuntimeIssue[] = [];
            page.on("console", (message) => {
                if (message.type() === "error") issues.push({ source: "console", message: message.text() });
            });
            page.on("pageerror", (error) => {
                issues.push({ source: "page", message: error.message });
            });
            page.on("requestfailed", (request) => {
                if (!["document", "script", "stylesheet", "image", "font"].includes(request.resourceType())) return;
                issues.push({
                    source: "request",
                    message: `${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "failed"}`,
                });
            });
            await use(issues);
            expect(issues, "The game emitted runtime errors or failed critical requests").toEqual([]);
        },
        { auto: true },
    ],
});

export { expect } from "@playwright/test";
