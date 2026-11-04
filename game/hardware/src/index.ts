export type { BuzzerInput, BuzzerInputState, BuzzerPress, RawKeyPress } from './buzzers/buzzerInput'
export type {
  GamepadBuzzerInput,
  GamepadBuzzerInputOptions,
  GamepadInfo,
  GamepadLike,
  GamepadSource,
} from './buzzers/gamepadBuzzerInput'
export {
  createGamepadBuzzerInput,
  GAMEPAD_CODE_PREFIX,
  gamepadButtonCode,
} from './buzzers/gamepadBuzzerInput'
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
export type {
  BuzzerSource,
  LightingConfig,
  ParsedRoomHardwareConfig,
  RoomHardwareConfig,
} from './config'
export {
  activeKeymap,
  activeLightingConfig,
  defaultRoomHardwareConfig,
  DMX_REFRESH_LIMITS,
  gamepadMatcher,
  parseRoomHardwareConfig,
  ROOM_HARDWARE_CONFIG_VERSION,
  withDesksCount,
  withLearnedKeymap,
} from './config'
export type {
  BridgeOutput,
  BridgeOutputOptions,
  WebSocketConstructorLike,
  WebSocketLike,
} from './dmx/bridgeOutput'
export {
  BRIDGE_FRAME_BYTES,
  BRIDGE_MAX_BUFFERED_BYTES,
  BRIDGE_OPEN_TIMEOUT_MS,
  BRIDGE_PROTOCOL_VERSION,
  createBridgeOutput,
  DEFAULT_BRIDGE_PORT,
  DEFAULT_BRIDGE_URL,
  encodeBridgeFrame,
  parseBridgeUrl,
} from './dmx/bridgeOutput'
export type { FixtureConfig, FixtureState, PanTilt, ResolvedFixture } from './dmx/fixtures'
export {
  fixtureUniverse,
  parseRig,
  renderUniverse,
  renderUniverses,
  unsupportedUniverseProblems,
  usedUniverses,
} from './dmx/fixtures'
export type { MeteredOutput, OutputStats } from './dmx/meteredOutput'
export { createMeteredOutput } from './dmx/meteredOutput'
export type { DmxDriver, DmxOutput, DmxOutputStatus } from './dmx/output'
export { DMX_DRIVER_UNIVERSES, DMX_DRIVERS } from './dmx/output'
export type {
  ChannelRole,
  ChannelSpec,
  ColorSlot,
  FixtureKind,
  FixtureProfile,
} from './dmx/profiles'
export {
  CHANNEL_ROLES,
  defaultColorWheelSlots,
  findProfile,
  FIXTURE_KINDS,
  GENERIC_PROFILES,
} from './dmx/profiles'
export type {
  SerialErrorCode,
  SerialErrorDescription,
  SerialLike,
  SerialPortLike,
} from './dmx/serialOutput'
export {
  createSerialOutput,
  describePort,
  describeSerialError,
  getGrantedDmxPort,
  getWebSerial,
  isWebSerialSupported,
  OPEN_DMX_FRAME_MS,
  requestDmxPort,
  watchDmxPortReconnection,
} from './dmx/serialOutput'
export type { SimulationOutput } from './dmx/simulationOutput'
export { createSimulationOutput } from './dmx/simulationOutput'
export { DMX_CHANNELS, encodeRawDmxFrame, encodeUsbProFrame, MAX_UNIVERSES } from './dmx/universe'
export type {
  DeskResolver,
  DiagnosticRefusal,
  DiagnosticResult,
  DiagnosticsState,
  FixtureView,
  HardwareGameEvent,
  LightingController,
  LightingControllerOptions,
  LightingDiagnostics,
  LightingState,
  LightingWarning,
} from './lighting/lightingController'
export {
  createLightingController,
  DIAGNOSTICS_IDLE_MS,
  MAX_FREEZE_MS,
  OUTPUT_RECOVERY_WRITES,
  WATCHDOG_STALL_MS,
} from './lighting/lightingController'
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
export type { PanTiltCalibration, SixDeskRig, SixDeskRigOptions } from './presets/sixDeskRoom'
export {
  createSixDeskKeyboardKeymap,
  createSixDeskRoomRig,
  parsePanTiltCalibration,
  SIX_DESK_ADDRESSES,
  SIX_DESK_BUTTON_COLORS,
  SIX_DESK_PROFILES,
} from './presets/sixDeskRoom'
export type {
  AddFixtureInput,
  AddFixtureResult,
  BrowserCheck,
  FixtureTestResult,
  InterfaceChoice,
  SetupStepId,
  SetupSummary,
  SetupWizard,
  SetupWizardState,
  SmokeCheckId,
  WizardResult,
} from './setup/setupWizard'
export {
  checkBrowser,
  createSetupWizard,
  INTERFACE_CHOICES,
  SETUP_STEPS,
  SMOKE_CHECK_LABELS,
  SMOKE_CHECKS,
  TIMED_RELAY_MAX_MS,
} from './setup/setupWizard'
export type { ButtonIndex, BuzzerButton, Desk, Rgb, Rgbw, Unsubscribe } from './types'
export {
  buttonToIndex,
  BUZZER_BUTTONS,
  clampDeskCount,
  DEFAULT_DESK_COUNT,
  DEFAULT_DESKS,
  DESKS,
  desksForCount,
  isBuzzerButton,
  isDesk,
} from './types'
