export type { BuzzerInput, BuzzerInputState, BuzzerPress, RawKeyPress } from './buzzers/buzzerInput'
export type { KeyboardBuzzerInput, KeyboardBuzzerInputOptions } from './buzzers/keyboardBuzzerInput'
export { createKeyboardBuzzerInput } from './buzzers/keyboardBuzzerInput'
export type { BuzzerKeymap, BuzzerSlot, KeymapParseResult } from './buzzers/keymap'
export {
  createDefaultKeymap,
  findCode,
  findSlot,
  isAllowedBuzzerCode,
  listSlots,
  missingSlots,
  parseKeymap,
} from './buzzers/keymap'
export type {
  BuzzerLearning,
  BuzzerLearningOptions,
  BuzzerLearningState,
  LearningCaptureResult,
} from './buzzers/learning'
export { createBuzzerLearning } from './buzzers/learning'
export type { SimulatedBuzzerInput } from './buzzers/simulatedBuzzerInput'
export { createSimulatedBuzzerInput } from './buzzers/simulatedBuzzerInput'
export type { Clock } from './clock'
export { browserClock } from './clock'
export type { LightingConfig, ParsedRoomHardwareConfig, RoomHardwareConfig } from './config'
export {
  defaultRoomHardwareConfig,
  DMX_REFRESH_LIMITS,
  parseRoomHardwareConfig,
  ROOM_HARDWARE_CONFIG_VERSION,
} from './config'
export type { FixtureConfig, FixtureState, PanTilt, ResolvedFixture } from './dmx/fixtures'
export { parseRig, renderUniverse } from './dmx/fixtures'
export type { DmxDriver, DmxOutput, DmxOutputStatus } from './dmx/output'
export { DMX_DRIVERS } from './dmx/output'
export type { ChannelRole, ChannelSpec, FixtureKind, FixtureProfile } from './dmx/profiles'
export { CHANNEL_ROLES, findProfile, FIXTURE_KINDS, GENERIC_PROFILES } from './dmx/profiles'
export type { SerialLike, SerialPortLike } from './dmx/serialOutput'
export {
  createSerialOutput,
  getGrantedDmxPort,
  getWebSerial,
  isWebSerialSupported,
  requestDmxPort,
} from './dmx/serialOutput'
export type { SimulationOutput } from './dmx/simulationOutput'
export { createSimulationOutput } from './dmx/simulationOutput'
export { DMX_CHANNELS, encodeRawDmxFrame, encodeUsbProFrame } from './dmx/universe'
export type {
  DeskResolver,
  FixtureView,
  HardwareGameEvent,
  LightingController,
  LightingControllerOptions,
  LightingState,
  LightingWarning,
} from './lighting/lightingController'
export { createLightingController, WATCHDOG_STALL_MS } from './lighting/lightingController'
export type {
  SceneAim,
  SceneColor,
  SceneContext,
  SceneDefinition,
  SceneStep,
  SceneTarget,
} from './lighting/scenes'
export {
  DEFAULT_BINDINGS,
  DEFAULT_DESK_COLORS,
  DEFAULT_SCENES,
  NEON,
  SCENE_IDS,
} from './lighting/scenes'
export type {
  SmokeController,
  SmokeFireResult,
  SmokeRefusal,
  SmokeSafetyConfig,
  SmokeState,
  SmokeStatus,
  SmokeStopReason,
} from './lighting/smoke'
export {
  createSmokeController,
  DEFAULT_SMOKE_SAFETY,
  normalizeSmokeSafety,
  SMOKE_HARD_LIMITS,
} from './lighting/smoke'
export type { ButtonIndex, BuzzerButton, Desk, Rgb, Rgbw, Unsubscribe } from './types'
export { buttonToIndex, BUZZER_BUTTONS, DESKS, isBuzzerButton, isDesk } from './types'
