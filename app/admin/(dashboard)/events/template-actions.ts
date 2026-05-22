"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/lib/auth";
import type {
  EventFormTemplate,
  EventFormTemplateDeleteResult,
  EventFormTemplateImportResult,
  EventFormTemplateSaveResult,
  SaveEventFormTemplateInput
} from "@/lib/event-form-templates";
import {
  deleteEventFormTemplate,
  importEventFormTemplates,
  saveEventFormTemplate
} from "@/services/admin";

function revalidateEventTemplatePages() {
  revalidatePath("/admin/events/new");
  revalidatePath("/admin");
}

export async function saveEventFormTemplateAction(
  input: SaveEventFormTemplateInput
): Promise<EventFormTemplateSaveResult> {
  const actor = await requireAuthenticatedUser("admin");

  try {
    const template = await saveEventFormTemplate(input, actor);
    revalidateEventTemplatePages();
    return { ok: true, template };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to save the template."
    };
  }
}

export async function importLocalEventFormTemplatesAction(
  templates: EventFormTemplate[]
): Promise<EventFormTemplateImportResult> {
  const actor = await requireAuthenticatedUser("admin");

  try {
    const result = await importEventFormTemplates(templates, actor);
    revalidateEventTemplatePages();
    return { ok: true, ...result };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to import local templates."
    };
  }
}

export async function deleteEventFormTemplateAction(
  templateId: string
): Promise<EventFormTemplateDeleteResult> {
  const actor = await requireAuthenticatedUser("admin");

  try {
    const deletedTemplateId = await deleteEventFormTemplate(templateId, actor);
    revalidateEventTemplatePages();
    return { ok: true, templateId: deletedTemplateId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to delete the template."
    };
  }
}
