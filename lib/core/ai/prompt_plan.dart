enum CreatorMode { smart, director }

enum AiCapability {
  intentInterpreter,
  promptExpander,
  requirementLock,
  scenePlanner,
  storyboardPlanner,
  cameraDirector,
  lightingDirector,
  artDirector,
  characterConsistency,
  productConsistency,
  textBrandGuard,
  imageGenerator,
  imageEditor,
  videoGenerator,
  motionPlanner,
  audioDirector,
  safetyRights,
  qualityCritic,
  repairAgent,
  costOptimizer,
}

class LockedRequirement {
  const LockedRequirement({required this.label, required this.value});
  final String label;
  final String value;
}

class CreatorPromptPlan {
  const CreatorPromptPlan({
    required this.originalPrompt,
    required this.mode,
    required this.capabilities,
    required this.lockedRequirements,
    required this.aspectRatio,
    required this.durationSeconds,
    required this.qualityProfile,
  });

  final String originalPrompt;
  final CreatorMode mode;
  final List<AiCapability> capabilities;
  final List<LockedRequirement> lockedRequirements;
  final String aspectRatio;
  final int durationSeconds;
  final String qualityProfile;
}

/// Client-side preview only. The backend remains authoritative for the final
/// orchestration plan, safety checks, provider selection and credit cost.
class PromptPlanPreview {
  static CreatorPromptPlan build({
    required String prompt,
    required CreatorMode mode,
    required String aspectRatio,
    required int durationSeconds,
    required String qualityProfile,
  }) {
    final selected = <AiCapability>{
      AiCapability.intentInterpreter,
      AiCapability.requirementLock,
      AiCapability.promptExpander,
      AiCapability.costOptimizer,
      AiCapability.safetyRights,
      AiCapability.qualityCritic,
    };

    if (durationSeconds > 8 || mode == CreatorMode.director) {
      selected.addAll({
        AiCapability.scenePlanner,
        AiCapability.storyboardPlanner,
        AiCapability.cameraDirector,
        AiCapability.motionPlanner,
      });
    }

    if (qualityProfile.toLowerCase() == 'pro') {
      selected.addAll({
        AiCapability.lightingDirector,
        AiCapability.artDirector,
        AiCapability.repairAgent,
      });
    }

    return CreatorPromptPlan(
      originalPrompt: prompt.trim(),
      mode: mode,
      capabilities: selected.toList(growable: false),
      lockedRequirements: const [],
      aspectRatio: aspectRatio,
      durationSeconds: durationSeconds,
      qualityProfile: qualityProfile,
    );
  }
}
