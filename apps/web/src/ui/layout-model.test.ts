import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@uishapeshifter/contracts";
import type { ModuleConfig, UIConfig } from "@uishapeshifter/contracts";
import { currentModule, homeModules, moduleIdOfRoute, navModules, storiesModule, visibleModules } from "./layout-model";

const ids = (modules: ModuleConfig[]) => modules.map((m) => m.id);

function withModules(change: (modules: ModuleConfig[]) => void, template = DEFAULT_CONFIG.template): UIConfig {
  const config = structuredClone(DEFAULT_CONFIG);
  config.template = template;
  change(config.modules);
  return config;
}

const GENERATED: ModuleConfig = {
  id: "gen-call-ana",
  type: "generated",
  title: "Sun-o pe Ana",
  visible: true,
  order: 9,
  size: "l",
  componentId: "call-ana",
};

describe("layout-model", () => {
  it("visibleModules păstrează doar modulele vizibile, după order", () => {
    const config = withModules((m) => {
      m[5].visible = false; // feed
      m[0].order = 10; // stories la final
    });
    expect(ids(visibleModules(config))).toEqual(["messages", "photos", "contacts", "calls", "settings", "stories"]);
  });

  it("navModules urmează nav.items și sare peste modulele ascunse sau inexistente", () => {
    const config = withModules((m) => (m[2].visible = false)); // photos
    config.nav.items = ["settings", "photos", "nope", "messages"];
    expect(ids(navModules(config))).toEqual(["settings", "messages"]);
  });

  it("bottom-nav-stories: banda de povești separat, restul pe ecranul principal", () => {
    expect(storiesModule(DEFAULT_CONFIG)?.id).toBe("stories");
    expect(ids(homeModules(DEFAULT_CONFIG))).toEqual(["messages", "photos", "contacts", "calls", "feed", "settings"]);
    const noStories = withModules((m) => (m[0].visible = false));
    expect(storiesModule(noStories)).toBeUndefined();
  });

  it("sidebar-feed: toate modulele vizibile, în ordine", () => {
    const config = withModules(() => {}, "sidebar-feed");
    expect(ids(homeModules(config))).toEqual(ids(visibleModules(config)));
  });

  it("simple-tiles: plăcile generate primele", () => {
    const config = withModules((m) => m.push(GENERATED), "simple-tiles");
    expect(ids(homeModules(config))[0]).toBe("gen-call-ana");
    expect(homeModules(config)).toHaveLength(8);
  });

  it("ruta „chat:ana” deschide modulul chat; un modul ascuns sau home nu deschide nimic", () => {
    expect(moduleIdOfRoute("chat:ana")).toBe("chat");
    expect(currentModule(DEFAULT_CONFIG, "messages")?.id).toBe("messages");
    expect(currentModule(DEFAULT_CONFIG, "home")).toBeUndefined();
    expect(
      currentModule(
        withModules((m) => (m[1].visible = false)),
        "messages",
      ),
    ).toBeUndefined();
  });
});
