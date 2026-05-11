import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("admin event form static safeguards", () => {
  it("does not remount or cover the form after saving", () => {
    const eventForm = readProjectFile("components/admin/event-form.tsx");

    expect(eventForm).toContain("eventObject.preventDefault();");
    expect(eventForm).toContain("const formData = new FormData(eventObject.currentTarget);");
    expect(eventForm).toContain("onSubmit={handleSubmit}");
    expect(eventForm).not.toContain("action={handleSubmit}");
    expect(eventForm).not.toContain("useRouter");
    expect(eventForm).not.toContain("router.refresh()");
    expect(eventForm).not.toContain("sticky bottom-3");
    expect(eventForm).toContain("setShowSuccess(true);");
  });

  it("does not hardcode event-specific default content", () => {
    const eventForm = readProjectFile("components/admin/event-form.tsx");
    const publicFlow = readProjectFile("components/public/event-booking-flow.tsx");

    expect(eventForm).not.toContain("DEFAULT_POSTER_IMAGE");
    expect(eventForm).not.toContain("DEFAULT_DISCLAIMER_PDF");
    expect(eventForm).not.toContain("Sheikh Mohammed Bin Zayed");
    expect(eventForm).not.toContain("Dubai Police");
    expect(eventForm).not.toContain("https://maps.app.goo.gl");
    expect(publicFlow).not.toContain("DEFAULT_INTRO");
    expect(publicFlow).not.toContain("DEFAULT_DESCRIPTION");
    expect(publicFlow).not.toContain("DEFAULT_DISCLAIMER_PDF");
    expect(publicFlow).not.toContain("Dubai Police");
  });

  it("includes local template controls", () => {
    const eventForm = readProjectFile("components/admin/event-form.tsx");

    expect(eventForm).toContain("EVENT_FORM_TEMPLATE_STORAGE_KEY");
    expect(eventForm).toContain("Save as template");
    expect(eventForm).toContain("handleLoadTemplate");
    expect(eventForm).toContain("handleDeleteTemplate");
    expect(eventForm).toContain("title, slug, schedule, status, and capacity unchanged");
  });
});
