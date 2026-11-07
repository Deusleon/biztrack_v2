/**
 * ActionLink — a router <Link> that looks and behaves exactly like <Button> (same variants, sizes and the same
 * "icon only on phones" rule). Use it for page actions that navigate ("Add Staff", "Bulk Upload", "Back").
 */
import { Link } from "react-router-dom";
import Icon from "./Icon";
import { iconForLabel } from "./iconLabels";
import { BUTTON_BASE, BUTTON_VARIANTS, BUTTON_SIZES } from "./buttonStyles";

export default function ActionLink({ to, children, variant = "primary", size = "md", leftIcon, mobileIcon, className = "", ...rest }) {
  const label = typeof children === "string" ? children.trim() : null;
  const phoneIcon = mobileIcon === false ? null : (typeof mobileIcon === "string" ? mobileIcon : (label && !leftIcon ? iconForLabel(label) : null));
  const iconOnlyPhone = !!label && mobileIcon !== false && (!!phoneIcon || !!leftIcon);
  return (
    <Link
      to={to}
      className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant] ?? BUTTON_VARIANTS.primary} ${BUTTON_SIZES[size] ?? BUTTON_SIZES.md} ${iconOnlyPhone ? "max-sm:px-2.5 btn-compact" : ""} ${className}`}
      {...(iconOnlyPhone ? { "aria-label": label, title: rest.title || label } : {})}
      {...rest}
    >
      {leftIcon && <span className="btn-lefticon flex-shrink-0">{leftIcon}</span>}
      {phoneIcon && !leftIcon && <Icon name={phoneIcon} className="btn-icon w-4 h-4 sm:hidden" />}
      {children && <span className={iconOnlyPhone ? "btn-label hidden sm:inline" : undefined}>{children}</span>}
    </Link>
  );
}
