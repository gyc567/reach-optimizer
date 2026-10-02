// Chrome extension global types — only present when running as an extension
// host page. Safe to use in the web app because every reference is guarded
// by `typeof chrome === 'undefined'`.

declare const chrome: {
  storage?: {
    local?: {
      get: (key: string, callback: (result: Record<string, unknown>) => void) => void;
      set: (entries: Record<string, unknown>) => void;
    };
  };
};
