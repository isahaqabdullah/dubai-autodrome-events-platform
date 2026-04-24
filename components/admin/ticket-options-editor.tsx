"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { EventTicketOption } from "@/lib/types";

interface TicketOptionsEditorProps {
  initialTickets: EventTicketOption[];
}

function createTicketOption(): EventTicketOption {
  return {
    id: `ticket-${Math.random().toString(36).slice(2, 10)}`,
    title: "",
    description: "",
    note: "",
    badge: "",
    priceMinor: 0,
    currencyCode: "AED",
    soldOut: false
  };
}

export function TicketOptionsEditor({ initialTickets }: TicketOptionsEditorProps) {
  const [tickets, setTickets] = useState<EventTicketOption[]>(initialTickets);
  const serializedValue = useMemo(() => JSON.stringify(tickets), [tickets]);

  return (
    <div className="grid gap-4">
      <input type="hidden" name="ticketOptionsJson" value={serializedValue} />

      {tickets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate/20 bg-slate-50 px-4 py-5 text-sm text-slate">
          No extra ticket options yet.
        </div>
      ) : null}

      {tickets.map((ticket, index) => (
        <section key={ticket.id} className="admin-card grid gap-4 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="admin-label">Ticket option {index + 1}</p>
              <p className="mt-1 text-base font-semibold tracking-tight text-ink">
                {ticket.title.trim() || "Untitled option"}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="rounded-2xl"
              onClick={() => setTickets((current) => current.filter((currentTicket) => currentTicket.id !== ticket.id))}
            >
              Remove
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-ink">Title</span>
              <Input
                value={ticket.title}
                onChange={(event) =>
                  setTickets((current) =>
                    current.map((currentTicket) =>
                      currentTicket.id === ticket.id ? { ...currentTicket, title: event.target.value } : currentTicket
                    )
                  )
                }
                placeholder="Bootcamp Admission - 18:30"
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-ink">Capacity</span>
              <Input
                type="number"
                min={1}
                value={ticket.capacity ?? ""}
                onChange={(event) =>
                  setTickets((current) =>
                    current.map((currentTicket) =>
                      currentTicket.id === ticket.id
                        ? { ...currentTicket, capacity: event.target.value ? Number(event.target.value) : null }
                        : currentTicket
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
                value={ticket.badge ?? ""}
                onChange={(event) =>
                  setTickets((current) =>
                    current.map((currentTicket) =>
                      currentTicket.id === ticket.id ? { ...currentTicket, badge: event.target.value } : currentTicket
                    )
                  )
                }
                placeholder="Maxed out"
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-ink">Price (AED)</span>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={((ticket.priceMinor ?? 0) / 100).toString()}
                onChange={(event) =>
                  setTickets((current) =>
                    current.map((currentTicket) =>
                      currentTicket.id === ticket.id
                        ? { ...currentTicket, priceMinor: Math.round(Number(event.target.value || 0) * 100), currencyCode: "AED" }
                        : currentTicket
                    )
                  )
                }
                placeholder="0.00"
                className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
              />
            </label>
          </div>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-ink">Note</span>
            <Input
              value={ticket.note ?? ""}
              onChange={(event) =>
                setTickets((current) =>
                  current.map((currentTicket) =>
                    currentTicket.id === ticket.id ? { ...currentTicket, note: event.target.value } : currentTicket
                  )
                )
              }
              placeholder="Select ONE session only (18:30 OR 19:30). Do not select both."
              className="rounded-2xl border-slate/20 bg-white px-3.5 py-3"
            />
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-slate/10 bg-slate-50 px-4 py-3 text-sm text-slate">
            <Checkbox
              checked={ticket.soldOut ?? false}
              onChange={(event) =>
                setTickets((current) =>
                  current.map((currentTicket) =>
                    currentTicket.id === ticket.id ? { ...currentTicket, soldOut: event.target.checked } : currentTicket
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
          onClick={() => setTickets((current) => [...current, createTicketOption()])}
        >
          Add ticket option
        </Button>
      </div>
    </div>
  );
}
