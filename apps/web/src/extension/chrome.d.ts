// Tipurile minime din API-ul extensiilor Chrome pe care le folosim. Le scriem aici în loc să adăugăm @types/chrome
// (un pachet nou în configurarea din rădăcină); se extind când e nevoie de alt API.

declare namespace chrome {
  namespace runtime {
    interface Port {
      name: string;
      sender?: { tab?: { id?: number; url?: string } };
      postMessage(message: unknown): void;
      disconnect(): void;
      onMessage: { addListener(listener: (message: unknown, port: Port) => void): void };
      onDisconnect: { addListener(listener: (port: Port) => void): void };
    }
    function connect(info?: { name?: string }): Port;
    /** Adresa unui fișier al extensiei, ex. chrome-extension://<id>/onboarding.html. */
    function getURL(path: string): string;
    const onConnect: { addListener(listener: (port: Port) => void): void };
    const onInstalled: { addListener(listener: (details: { reason: string }) => void): void };
    const onStartup: { addListener(listener: () => void): void };
    const lastError: { message?: string } | undefined;
    /** Lipsește când extensia a fost reîncărcată și codul din pagină a rămas orfan. */
    const id: string | undefined;
  }

  /**
   * Modul expert (run_js): există doar după ce omul a pornit „Allow User Scripts” în detaliile extensiei (Chrome 135+).
   * Îl verificăm mereu înainte (`chrome.userScripts?.execute`).
   */
  namespace userScripts {
    interface InjectionResult {
      documentId?: string;
      frameId?: number;
      result?: unknown;
      error?: string;
    }
    function execute(injection: {
      target: { tabId: number; frameIds?: number[]; allFrames?: boolean };
      js: { code: string }[];
      world?: "USER_SCRIPT" | "MAIN";
      injectImmediately?: boolean;
    }): Promise<InjectionResult[]>;
  }

  namespace storage {
    interface StorageArea {
      /** null = tot ce e în stocare. */
      get(keys: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    }
    const local: StorageArea;
    /** Ține cât e pornit browserul, peste repornirile service worker-ului. */
    const session: StorageArea;
    const onChanged: {
      addListener(
        listener: (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => void,
      ): void;
    };
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
    }
    function query(query: {
      active?: boolean;
      currentWindow?: boolean;
      lastFocusedWindow?: boolean;
      url?: string;
    }): Promise<Tab[]>;
    function create(properties: { url: string; active?: boolean }): Promise<Tab>;
    function reload(tabId: number): Promise<void>;
    const onActivated: { addListener(listener: (info: { tabId: number; windowId: number }) => void): void };
  }
}
