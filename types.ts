export interface BoundingBox {
  id: string;
  x: number; // Percentage 0-1
  y: number; // Percentage 0-1
  width: number; // Percentage 0-1
  height: number; // Percentage 0-1
}

export interface ExportConfig {
  padding: number;
  removeBackground: boolean;
  fileFormat: 'png' | 'jpeg' | 'webp';
}

export interface AISettings {
  apiKey?: string; // User provided key
  useCustomUrl: boolean;
  baseUrl: string;
  model: string;
  systemPrompt: string;
}

export interface ImageFile {
  id: string;
  file: File;
  previewUrl: string;
  originalWidth: number;
  originalHeight: number;
  slices: BoundingBox[];
  mode: SliceMode;
  gridConfigs: {
    rows: number;
    cols: number;
  };
  scanTolerance: number;
  exportConfig: ExportConfig;
  status?: 'idle' | 'queued' | 'processing' | 'done' | 'error';
}

export enum SliceMode {
  GRID = 'GRID',
  AI_AUTO = 'AI_AUTO',
  SCAN = 'SCAN',
  MANUAL = 'MANUAL',
}

export interface Point {
  x: number;
  y: number;
}