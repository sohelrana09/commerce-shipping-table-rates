import { TextField } from "@react-spectrum/s2/TextField";
import { useState } from "react";

import { joinList, splitList } from "../lib/methods.ts";

export type ListFieldProps = {
  description?: string;
  label: string;
  onChange: (values: string[]) => void;
  placeholder?: string;
  value?: string[];
};

/**
 * A text field for a list ("US, CA"). It keeps what the merchant types, so a trailing comma
 * doesn't vanish mid-word, and reports the parsed list on every change.
 */
export function ListField({
  description,
  label,
  onChange,
  placeholder,
  value,
}: ListFieldProps) {
  const [text, setText] = useState(() => joinList(value));
  return (
    <TextField
      description={description}
      label={label}
      onChange={(next) => {
        setText(next);
        onChange(splitList(next));
      }}
      placeholder={placeholder}
      value={text}
    />
  );
}
