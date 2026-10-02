"use client";

import { useState } from "react";
import { formatPhoneInput, PHONE_INPUT_PREFIX } from "@buscom/domain/customer/phone";

/**
 * Поле телефона: «+7» стоит сразу, номер раскладывается в «+7 912 345-67-89» по мере
 * набора (решение владельца 02.10.2026). В форму уходит под именем `name` как обычное поле.
 */
export function PhoneInput(props: Omit<React.ComponentProps<"input">, "value" | "defaultValue" | "onChange" | "type">) {
  const [value, setValue] = useState(PHONE_INPUT_PREFIX);
  return (
    <input
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      {...props}
      value={value}
      onChange={(event) => setValue(formatPhoneInput(event.target.value))}
    />
  );
}
