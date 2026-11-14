import { describe, expect, it } from "vitest";
import { callKey, createFailureGuard } from "./failure-guard";

const fail = { ok: false as const, error: { code: "ELEMENT_NOT_FOUND" as const, message: "nu e" } };
const css = (selector: string) => ({ css: `${selector}{display:none}`, reason: "x" });

describe("createFailureGuard (specs/05, „Eșecuri”)", () => {
  it("aceeași unealtă cu aceleași argumente nu se repetă după eșec", () => {
    const guard = createFailureGuard();
    guard.record("apply_css", css("a"), fail);
    expect(guard.check("apply_css", css("a"))).toMatchObject({ ok: false, error: { code: "INVALID_ARGS" } });
    expect(guard.check("apply_css", css("b"))).toBeNull(); // alte argumente: merge
  });

  it("argumentele se compară indiferent de ordinea cheilor", () => {
    expect(callKey("apply_css", { css: "a", reason: "r" })).toBe(callKey("apply_css", { reason: "r", css: "a" }));
  });

  it("după maxToolRetries eșecuri la aceeași unealtă cere alt plan", () => {
    const guard = createFailureGuard(2);
    guard.record("point_at", { elementId: "e.1" }, fail);
    expect(guard.check("point_at", { elementId: "e.2" })).toBeNull();
    guard.record("point_at", { elementId: "e.2" }, fail);
    const blocked = guard.check("point_at", { elementId: "e.3" });
    expect(blocked).toMatchObject({ ok: false });
    expect((blocked as { error: { message: string } }).error.message).toContain("Schimbă planul");
  });

  it("după un TIMEOUT, același apel e permis din nou (trecător), dar se numără la eșecuri", () => {
    const guard = createFailureGuard(2);
    const timeout = { ok: false as const, error: { code: "TIMEOUT" as const, message: "n-a răspuns" } };
    guard.record("get_page_snapshot", {}, timeout);
    expect(guard.check("get_page_snapshot", {})).toBeNull();
    guard.record("get_page_snapshot", {}, timeout);
    expect(guard.check("get_page_snapshot", {})).toMatchObject({ ok: false }); // după 2: alt plan
  });

  it("anularea de către om și uneltele de închidere nu contează ca eșecuri", () => {
    const guard = createFailureGuard(1);
    guard.record("ask_user", { question: "?" }, { ok: false, error: { code: "USER_CANCELLED", message: "x" } });
    expect(guard.check("ask_user", { question: "?" })).toBeNull();
    guard.record("finish", {}, fail);
    expect(guard.check("finish", {})).toBeNull();
  });
});
