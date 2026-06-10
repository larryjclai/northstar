import type { Dispatch, SetStateAction } from "react";
import type { TFunction } from "i18next";
import type { AppSettings } from "../../domain";

/** Props every settings tab receives from the SettingsRoute shell. */
export interface SettingsTabProps {
  form: AppSettings;
  setForm: Dispatch<SetStateAction<AppSettings>>;
  /** Persist the next settings snapshot, then mirror it into local state. */
  submit: (next: AppSettings) => Promise<void>;
  t: TFunction;
}
