import { afterEach, describe, expect, it } from "vitest";
import { applyDislikes, dislikeCss, dislikesFromStored, DISLIKES_STYLE_ID } from "./dislike-rules";

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("dislikeCss: ce ascundem, fără AI", () => {
  it("fiecare categorie cunoscută dă reguli care trec de validare, inclusiv cele cu :has", () => {
    const css = dislikeCss(["short-video", "promos", "ai-features", "stories"]);
    expect(css).toContain("ytd-reel-shelf-renderer");
    expect(css).toContain(':has(a[href^="/shorts/"])');
    expect(css).toContain("ins.adsbygoogle");
    expect(css).toContain("display: none !important");
  });

  it("categoriile fără marcaj sigur (aglomerat, ferestre, redare automată) rămân la agent", () => {
    expect(dislikeCss(["clutter", "popups", "autoplay"])).toBe("");
  });
});

describe("dislikesFromStored: din testul inițial și din preferințele generale", () => {
  it("le adună pe amândouă, o singură dată, și aruncă ce nu e categorie cunoscută", () => {
    const values = {
      onboarding: { dislikes: ["short-video", "necunoscut", 3] },
      userId: "u1",
      u1: {
        generalPreferences: [
          { category: "promos", text: "fără reclame peste tot" },
          { category: "short-video", text: "fără Shorts nicăieri" },
          { text: "fără categorie" },
        ],
      },
    };
    expect(dislikesFromStored(values, "onboarding", "userId")).toEqual(["short-video", "promos"]);
  });

  it("fără test și fără profil: nimic", () => {
    expect(dislikesFromStored({}, "onboarding", "userId")).toEqual([]);
  });
});

describe("applyDislikes: foaia din pagină", () => {
  it("un raft de Shorts nu se mai vede; restul paginii rămâne", () => {
    document.body.innerHTML = `<ytd-reel-shelf-renderer id="raft">Shorts</ytd-reel-shelf-renderer><p id="text">Video</p>`;
    applyDislikes(["short-video"]);
    expect(getComputedStyle(document.getElementById("raft")!).display).toBe("none");
    expect(getComputedStyle(document.getElementById("text")!).display).not.toBe("none");
  });

  it("fără categorii, foaia pleacă; un apel la fel nu dublează foaia", () => {
    applyDislikes(["promos"]);
    applyDislikes(["promos"]);
    expect(document.querySelectorAll(`#${DISLIKES_STYLE_ID}`)).toHaveLength(1);
    applyDislikes([]);
    expect(document.getElementById(DISLIKES_STYLE_ID)).toBeNull();
  });
});
