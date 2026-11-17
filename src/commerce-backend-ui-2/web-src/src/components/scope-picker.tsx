import { Picker, PickerItem } from "@react-spectrum/s2/Picker";

import { ListField } from "./list-field.tsx";

import type { Option } from "../lib/types.ts";

export type ScopePickerProps = {
  available: Option[];
  description: string;
  label: string;
  onChange: (value: string[]) => void;
  unavailable?: boolean;
  value: string[];
};

/**
 * Multi-select of store views or customer groups loaded from Commerce. Falls back to typed IDs
 * when Commerce couldn't be reached.
 */
export function ScopePicker({
  label,
  description,
  available,
  value,
  onChange,
  unavailable,
}: ScopePickerProps) {
  if (unavailable || available.length === 0) {
    return (
      <ListField
        description={`${description} Commerce couldn't be reached, so enter IDs separated by commas.`}
        label={label}
        onChange={onChange}
        value={value}
      />
    );
  }

  return (
    <Picker
      description={description}
      items={available}
      label={label}
      onChange={(keys) => onChange([...keys].map(String))}
      selectionMode="multiple"
      value={value}>
      {(item) => (
        <PickerItem id={item.id} textValue={item.label}>
          {`${item.label} (${item.id})`}
        </PickerItem>
      )}
    </Picker>
  );
}
