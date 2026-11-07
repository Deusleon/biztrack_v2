import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

/**
 * RowActions — the standard "kebab" menu for a table row's Actions cell.
 *
 * The system's convention is that a row with MORE THAN ONE action collapses
 * them behind a ⋮ menu rather than lining up bare text links, which keeps
 * the Actions column a fixed width and stops destructive options sitting a
 * few pixels from harmless ones.
 *
 * A single action is rendered inline instead — hiding one option behind a
 * menu is a click for nothing.
 *
 * Unlike the older hand-rolled copies of this pattern, the open/closed
 * state lives here, so a page doesn't need its own `openDropdownId` and
 * click-outside wiring to use it.
 *
 * The menu itself renders through a PORTAL into document.body, positioned
 * with fixed coordinates computed from the trigger button — not as a
 * normal absolutely-positioned child. A row is very often inside a
 * container with `overflow-hidden` or `overflow-x-auto` (DataTable's own
 * wrapper does this for horizontal scrolling on small screens, and any
 * card-style list commonly does it for rounded corners) — a plain
 * `absolute` child gets silently clipped at that ancestor's edge the
 * moment the menu is taller than the remaining space inside it. Rendering
 * outside the DOM tree entirely sidesteps every such ancestor, no matter
 * how deep. It also flips to open upward automatically when the trigger
 * is near the bottom of the viewport, for the same reason.
 *
 * Props
 * ─────
 * actions {Array} Each: { label, onClick, icon?, variant?, hidden? }
 *                   variant: "default" | "primary" | "danger" | "success"
 *                   hidden:  skip the entry entirely (permissions, status)
 * align   {string} "right" (default) | "left" — which edge the menu hangs from.
 */

const VARIANT_STYLES = {
  default: { item: "text-gray-700 hover:bg-gray-50", icon: "text-gray-500" },
  primary: { item: "text-gray-700 hover:bg-gray-50", icon: "text-blue-500" },
  danger: { item: "text-red-600 hover:bg-red-50", icon: "text-red-500" },
  success: { item: "text-green-600 hover:bg-green-50", icon: "text-green-500" },
};

const INLINE_STYLES = {
  default: "text-gray-600 hover:text-gray-900",
  primary: "text-primary hover:underline",
  danger: "text-red-500 hover:underline",
  success: "text-green-600 hover:underline",
};

const MENU_WIDTH = 192; // matches w-48
const MENU_MARGIN = 4; // matches mt-1 / mb-1

export default function RowActions({ actions = [], align = "right" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const visible = actions.filter((a) => a && !a.hidden);

  const computePosition = () => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? visible.length * 36 + 8;

    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < menuHeight + MENU_MARGIN && rect.top > menuHeight + MENU_MARGIN;

    const style = { position: "fixed", width: MENU_WIDTH, zIndex: 1000 };
    style[openUpward ? "bottom" : "top"] = openUpward
      ? window.innerHeight - rect.top + MENU_MARGIN
      : rect.bottom + MENU_MARGIN;

    if (align === "left") {
      style.left = Math.max(8, rect.left);
    } else {
      style.left = Math.min(window.innerWidth - MENU_WIDTH - 8, Math.max(8, rect.right - MENU_WIDTH));
    }
    setMenuStyle(style);
  };

  // Position is computed the instant the menu opens (before paint, so
  // there's no visible jump), then kept in sync with scrolling/resizing
  // for as long as it stays open — the row itself can scroll out from
  // under a menu anchored with `fixed` otherwise.
  useLayoutEffect(() => {
    if (!isOpen) return;
    computePosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event) => {
      const insideTrigger = triggerRef.current && triggerRef.current.contains(event.target);
      const insideMenu = menuRef.current && menuRef.current.contains(event.target);
      if (!insideTrigger && !insideMenu) setIsOpen(false);
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    const handleReposition = () => computePosition();
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (visible.length === 0) {
    return <span className="text-xs text-gray-300">—</span>;
  }

  // One action doesn't earn a menu.
  if (visible.length === 1) {
    const action = visible[0];
    return (
      <button
        onClick={(e) => { e.stopPropagation(); action.onClick(); }}
        className={`text-xs font-medium ${INLINE_STYLES[action.variant] || INLINE_STYLES.primary}`}
      >
        {action.label}
      </button>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={(e) => { e.stopPropagation(); setIsOpen((o) => !o); }}
        className="text-gray-400 hover:text-gray-600 p-1 rounded"
        aria-label="Row actions"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm8 0a2 2 0 11-4 0 2 2 0 014 0zm8 0a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </button>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          role="menu"
          onMouseDown={(e) => e.stopPropagation()}
          // Rendered with a safe, invisible fallback position on the very
          // first frame (menuStyle is only null for the instant before
          // useLayoutEffect measures the real trigger/menu size) — that
          // effect runs synchronously before the browser paints, so this
          // fallback is never actually visible to the person clicking.
          style={menuStyle || { position: "fixed", top: 0, left: 0, visibility: "hidden" }}
          className="bg-white rounded shadow-lg border border-gray-100 py-1"
        >
          {visible.map((action, idx) => {
            const styles = VARIANT_STYLES[action.variant] || VARIANT_STYLES.default;
            return (
              <button
                key={idx}
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                  action.onClick();
                }}
                className={`w-full text-left px-4 py-2 text-sm flex items-center space-x-2 ${styles.item}`}
              >
                {action.icon && <span className={`flex-shrink-0 ${styles.icon}`}>{action.icon}</span>}
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

/** Icons for the actions that recur across the system, so every module's
 * menu reads the same way instead of each page picking its own glyph. */
const icon = (d) => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
  </svg>
);

export const ACTION_ICONS = {
  view: icon("M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"),
  edit: icon("M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"),
  delete: icon("M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"),
  remove: icon("M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"),
  download: icon("M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"),
  upload: icon("M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"),
  print: icon("M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m10-10V5a2 2 0 00-2-2H9a2 2 0 00-2 2v2m10 0H7m10 0h2M7 17h10v4H7v-4z"),
  check: icon("M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"),
  copy: icon("M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"),
  calendar: icon("M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"),
  add: icon("M12 4v16m8-8H4"),
  members: icon("M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-8.13a4 4 0 11-6 0 4 4 0 016 0zm6 3a4 4 0 11-8 0 4 4 0 018 0z"),
};
