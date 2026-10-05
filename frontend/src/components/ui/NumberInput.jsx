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
export default function NumberInput({ value, onChange, name, allowDecimals = true, decimals, onBlur, ...props }) {
  const raw = value === null || value === undefined ? "" : String(value).replace(/,/g, "");
  const maxDecimals = decimals === 0 || decimals === "0" ? 0 : (decimals == null || decimals === "" ? null : Number(decimals));
  const allowDec = allowDecimals && maxDecimals !== 0;

  // Strip everything except digits and (optionally) a single decimal point,
  // so pasted or typed junk (letters, extra dots, spaces) never sneaks in.
  const sanitize = (v) => {
    const cleaned = String(v).replace(allowDec ? /[^\d.]/g : /[^\d]/g, "");
    if (!allowDec) return cleaned;
    const dot = cleaned.indexOf(".");
    if (dot === -1) return cleaned;
    const intPart = cleaned.slice(0, dot);
    let decPart = cleaned.slice(dot + 1).replace(/\./g, "");
    if (maxDecimals != null) decPart = decPart.slice(0, maxDecimals);
    return `${intPart}.${decPart}`;
  };

  const formatDisplay = (v) => {
    if (v === "") return "";
    const [intPart, decPart] = v.split(".");
    const withCommas = intPart === "" ? "" : Number(intPart).toLocaleString("en-US");
    return decPart !== undefined ? `${withCommas || "0"}.${decPart}` : withCommas;
  };

  const handleChange = (e) => {
    const rawValue = sanitize(e.target.value);
    onChange?.({ ...e, target: { ...e.target, name, value: rawValue } });
  };

  const handleBlur = (e) => {
    const current = sanitize(e.target.value);
    if (maxDecimals != null && current !== "" && current !== ".") {
      const n = Number(current);
      if (Number.isFinite(n)) onChange?.({ ...e, target: { ...e.target, name, value: n.toFixed(maxDecimals) } });
    }
    onBlur?.(e);
  };

  return (
    <Input
      {...props}
      name={name}
      type="text"
      inputMode={allowDec ? "decimal" : "numeric"}
      value={formatDisplay(raw)}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}
