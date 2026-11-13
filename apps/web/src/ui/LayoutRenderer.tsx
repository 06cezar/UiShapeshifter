// Randează interfața DOAR din config (specs/02, regula 1 și „Șabloanele”): șablonul alege structura, modulele vizibile
// și ordinea vin din `modules`, meniul din `nav`, iar aspectul din variabilele temei (theme-sync.ts).

import type { ModuleConfig } from "@uishapeshifter/contracts";
import { useConfigState, useConfigStoreApi } from "./config-store-context";
import { currentModule, HOME_ID, homeModules, storiesModule } from "./layout-model";
import { ModulePlaceholder, ModuleTile } from "./ModuleView";
import { NavBar } from "./NavBar";
import { useAgentElement } from "./registry-context";
import "./layout.css";

export function LayoutRenderer() {
  const config = useConfigState((s) => s.config);
  const route = useConfigState((s) => s.route);
  const open = currentModule(config, route);

  return (
    <div className="ui-app" data-template={config.template} data-nav-position={config.nav.position}>
      {config.template === "sidebar-feed" && <SidebarFeed open={open} />}
      {config.template === "bottom-nav-stories" && <BottomNavStories open={open} />}
      {config.template === "simple-tiles" && <SimpleTiles open={open} />}
    </div>
  );
}

interface TemplateProps {
  /** Modulul deschis acum, sau `undefined` pe ecranul principal. */
  open: ModuleConfig | undefined;
}

/** Meniu lateral cu etichete + coloana centrală cu modulele în ordine. */
function SidebarFeed({ open }: TemplateProps) {
  const modules = homeModules(useConfigState((s) => s.config));
  return (
    <>
      <NavBar />
      <main className="ui-content">{open ? <ModulePlaceholder module={open} /> : <TileList modules={modules} />}</main>
    </>
  );
}

/** Banda de povești sus, apoi modulele; meniul jos, cu iconițe și etichete. */
function BottomNavStories({ open }: TemplateProps) {
  const config = useConfigState((s) => s.config);
  const stories = storiesModule(config);
  const modules = homeModules(config);
  return (
    <>
      <main className="ui-content">
        {open ? (
          <ModulePlaceholder module={open} />
        ) : (
          <>
            {stories && (
              <section className="ui-stories" aria-label={stories.title}>
                <ModuleTile module={stories} />
              </section>
            )}
            <TileList modules={modules} />
          </>
        )}
      </main>
      <NavBar />
    </>
  );
}

/** Fără meniu: plăci mari pe ecranul principal; dintr-un modul, un singur buton mare înapoi. */
function SimpleTiles({ open }: TemplateProps) {
  const store = useConfigStoreApi();
  const modules = homeModules(useConfigState((s) => s.config));
  return (
    <main className="ui-content">
      {open ? (
        <>
          <BackButton onSelect={() => store.getState().navigate(HOME_ID)} />
          <ModulePlaceholder module={open} />
        </>
      ) : (
        <div className="ui-tile-grid">
          {modules.map((m) => (
            <ModuleTile key={m.id} module={m} />
          ))}
        </div>
      )}
    </main>
  );
}

/** În `simple-tiles` nu există meniu: butonul mare „Înapoi” ține locul intrării „Acasă” (`nav.home`). */
function BackButton({ onSelect }: { onSelect: () => void }) {
  const agentId = `nav.${HOME_ID}`;
  const ref = useAgentElement(agentId);
  return (
    <button ref={ref} type="button" className="ui-back" data-agent-id={agentId} onClick={onSelect}>
      Înapoi la ecranul principal
    </button>
  );
}

function TileList({ modules }: { modules: ModuleConfig[] }) {
  return (
    <div className="ui-tile-list">
      {modules.map((m) => (
        <ModuleTile key={m.id} module={m} />
      ))}
    </div>
  );
}
