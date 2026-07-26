import { useState } from "react";

/**
 * Handles focus/blur thousand-separator display for a plain numeric field.
 * - Focused: shows raw number for editing
 * - Blurred: shows locale-formatted value (zh-TW thousand separators)
 */
export function useNumericField(value: number, onChange: (v: number) => void) {
  const [focused, setFocused] = useState(false);

  return {
    type: "text" as const,
    inputMode: "decimal" as const,
    value: focused ? value || "" : value ? value.toLocaleString("zh-TW") : "",
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value.replace(/[^\d.]/g, "")) || 0);
    },
  };
}
