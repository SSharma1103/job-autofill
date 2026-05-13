declare const chrome: {
  runtime: {
    id?: string;
    lastError?: { message?: string };
    onMessage: {
      addListener(
        listener: (
          message: unknown,
          sender: unknown,
          sendResponse: (response?: unknown) => void,
        ) => boolean | void,
      ): void;
    };
    openOptionsPage(callback?: () => void): void;
  };
  devtools?: {
    inspectedWindow: {
      tabId: number;
    };
    panels: {
      create(title: string, iconPath: string, pagePath: string, callback?: () => void): void;
    };
  };
  storage: {
    local: {
      get(keys?: string[] | Record<string, unknown> | string | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      clear(): Promise<void>;
    };
  };
  scripting: {
    executeScript(injection: { target: { tabId: number }; files: string[] }): Promise<unknown[]>;
  };
  tabs: {
    get(tabId: number): Promise<{ id?: number; url?: string }>;
    query(queryInfo: { active?: boolean; currentWindow?: boolean }): Promise<Array<{ id?: number; url?: string }>>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
};
