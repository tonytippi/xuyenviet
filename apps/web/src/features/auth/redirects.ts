const maxPublicDraftLength = 500;

export function normalizePublicAskDraft(value: FormDataEntryValue | string | null | undefined) {
  if (typeof value !== "string") {
    return undefined;
  }

  const draft = value.trim().slice(0, maxPublicDraftLength);

  return draft || undefined;
}

export function getSafeRedirectPath(value: FormDataEntryValue | null, params?: { draft?: FormDataEntryValue | string | null }) {
  if (value === "/ai-ask" || value === "/admin") {
    const draft = value === "/ai-ask" ? normalizePublicAskDraft(params?.draft) : undefined;

    if (draft) {
      const query = new URLSearchParams({ draft });

      return `${value}?${query.toString()}`;
    }

    return value;
  }

  return "/ai-ask";
}
