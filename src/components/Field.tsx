import { Children, isValidElement } from "react";
import type React from "react";
import type { ChangeEvent, InputHTMLAttributes, PropsWithChildren, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { AppSelect } from "./AppSelect";

export function Field({ label, children }: PropsWithChildren<{ label: string }>) {
  return (
    <label className="grid gap-1.5">
      <span className="ns-eyebrow">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`ns-input ${props.className ?? ""}`}
      style={props.style}
    />
  );
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = Children.toArray(props.children).flatMap((child) => {
    if (!isValidElement<{ value?: string; children?: React.ReactNode; disabled?: boolean }>(child)) return [];
    const value = String(child.props.value ?? "");
    const label = Children.toArray(child.props.children).join("");
    return [{ value, label, disabled: child.props.disabled }];
  });
  const value = String(props.value ?? props.defaultValue ?? options[0]?.value ?? "");
  const { className, style, disabled, onChange } = props;

  return (
    <AppSelect
      value={value}
      onChange={(next) => {
        onChange?.({
          target: { value: next },
          currentTarget: { value: next },
        } as ChangeEvent<HTMLSelectElement>);
      }}
      options={options}
      disabled={disabled}
      className={className}
      style={{ width: "100%", height: 40, ...style }}
    />
  );
}

export function TextAreaInput(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`ns-input ${props.className ?? ""}`}
      style={props.style}
    />
  );
}
