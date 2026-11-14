import { RUN_LIMITS } from "@uishapeshifter/contracts";
import { describe, expect, test } from "vitest";
import { timeoutFor } from "./sessions";

describe("timeoutFor", () => {
  test("run_js așteaptă omul să citească codul și să apese «Rulează», nu doar 15 s", () => {
    expect(timeoutFor("run_js", { code: "return 1", purpose: "x" })).toBe(RUN_LIMITS.waitForClickMaxMs);
  });

  test("o unealtă care nu așteaptă omul rămâne la timeout-ul obișnuit", () => {
    expect(timeoutFor("apply_css", { css: "", reason: "x" })).toBe(RUN_LIMITS.toolTimeoutMs);
  });
});
