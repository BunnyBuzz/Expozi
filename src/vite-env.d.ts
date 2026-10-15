/// <reference types="vite/client" />
import type { RagBridge } from "./rag";

declare global {
  interface Window {
    expozi?: {
      platform: string;
      version: string;
      openDevTools: () => void;
      rag?: RagBridge;
    };
  }
}
