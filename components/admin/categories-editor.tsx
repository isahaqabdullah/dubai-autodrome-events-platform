"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { EventTicketOption } from "@/lib/types";

interface CategoriesEditorProps {
  initialCategories: EventTicketOption[];
}

function createCategory(): EventTicketOption {
  return {
    id: `cat-${Math.random().toString(36).slice(2, 10)}`,
    title: "",
    description: "",
    note: "",
    badge: "",
    priceMinor: 0,
    currencyCode: "AED",
    soldOut: false
  };
}

export function CategoriesEditor({ initialCategories }: CategoriesEditorProps) {
  const [categories, setCategories] = useState<EventTicketOption[]>(initialCategories);
  const serializedValue = useMemo(() => JSON.stringify(categories), [categories]);

  return (
    <div className="grid gap-4">
      <input type="hidden" name="categoriesJson" value={serializedValue} />

      {categories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate/20 bg-slate-50 px-4 py-5 text-sm text-slate">
          No categories defined. A default &quot;General Admission&quot; category will be used.
        </div>
      ) : null}

      {categories.map((category, index) => (
        <section key={category.id} className="admin-card grid gap-4 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="admin-label">Category {index + 1}</p>
              <p className="mt-1 text-base font-semibold tracking-tight text-ink">
                {category.title.trim() || "Untitled category"}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="rounded-2xl"
              onClick={() => setCategories((current) => current.filter((c) => c.id !== category.id))}
            >
              Remove
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-ink">Title</span>
              <Input
                value={category.title}
                onChange={(event) =>
                  setCategories((current) =>
                    current.map((c) =>
                      c.id === category.id ? { ...c, title: event.target.value } : c
                    )
                  )
                }
                placeholder="VIP"
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-ink">Capacity</span>
              <Input
                type="number"
                min={1}
                value={category.capacity ?? ""}
                onChange={(event) =>
                  setCategories((current) =>
                    current.map((c) =>
                      c.id === category.id
                        ? { ...c, capacity: event.target.value ? Number(event.target.value) : null }
                        : c
                    )
                  )
                }
                placeholder="No limit"
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-ink">Badge</span>
              <Input
                value={category.badge ?? ""}
                onChange={(event) =>
                  setCategories((current) =>
                    current.map((c) =>
                      c.id === category.id ? { ...c, badge: event.target.value } : c
                    )
                  )
                }
                placeholder="Popular"
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-ink">Price (AED)</span>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={((category.priceMinor ?? 0) / 100).toString()}
                onChange={(event) =>
                  setCategories((current) =>
                    current.map((c) =>
                      c.id === category.id
                        ? { ...c, priceMinor: Math.round(Number(event.target.value || 0) * 100), currencyCode: "AED" }
                        : c
                    )
                  )
                }
                placeholder="0.00"
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </label>
          </div>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-ink">Description</span>
            <Input
              value={category.description ?? ""}
              onChange={(event) =>
                setCategories((current) =>
                  current.map((c) =>
                    c.id === category.id ? { ...c, description: event.target.value } : c
                  )
                )
              }
              placeholder="Premium experience with exclusive access"
              className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
            />
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-slate/10 bg-slate-50 px-4 py-3 text-sm text-slate">
            <Checkbox
              checked={category.soldOut ?? false}
              onChange={(event) =>
                setCategories((current) =>
                  current.map((c) =>
                    c.id === category.id ? { ...c, soldOut: event.target.checked } : c
                  )
                )
              }
            />
            <span>
              <strong className="block text-sm text-ink">Mark as unavailable</strong>
              Keep visible but not selectable.
            </span>
          </label>
        </section>
      ))}

      <div>
        <Button
          type="button"
          variant="secondary"
          className="rounded-2xl"
          onClick={() => setCategories((current) => [...current, createCategory()])}
        >
          Add category
        </Button>
      </div>
    </div>
  );
}
