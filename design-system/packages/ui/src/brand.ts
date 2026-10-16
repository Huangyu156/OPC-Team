/** Opt-in OPC-Team identity and motion, separate from generic UI controls. */
export { OpcSolidMark, OpcAppIcon, type OpcArtworkProps } from "./brand/OpcArtwork";
export { OpcMark, type OpcMarkProps } from "./brand/OpcMark";
export { OpcBrandMotion, type OpcBrandMotionProps } from "./brand/OpcBrandMotion";
export { VoiceParticleLogo, type VoiceParticleLogoProps, type VoiceParticleAudio, type VoiceParticleAudioReader } from "./brand/VoiceParticleLogo";

export * from "./brand/subagent/subagentMotion";
export { createSubagentMotionPlayer, type SubagentMotionPlayer } from "./brand/subagent/subagentMotionPlayer";
export { useSubagentAvatarMotion } from "./brand/subagent/useSubagentAvatarMotion";
export { SubagentHatch, type SubagentHatchProps } from "./brand/subagent/SubagentHatch";
export type { SubagentHatchPhase } from "./brand/subagent/subagentHatchMotion";
