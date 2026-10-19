declare global {
  interface Window {
    api: import('../../preload/index').Api & import('../../shared/types').GitWorkbenchApi;
  }
}

export {};
