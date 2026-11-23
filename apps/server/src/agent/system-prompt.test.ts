import { describe, expect, it } from "vitest";
import { buildSystemPrompt, isJiraHost } from "./system-prompt";

const page = (host: string) => ({ url: `https://${host}/jira/your-work`, host, title: "Test" });

describe("pachetul pentru Jira", () => {
  it("recunoaște doar host-urile atlassian.net", () => {
    expect(isJiraHost("firma-test.atlassian.net")).toBe(true);
    expect(isJiraHost("atlassian.net.exemplu.ro")).toBe(false);
    expect(isJiraHost("localhost")).toBe(false);
    expect(isJiraHost(undefined)).toBe(false);
  });

  it("intră în prompt doar pe Jira", () => {
    expect(buildSystemPrompt({ page: page("firma-test.atlassian.net"), stage: 2 })).toContain("## Pe Jira");
    expect(buildSystemPrompt({ page: page("localhost"), stage: 2 })).not.toContain("## Pe Jira");
    expect(buildSystemPrompt({ stage: 2 })).not.toContain("## Pe Jira");
  });
});
