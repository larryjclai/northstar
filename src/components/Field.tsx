import type { InputHTMLAttributes, PropsWithChildren, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

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
  return (
    <select
      {...props}
      className={`ns-input ${props.className ?? ""}`}
      style={props.style}
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
