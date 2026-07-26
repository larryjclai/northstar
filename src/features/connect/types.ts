export type ConnectState = "localOnly" | "needsRecoveryKit" | "readyToSync" | "syncEnabled";

export interface DeviceIdentity {
  id: string;
  name: string;
  platform: "macos" | "windows" | "linux" | "ios" | "android" | "web";
  trustedAt: string | null;
}

export interface KeyEnvelopeMetadata {
  id: string;
  userId: string;
  deviceId: string;
  keyType: "personalVault" | "householdSpace";
  wrappedKeyVersion: number;
  createdAt: string;
}

export interface HouseholdSpace {
  id: string;
  name: string;
  keyEnvelopeIds: string[];
  memberUserIds: string[];
}

export interface RecoveryKitStatus {
  createdAt: string | null;
  confirmedAt: string | null;
}
