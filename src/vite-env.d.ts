/// <reference types="vite/client" />
import type { RagBridge, ReaderStatus, ReportExportPayload, ReportExportResult } from "./rag";

declare global {
  interface Window {
    expozi?: {
      platform: string;
      version: string;
      openDevTools: () => void;
      exportReport?: (payload: ReportExportPayload) => Promise<ReportExportResult>;
      readerStatus?: () => Promise<ReaderStatus>;
      rag?: RagBridge;
    };
  }
}
