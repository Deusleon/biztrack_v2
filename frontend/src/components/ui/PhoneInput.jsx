import Input from "./Input";
import { normalizePhoneInput, PHONE_MAX_LENGTH } from "../../utils/phone";

/**
 * Drop-in replacement for <Input type="tel"> everywhere a phone number is
 * collected. Restricts keystrokes to digits only and normalizes a local
 * "07XXXXXXXX" entry to "2557XXXXXXXX" as the person types, so every phone
 * number in the system ends up stored the same way (255XXXXXXXXX) without
 * anyone having to remember the convention.
 *
 * `onChange` still receives a normal `{ target: { name, value } }` event,
 * so it's a drop-in swap wherever `<Input name="phone" onChange={handleChange} />`
 * is already used with a standard handler.
 */
export default function PhoneInput({ onChange, name, placeholder = "255712345678", helperText, ...props }) {
  const handleChange = (e) => {
    const normalized = normalizePhoneInput(e.target.value).slice(0, PHONE_MAX_LENGTH);
    onChange?.({ ...e, target: { ...e.target, name, value: normalized } });
  };

  return (
    <Input
      {...props}
      name={name}
      type="tel"
      inputMode="numeric"
      onChange={handleChange}
      placeholder={placeholder}
      helperText={helperText || "Digits only, e.g. 255712345678"}
    />
  );
}
