import type { ConnectState, RecoveryKitStatus } from "./types";

export function getConnectState(input: {
  isSignedIn: boolean;
  wantsCloudFeature: boolean;
  recoveryKit: RecoveryKitStatus;
  syncEnabled: boolean;
}): ConnectState {
  if (!input.wantsCloudFeature) return "localOnly";
  if (!input.isSignedIn) return "needsRecoveryKit";
  if (!input.recoveryKit.confirmedAt) return "needsRecoveryKit";
  return input.syncEnabled ? "syncEnabled" : "readyToSync";
}

export function canEnableCloudBackedFeature(input: {
  isSignedIn: boolean;
  recoveryKit: RecoveryKitStatus;
}) {
  return input.isSignedIn && Boolean(input.recoveryKit.confirmedAt);
}

export const connectProductRules = [
  "Local-only mode never requires an account.",
  "Connect requires a confirmed Recovery Kit before any cloud-backed sync starts.",
  "Account login identifies the user but never decrypts the vault by itself.",
  "A new device needs trusted-device approval or the Recovery Kit.",
  "Household sharing uses a separate Household Space Key.",
  "Northstar cannot recover encrypted data if every trusted device and the Recovery Kit are lost.",
];
