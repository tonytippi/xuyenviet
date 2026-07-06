export function getSafeRedirectPath(value: FormDataEntryValue | null) {
  if (value === "/ai-ask" || value === "/admin") {
    return value;
  }

  return "/ai-ask";
}
