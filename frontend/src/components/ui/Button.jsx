/**
 * Button — custom button component.
 *
 * Props
 * ─────
 * variant   "primary" | "secondary" | "danger" | "success" | "ghost" | "link"
 *           Default: "primary"
 * size      "xs" | "sm" | "md" | "lg"
 *           Default: "md"
 * leftIcon  ReactNode  — shown before label
 * rightIcon ReactNode  — shown after label
 * mobileIcon  string | false — on phones EVERY text button shrinks to just its icon (leftIcon, or one picked from the
 *             words); pass a name from ui/Icon.jsx to choose one, or false to always keep the words.
 * mobileLabel string — the words to use for the phone icon / tooltip when the children are dynamic (e.g. a loading ternary).
 * (A submit button always keeps its words, and so do buttons inside dialogs / bottom sheets.)
 * loading   boolean    — shows spinner, disables button
 * disabled  boolean
 * type      "button" | "submit" | "reset"  Default: "button"
 * className string     — extra classes appended
 * ...rest   any other <button> props (onClick, title, etc.)
 */
import Icon from "./Icon";
import { iconForLabel } from "./iconLabels";
import { BUTTON_BASE, BUTTON_VARIANTS, BUTTON_SIZES } from "./buttonStyles";

export default function Button({
  children,
  variant = "primary",
  size = "md",
  leftIcon,
  rightIcon,
  loading = false,
  disabled = false,
  type = "button",
  className = "",
  mobileIcon,
  mobileLabel,
  ...rest
}) {
  const base = BUTTON_BASE;
  const variants = BUTTON_VARIANTS;
  const sizes = BUTTON_SIZES;

  const sizeClass = variant === "link" ? "" : sizes[size] ?? sizes.md;
  const variantClass = variants[variant] ?? variants.primary;

  // Phones: every button with a plain-text label shows ONLY its icon (the words stay for screen readers and as a
  // tooltip). The icon is the one given as leftIcon / mobileIcon, or else picked from the words. A submit button
  // keeps its words (it is the call to action of its form), and so does any button with no fitting icon.
  // Inside dialogs and bottom sheets (anything position:fixed) the words always stay — see index.css.
  const label = typeof children === "string" ? children.trim() : (typeof mobileLabel === "string" ? mobileLabel : null);
  const autoIcon = label && type !== "submit" && !leftIcon ? iconForLabel(label) : null;
  const phoneIcon = mobileIcon === false ? null : (typeof mobileIcon === "string" ? mobileIcon : autoIcon);
  const iconOnlyPhone = !!label && type !== "submit" && mobileIcon !== false && (!!phoneIcon || !!leftIcon);

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`${base} ${variantClass} ${sizeClass} ${iconOnlyPhone ? "max-sm:px-2.5 btn-compact" : ""} ${className}`}
      {...(iconOnlyPhone ? { "aria-label": label, title: rest.title || label } : {})}
      {...rest}
    >
      {loading ? (
        <svg
          className="animate-spin h-4 w-4 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
      ) : (
        leftIcon && <span className="btn-lefticon flex-shrink-0">{leftIcon}</span>
      )}
      {phoneIcon && !leftIcon && !loading && <Icon name={phoneIcon} className="btn-icon w-4 h-4 sm:hidden" />}
      {children && <span className={iconOnlyPhone ? "btn-label hidden sm:inline" : undefined}>{children}</span>}
      {!loading && rightIcon && (
        <span className="flex-shrink-0">{rightIcon}</span>
      )}
    </button>
  );
}
