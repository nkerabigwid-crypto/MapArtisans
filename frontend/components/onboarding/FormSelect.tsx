"use client";

import { Select } from "@base-ui/react/select";

interface Option {
  label: string;
  value: string;
}

interface FormSelectProps {
  label: string;
  placeholder: string;
  items: Option[];
  value: string | null;
  onValueChange: (value: string) => void;
}

/**
 * Select habillé aux couleurs du design system.
 *
 * Base UI ne fournit que le comportement (navigation clavier, ARIA, placement
 * du popup) ; toute l'apparence vient de globals.css, comme le reste de l'app.
 */
export default function FormSelect({
  label,
  placeholder,
  items,
  value,
  onValueChange,
}: FormSelectProps) {
  return (
    <Select.Root
      items={items}
      value={value}
      onValueChange={(next) => onValueChange(next as string)}
    >
      <Select.Label className="field-label">{label}</Select.Label>
      <Select.Trigger className="field-control select-trigger">
        <Select.Value placeholder={placeholder} />
        <Select.Icon className="select-icon" aria-hidden="true">
          ▾
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={4} className="select-positioner">
          <Select.Popup className="select-popup">
            <Select.List>
              {items.map((item) => (
                <Select.Item key={item.value} value={item.value} className="select-item">
                  <Select.ItemIndicator className="select-indicator">✓</Select.ItemIndicator>
                  <Select.ItemText>{item.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
