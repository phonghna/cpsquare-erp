"use client";

import { createContext, useContext, useEffect, useState } from "react";

type MobileNavCtx = { open: boolean; toggle: () => void; close: () => void };

const Ctx = createContext<MobileNavCtx | null>(null);

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  // While the mobile drawer is open, lock the page behind it from
  // scrolling. Without this, a finger-drag that lands on the backdrop (or
  // slips past it) scrolls the main page underneath a `position: fixed`
  // sidebar — and on many mobile browsers, scrolling content behind a fixed
  // element during the same touch gesture causes that fixed element to
  // visibly lag/detach from the screen edge for a frame ("compositing
  // jank"), which looks exactly like the panel drifting away from the
  // bottom. Freezing body scroll removes the conflicting scroll entirely.
  useEffect(() => {
    if (!open) return;
    const { style } = document.body;
    const prevOverflow = style.overflow;
    const prevPosition = style.position;
    const prevWidth = style.width;
    const scrollY = window.scrollY;
    style.overflow = "hidden";
    style.position = "fixed";
    style.top = `-${scrollY}px`;
    style.width = "100%";
    return () => {
      style.overflow = prevOverflow;
      style.position = prevPosition;
      style.top = "";
      style.width = prevWidth;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  return (
    <Ctx.Provider value={{ open, toggle: () => setOpen((o) => !o), close: () => setOpen(false) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useMobileNav() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMobileNav must be used within MobileNavProvider");
  return ctx;
}
