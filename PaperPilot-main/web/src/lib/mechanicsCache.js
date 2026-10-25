/** Persist saved format mechanics so refresh does not flash an empty Saved list. */

function storageKey(uid) {
  return `paperpilot.mechanics.${uid || "anon"}`;
}

function slimItem(item) {
  if (!item || typeof item !== "object" || !item.id) return null;
  return {
    id: String(item.id),
    name: item.name || "",
    source_filename: item.source_filename || "",
    file_type: item.file_type || "",
    rules: item.rules && typeof item.rules === "object" ? item.rules : {},
    ignored_fields: Array.isArray(item.ignored_fields) ? item.ignored_fields : undefined,
    created_at: item.created_at || "",
  };
}

export function loadCachedMechanics(uid) {
  if (!uid) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(uid)) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map(slimItem).filter(Boolean);
  } catch {
    return [];
  }
}

export function saveCachedMechanics(items, uid) {
  if (!uid) return false;
  try {
    const next = (Array.isArray(items) ? items : []).map(slimItem).filter(Boolean);
    localStorage.setItem(storageKey(uid), JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}
