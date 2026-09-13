"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

export type MenuItem = { label: string; onSelect: () => void; disabled?: boolean };

/**
 * F18: one button that opens a short `role="menu"` — the rail's Edit menus. Arrow keys
 * move along the items and wrap; Escape closes and puts focus back on the button; a
 * press outside closes it. Selecting an item closes the menu and focuses the button
 * FIRST, so a dialog the item opens records the button as its opener and returns focus
 * there when it closes (`Modal`).
 */
export function Menu({ id, label = "Edit", items, className, testId }: { id: string; label?: string; items: MenuItem[]; className?: string; testId?: string }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (list.current?.contains(e.target as Node) || button.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const radios = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
    const at = radios.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      radios[(at + delta + radios.length) % radios.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      (e.key === "Home" ? radios[0] : radios[radios.length - 1])?.focus();
    } else if (e.key === "Tab") {
      close(false);
    }
  }

  return (
    <div className={`menu ${className ?? ""}`} data-testid={testId}>
      <button
        ref={button}
        type="button"
        className="j-link menu-button"
        id={`${id}-button`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close(true) : setOpen(true))}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {label}
      </button>
      {open ? (
        <div ref={list} id={id} className="menu-list" role="menu" aria-labelledby={`${id}-button`} onKeyDown={onKeyDown}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="menu-item"
              disabled={item.disabled}
              tabIndex={-1}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
