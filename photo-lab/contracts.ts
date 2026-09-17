export type PhotoLabOperation =
  | "smart_enhance"
  | "upscale"
  | "erase"
  | "face_preserve"
  | "restore";

export type ExportPreset = "full_hd" | "2k" | "4k" | "original";

export interface PhotoLabRequest {
  assetId: string;
  operation: PhotoLabOperation;
  preset?: ExportPreset;
  maskAssetId?: string;
  strength?: number;
  preserveFace?: boolean;
  stripMetadata?: boolean;
}

export interface AnalysisResult {
  width: number;
  height: number;
  blurScore: number;
  noiseScore: number;
  compressionScore: number;
  faceCount: number;
}

export interface PipelineStep {
  id: "denoise" | "deblur" | "inpaint" | "face_restore" | "upscale" | "sharpen";
  enabled: boolean;
  strength: number;
}

export interface PhotoLabPlan {
  steps: PipelineStep[];
  outputPreset: ExportPreset;
  preserveGeometry: true;
}

export interface PhotoLabJob {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  request: PhotoLabRequest;
  plan?: PhotoLabPlan;
  outputAssetId?: string;
  error?: string;
}
