"use client";

import { useEffect, useRef, useState } from "react";
import { inputStyle } from "@/components/ui";

// Generic searchable combobox — type-to-filter dropdown, replacing plain
// <select> for phone/IMEI pickers. Ported from the CPSquare ERP v8.6 demo.
export default function SearchCombobox<T extends { __key: string }>({
  options, value, onSelect, placeholder, renderLabel, searchText, emptyText, allowCreate, onCreate,
}: {
  options: T[];
  value: string;
  onSelect: (key: string) => void;
  placeholder?: string;
  renderLabel: (o: T) => string;
  searchText: (o: T) => string;
  emptyText?: string;
  allowCreate?: boolean;
  onCreate?: (query: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.__key === value);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = options.filter((o) => searchText(o).toLowerCase().includes(query.toLowerCase()));
  const exactMatch = filtered.some((o) => searchText(o).toLowerCase() === query.toLowerCase());

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <input
        value={open ? query : selected ? renderLabel(selected) : ""}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
      {open && (
        <div className="combo-list">
          {allowCreate && query.trim() && !exactMatch && (
            <div
              className="combo-item"
              style={{ fontWeight: 700, color: "var(--accent-dark)", background: "var(--accent-bg)" }}
              onMouseDown={() => { onCreate?.(query.trim()); setOpen(false); }}
            >
              ✨ + Create new variant: &quot;{query.trim()}&quot;
            </div>
          )}
          {filtered.length === 0 && !(allowCreate && query.trim()) && <div style={{ padding: "10px 12px", fontSize: 12.5, color: "var(--text-faint)" }}>{emptyText || "No matches"}</div>}
          {filtered.slice(0, 30).map((o) => (
            <div key={o.__key} className="combo-item" onMouseDown={() => { onSelect(o.__key); setOpen(false); setQuery(""); }}>
              {renderLabel(o)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
