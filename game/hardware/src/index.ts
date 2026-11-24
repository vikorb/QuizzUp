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
export type { BuzzerColor, BuzzerCorner, BuzzerLayout, BuzzerStyle } from './buzzers/layout'
export {
  buttonsByCorner,
  BUZZER_COLORS,
  BUZZER_CORNERS,
  cloneBuzzerLayout,
  DEFAULT_BUZZER_LAYOUT,
  defaultBuzzerLayout,
  moveBuzzerToCorner,
  parseBuzzerLayout,
  setBuzzerColor,
} from './buzzers/layout'
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
  RoomConfigImportRefusal,
  RoomConfigImportResult,
  RoomConfigImportSummary,
  RoomHardwareConfig,
} from './config'
export {
  activeKeymap,
  activeLightingConfig,
  defaultRoomHardwareConfig,
  DMX_REFRESH_LIMITS,
  exportRoomConfig,
  gamepadMatcher,
  parseRoomConfigImport,
  parseRoomHardwareConfig,
  ROOM_CONFIG_EXPORT_FORMAT,
  ROOM_CONFIG_IMPORT_MAX_BYTES,
  ROOM_HARDWARE_CONFIG_VERSION,
  smokeLacksRelay,
  smokeRelayRuleMet,
  withArtnetTarget,
  withBuzzerLayout,
  withDesksCount,
  withDeviceIdentity,
  withLearnedKeymap,
  withoutSmokeEscalation,
  withoutUnknownKeys,
  withPlanPoint,
} from './config'
export type {
  ArtnetNode,
  ArtnetTargetConfig,
  BridgeArtnetStatus,
  BridgeHoldErrorCode,
  BridgeOutput,
  BridgeOutputOptions,
  BridgePollErrorCode,
  WebSocketConstructorLike,
  WebSocketLike,
} from './dmx/bridgeOutput'
export {
  BRIDGE_FEATURE_HOLD,
  BRIDGE_FEATURE_POLL,
  BRIDGE_FRAME_BYTES,
  BRIDGE_HOLD_LIMITS,
  BRIDGE_MAX_BUFFERED_BYTES,
  BRIDGE_OPEN_TIMEOUT_MS,
  BRIDGE_PROTOCOL_VERSION,
  BridgeHoldError,
  BridgePollError,
  createBridgeOutput,
  DEFAULT_BRIDGE_PORT,
  DEFAULT_BRIDGE_URL,
  encodeBridgeFrame,
  isLocalArtnetTarget,
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
  hasProgressiveSmokeChannel,
  hasSmokeRelay,
  MAX_COLOR_SLOTS,
} from './dmx/profiles'
export type {
  DmxPortChoice,
  DmxPortExclusion,
  SerialErrorCode,
  SerialErrorDescription,
  SerialLike,
  SerialPortLike,
  UsbId,
} from './dmx/serialOutput'
export {
  createSerialOutput,
  describePort,
  describeSerialError,
  findDmxPortByUsb,
  getGrantedDmxPort,
  getWebSerial,
  isWebSerialSupported,
  OPEN_DMX_FRAME_MS,
  portUsbId,
  requestDmxPort,
  watchDmxPortReconnection,
} from './dmx/serialOutput'
export type { SimulationOutput } from './dmx/simulationOutput'
export { createSimulationOutput } from './dmx/simulationOutput'
export { DMX_CHANNELS, encodeRawDmxFrame, encodeUsbProFrame, MAX_UNIVERSES } from './dmx/universe'
export type { IntelHexErrorReason } from './firmware/intelHex'
export { IntelHexError, parseIntelHex, writeIntelHex } from './firmware/intelHex'
export type {
  BootloaderClient,
  FirmwareErrorCode,
  FirmwareProgress,
  FirmwareStep,
  InstallFirmwareOptions,
} from './firmware/stk500'
export { FirmwareError, installFirmware, restoreFirmware, UNO_FLASH_SIZE } from './firmware/stk500'
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
  ExitLightConfig,
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
  DEFAULT_EXIT,
  DEFAULT_SCENES,
  defaultScenesFor,
  exitScene,
  NEON,
  SCENE_IDS,
  SHOW_CUES,
} from './lighting/scenes'
export type { ParsedExit, ParsedScenes } from './lighting/showConfig'
export { parseExit, parseScenes, SCENE_LIMITS } from './lighting/showConfig'
export type {
  SmokeBoardConfig,
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
  parseSmokeBoard,
  SMOKE_BOARD_KINDS,
  SMOKE_HARD_LIMITS,
} from './lighting/smoke'
export type { PlanFixture, PlanPoint, PlanTarget, RoomPlan } from './plan'
export { DEFAULT_SCREEN_POINT, defaultRoomPlan, parseRoomPlan, resolveRoomPlan } from './plan'
export type {
  RoomTemplate,
  RoomTemplateFixture,
  RoomTemplateResult,
  RoomTemplateRig,
  UniverseAssignment,
} from './presets/roomTemplates'
export { createRigFromTemplate, proposeUniverses, ROOM_TEMPLATES } from './presets/roomTemplates'
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
  CalibrationTarget,
  FixtureTestResult,
  InterfaceChoice,
  PanTiltAxis,
  SetupStepId,
  SetupSummary,
  SetupWizard,
  SetupWizardState,
  SmokeCheckId,
  ValidateCalibrationResult,
  WizardResult,
} from './setup/setupWizard'
export {
  checkBrowser,
  createSetupWizard,
  INTERFACE_CHOICES,
  invertFixtureAxis,
  nudgePanTilt,
  PAN_TILT_CENTER,
  PAN_TILT_COARSE_STEP,
  PAN_TILT_FINE_STEP,
  SETUP_STEPS,
  SMOKE_CHECK_LABELS,
  SMOKE_CHECKS,
  SMOKE_RELAY_REQUIRED,
  TIMED_RELAY_MAX_MS,
} from './setup/setupWizard'
export type {
  SmokeBoardLink,
  SmokeBoardLinkOptions,
  SmokeBoardPhase,
  SmokeBoardPort,
  SmokeBoardProblem,
  SmokeBoardState,
  SmokeBoardStatus,
} from './smoke/boardLink'
export {
  BOARD_BANNER_TIMEOUT_MS,
  BOARD_FIRE_INTERVAL_MS,
  BOARD_PRESENCE_MS,
  BOARD_SILENCE_MS,
  createSmokeBoardLink,
} from './smoke/boardLink'
export type {
  BannerRejection,
  BannerResult,
  BoardBanner,
  BoardCause,
  BoardCommand,
  BoardOutputState,
  BoardStatusLine,
  LineSplitter,
} from './smoke/boardProtocol'
export {
  BOARD_BAUD_RATE,
  BOARD_CAUSES,
  BOARD_MAX_LINE_BYTES,
  BOARD_OUTPUT_STATES,
  BOARD_PROTOCOL,
  createLineSplitter,
  encodeBoardCommand,
  isBannerLine,
  parseBanner,
  parseStatusLine,
} from './smoke/boardProtocol'
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
