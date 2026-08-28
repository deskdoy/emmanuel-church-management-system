import { ComponentPropsWithoutRef, useState } from "react";

type PasswordFieldProps = Omit<ComponentPropsWithoutRef<"input">, "type"> & {
  label: string;
};

export function PasswordField({ label, ...inputProps }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return <label>{label}<span className="password-input"><input {...inputProps} type={visible ? "text" : "password"} /><button type="button" className="password-toggle" aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(current => !current)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.75" />{visible && <path d="m4 4 16 16" />}</svg></button></span></label>;
}
