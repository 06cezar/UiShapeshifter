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
    const onConnect: { addListener(listener: (port: Port) => void): void };
    const onInstalled: { addListener(listener: (details: { reason: string }) => void): void };
    const onStartup: { addListener(listener: () => void): void };
    const lastError: { message?: string } | undefined;
  }

  namespace storage {
    interface StorageArea {
      get(keys: string | string[]): Promise<Record<string, unknown>>;
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
    function query(query: { active?: boolean; currentWindow?: boolean }): Promise<Tab[]>;
  }
}
