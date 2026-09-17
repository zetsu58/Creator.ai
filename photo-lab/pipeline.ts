import type { AnalysisResult, ExportPreset, PhotoLabOperation, PhotoLabPlan, PipelineStep } from "./contracts";

const step = (id: PipelineStep["id"], enabled: boolean, strength: number): PipelineStep => ({
  id,
  enabled,
  strength: Math.max(0, Math.min(1, strength)),
});

export function buildPhotoLabPlan(
  analysis: AnalysisResult,
  operation: PhotoLabOperation,
  outputPreset: ExportPreset = "full_hd",
): PhotoLabPlan {
  const hasFace = analysis.faceCount > 0;
  const noisy = analysis.noiseScore > 0.35;
  const blurry = analysis.blurScore > 0.35;
  const compressed = analysis.compressionScore > 0.4;

  return {
    outputPreset,
    preserveGeometry: true,
    steps: [
      step("denoise", operation === "smart_enhance" && (noisy || compressed), noisy ? 0.55 : 0.35),
      step("deblur", operation === "smart_enhance" && blurry, 0.35),
      step("inpaint", operation === "erase", 0.8),
      step("face_restore", hasFace && (operation === "face_preserve" || operation === "restore" || operation === "smart_enhance"), 0.3),
      step("upscale", operation !== "erase" || outputPreset !== "original", outputPreset === "4k" ? 0.9 : 0.65),
      step("sharpen", operation !== "erase", 0.2),
    ],
  };
}

export function validatePhotoLabInput(input: {
  mime: string;
  bytes: number;
  width: number;
  height: number;
}): void {
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(input.mime)) throw new Error("Unsupported image type");
  if (input.bytes <= 0 || input.bytes > 25 * 1024 * 1024) throw new Error("Image exceeds 25 MB limit");
  if (input.width <= 0 || input.height <= 0 || input.width * input.height > 50_000_000) {
    throw new Error("Invalid or oversized image dimensions");
  }
}
