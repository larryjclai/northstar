export const UPDATE_RESTART_RETRY_MESSAGE = "更新暫存檔需要重新整理。請重新開啟 Northstar 後再試一次。";

export function isCrossDeviceLinkUpdateError(detail: string) {
  return /cross-device link|os error 18|\bEXDEV\b/i.test(detail);
}

export function updateFailureMessage(detail: string) {
  return isCrossDeviceLinkUpdateError(detail)
    ? UPDATE_RESTART_RETRY_MESSAGE
    : `無法檢查更新：${detail}`;
}
