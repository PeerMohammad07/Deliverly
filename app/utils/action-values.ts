/**
 * Shared form-value echo for rule create/update actions.
 * Returns submitted values so the form can rehydrate after a failed save.
 * Excluded days ride along as a comma string (checkboxes append per value).
 */

const ACTION_VALUE_DEFAULTS: Record<string, string> = {
  name: "",
  type: "DEFAULT",
  targetIds: "",
  processingDays: "",
  minDeliveryDays: "",
  maxDeliveryDays: "",
  excludedDays: "",
  msgPrefix: "",
  msgSeparator: "",
  msgSuffix: "",
  dateStyle: "",
  enabled: "true",
};

export function actionValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, fallback] of Object.entries(ACTION_VALUE_DEFAULTS)) {
    values[key] = String(formData.get(key) ?? fallback);
  }
  values.excludedDays = formData.getAll("excludedDays").map(String).join(",");
  return values;
}
