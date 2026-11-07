// FILE PATH: frontend/src/components/ui/iconLabels.js
/** Picks the icon (a name from ui/Icon.jsx) that means the same as a button's words: "Add Staff" → plus, "Bulk Upload" → upload… */
// First match wins, so the more specific words come first.
const RULES = [
  [/test connection|^test\b/, "bolt"],
  [/bulk upload|upload|import|choose file/, "upload"],
  [/download|export|template|pdf|excel/, "download"],
  [/print/, "printer"],
  [/^(back|go back|return)\b/, "arrowLeft"],
  [/^(re)?activate\b|^enable\b/, "check"],
  [/delete|remove|void|disconnect|deactivate/, "trash"],
  [/^(add|new|create|record|issue|register|start|request)\b/, "plus"],
  [/buy|top up|credits|payment|pay\b|invoice/, "cash"],
  [/send|compose|reminder/, "send"],
  [/edit|change|adjust|modify/, "pencil"],
  [/copy/, "copy"],
  [/connect|link/, "link"],
  [/search|find|check price|load/, "search"],
  [/filter/, "filter"],
  [/reset|clear|refresh|retry|reload|test again|check the file|start over/, "refresh"],
  [/view|details|preview|open/, "eye"],
  [/save|update|apply|confirm|submit|approve|mark|assign|promote|admit|generate/, "check"],
];

/** The icon name for a button label, or null when nothing fits well (then the words stay). */
export const iconForLabel = (label) => {
  const text = String(label || "").trim().toLowerCase();
  if (!text) return null;
  const hit = RULES.find(([re]) => re.test(text));
  return hit ? hit[1] : null;
};
