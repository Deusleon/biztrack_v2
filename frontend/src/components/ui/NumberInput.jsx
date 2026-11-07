import Input from "./Input";

/**
 * Drop-in replacement for <Input type="number"> wherever the value is a
 * plain amount (money, quantities, etc.) that's nicer to read with comma
 * thousands separators as you type — e.g. "1,250,000" instead of "1250000".
 *
 * The value/onChange contract stays a plain unformatted number string, so
 * this is a drop-in swap wherever `<Input type="number" onChange={handler} />`
 * is already used — `handler` still receives `{ target: { name, value } }`
 * with a plain numeric string (e.g. "1250000"), never the comma-formatted
 * display text. Supports decimals (e.g. "1,250.50") since amounts aren't
 * always whole numbers.
 */
export default function NumberInput({ value, onChange, name, allowDecimals = true, ...props }) {
  const raw = value === null || value === undefined ? "" : String(value);

  // Strip everything except digits and (optionally) a single decimal point,
  // so pasted or typed junk (letters, extra dots, spaces) never sneaks in.
  const sanitize = (v) => {
    let cleaned = v.replace(allowDecimals ? /[^\d.]/g : /[^\d]/g, "");
    if (allowDecimals) {
      const parts = cleaned.split(".");
      if (parts.length > 2) cleaned = parts[0] + "." + parts.slice(1).join("");
    }
    return cleaned;
  };

  const formatDisplay = (v) => {
    if (v === "") return "";
    const [intPart, decPart] = v.split(".");
    const withCommas = intPart === "" ? "" : Number(intPart).toLocaleString();
    return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
  };

  const handleChange = (e) => {
    const rawValue = sanitize(e.target.value);
    onChange?.({ ...e, target: { ...e.target, name, value: rawValue } });
  };

  return (
    <Input
      {...props}
      name={name}
      type="text"
      inputMode="decimal"
      value={formatDisplay(raw)}
      onChange={handleChange}
    />
  );
}
