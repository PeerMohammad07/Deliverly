import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useActionData,
  useNavigate,
  useNavigation,
  useSubmit,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  MAX_TARGETS,
  parseRuleFormData,
  validateRuleInput,
  type RuleFormErrors,
  type RuleTypeInput,
} from "../validators/deliveryRule.validator";
import {
  calculateDeliveryRange,
  composeDeliveryMessage,
  composeDeliveryRange,
  DEFAULT_MESSAGE_PARTS,
  deriveWorkingDays,
  formatDeliveryDays,
  formatStorefrontDateWithStyle,
  isStorefrontDateStyle,
  parseExcludedDays,
  type StorefrontDateStyle,
} from "../utils/delivery-dates";
import { DeliveryTimingSections } from "./rule-form/delivery-timing-sections";
import { StorefrontMessageSection } from "./rule-form/storefront-message-section";
import { StorefrontPreview } from "./rule-form/storefront-preview";
import { TargetSelectionSection } from "./rule-form/target-selection-section";

export interface RuleFormActionData {
  errors: RuleFormErrors;
  values: Record<string, string>;
  formError?: string;
}

interface RuleTargetPick {
  id: string;
  title: string;
}

export interface RuleFormInitial {
  name: string;
  type: RuleTypeInput;
  targets: RuleTargetPick[];
  processingDays: string;
  minDeliveryDays: string;
  maxDeliveryDays: string;
  excludedDays: number[];
  msgPrefix: string;
  msgSeparator: string;
  msgSuffix: string;
  dateStyle: StorefrontDateStyle;
  enabled: boolean;
}

interface RuleFormLabels {
  title: string;
  subtitle: string;
}

function getInputValue(e: unknown): string {
  const target = (e as { target?: { value?: unknown } })?.target;
  if (target && typeof target.value === "string") return target.value;
  const current = (e as { currentTarget?: { value?: unknown } })?.currentTarget;
  if (current && typeof current.value === "string") return current.value;
  return "";
}

function toInt(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

/** Single source for the picker cap — matches MAX_TARGETS in validation. */
const MAX_PICKER_TARGETS = MAX_TARGETS;

function initTargets(raw: string | undefined): RuleTargetPick[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => ({ id, title: id }));
}

function initType(raw: string | undefined): RuleTypeInput {
  return raw === "PRODUCT" || raw === "COLLECTION" || raw === "DEFAULT"
    ? raw
    : "DEFAULT";
}

/**
 * Shared rule builder form for create + edit. Visuals are identical on
 * both pages — only the initial values, headings, and the route action
 * (which useSubmit targets implicitly) differ.
 */
export function RuleForm({
  initial,
  labels,
}: {
  initial: RuleFormInitial;
  labels: RuleFormLabels;
}) {
  const actionData = useActionData<RuleFormActionData | undefined>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const submit = useSubmit();
  const shopify = useAppBridge();
  const isSaving =
    navigation.state !== "idle" &&
    navigation.formMethod?.toLowerCase() === "post";
  const isRedirectingAfterSave =
    navigation.state === "loading" &&
    navigation.formMethod?.toLowerCase() === "post";

  const serverValues = actionData?.values;
  // Client-side mirror of server validation (same function, same rules).
  // Catches mistakes instantly with highlights — no spinner flash for
  // fixable errors. The server always re-validates as source of truth.
  const [serverErrors, setServerErrors] = useState<RuleFormErrors>(
    actionData?.errors ?? {},
  );
  const [formError, setFormError] = useState(actionData?.formError);
  const [clientErrors, setClientErrors] = useState<RuleFormErrors>({});
  const errors = useMemo(
    () => ({ ...serverErrors, ...clientErrors }),
    [serverErrors, clientErrors],
  );

  const [name, setName] = useState(serverValues?.name ?? initial.name);
  const [type, setType] = useState<RuleTypeInput>(() =>
    actionData ? initType(serverValues?.type) : initial.type,
  );
  const [selectedTargets, setSelectedTargets] = useState<RuleTargetPick[]>(
    () => (actionData ? initTargets(serverValues?.targetIds) : initial.targets),
  );
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [processingDays, setProcessingDays] = useState(
    serverValues?.processingDays ?? initial.processingDays,
  );
  const [minDays, setMinDays] = useState(
    serverValues?.minDeliveryDays ?? initial.minDeliveryDays,
  );
  const [maxDays, setMaxDays] = useState(
    serverValues?.maxDeliveryDays ?? initial.maxDeliveryDays,
  );
  const [excluded, setExcluded] = useState<number[]>(() =>
    actionData
      ? [...parseExcludedDays(serverValues?.excludedDays ?? "")].sort(
          (a, b) => a - b,
        )
      : initial.excludedDays,
  );
  const [msgPrefix, setMsgPrefix] = useState(
    serverValues?.msgPrefix ?? initial.msgPrefix,
  );
  const [msgSeparator, setMsgSeparator] = useState(
    serverValues?.msgSeparator ?? initial.msgSeparator,
  );
  const [msgSuffix, setMsgSuffix] = useState(
    serverValues?.msgSuffix ?? initial.msgSuffix,
  );
  const [dateStyle, setDateStyle] = useState<StorefrontDateStyle>(() =>
    actionData && isStorefrontDateStyle(serverValues?.dateStyle)
      ? serverValues.dateStyle
      : initial.dateStyle,
  );
  const [enabled, setEnabled] = useState(
    actionData ? serverValues?.enabled !== "false" : initial.enabled,
  );

  const toastedActionData = useRef<RuleFormActionData | undefined>(undefined);
  const lastClientValidationToastAt = useRef(0);

  const initialSnapshot = useRef(
    JSON.stringify({
      name: initial.name,
      type: initial.type,
      targetIds: initial.targets
        .map((t) => t.id)
        .sort()
        .join(","),
      processingDays: initial.processingDays,
      minDays: initial.minDeliveryDays,
      maxDays: initial.maxDeliveryDays,
      excluded: [...initial.excludedDays].sort(),
      msgPrefix: initial.msgPrefix,
      msgSeparator: initial.msgSeparator,
      msgSuffix: initial.msgSuffix,
      dateStyle: initial.dateStyle,
      enabled: initial.enabled,
    }),
  );

  const currentSnapshot = JSON.stringify({
    name,
    type,
    targetIds: selectedTargets
      .map((t) => t.id)
      .sort()
      .join(","),
    processingDays,
    minDays,
    maxDays,
    excluded: [...excluded].sort(),
    msgPrefix,
    msgSeparator,
    msgSuffix,
    dateStyle,
    enabled,
  });
  const isDirty = currentSnapshot !== initialSnapshot.current;
  const showSaveBar = isDirty && !isRedirectingAfterSave;

  useEffect(() => {
    const action = showSaveBar
      ? shopify.saveBar.show("rule-form-save-bar")
      : shopify.saveBar.hide("rule-form-save-bar");
    action.catch((error) => {
      console.warn("[rule-form] save bar update failed", error);
    });
  }, [shopify, showSaveBar]);

  useEffect(() => {
    return () => {
      shopify.saveBar.hide("rule-form-save-bar").catch((error) => {
        console.warn("[rule-form] save bar cleanup failed", error);
      });
    };
  }, [shopify]);

  useEffect(() => {
    setServerErrors(actionData?.errors ?? {});
    setFormError(actionData?.formError);
    if (
      actionData &&
      toastedActionData.current !== actionData &&
      (actionData.formError || Object.keys(actionData.errors).length > 0)
    ) {
      toastedActionData.current = actionData;
      shopify.toast.show(
        actionData.formError ?? "Couldn’t save — check the highlighted fields.",
        { isError: true },
      );
    }
  }, [actionData, shopify]);

  const previewDates = useMemo(() => {
    try {
      const { minDate, maxDate } = calculateDeliveryRange({
        from: new Date(),
        processingDays: Math.max(0, toInt(processingDays, 1)),
        minShippingDays: Math.max(0, toInt(minDays, 3)),
        maxShippingDays: Math.max(0, toInt(maxDays, 5)),
        excludedDays: new Set(excluded),
      });
      return { ok: true as const, minDate, maxDate };
    } catch {
      return { ok: false as const };
    }
  }, [processingDays, minDays, maxDays, excluded]);

  const messageParts = {
    prefix: msgPrefix,
    separator: msgSeparator,
    suffix: msgSuffix,
  };

  const etaMinStr = previewDates.ok
    ? formatStorefrontDateWithStyle(previewDates.minDate, dateStyle)
    : "—";
  const etaMaxStr = previewDates.ok
    ? formatStorefrontDateWithStyle(previewDates.maxDate, dateStyle)
    : "—";
  const etaCore = previewDates.ok
    ? composeDeliveryRange(etaMinStr, msgSeparator, etaMaxStr)
    : "";
  const etaText = previewDates.ok
    ? composeDeliveryMessage(messageParts, etaMinStr, etaMaxStr)
    : "Estimated delivery between —";
  const etaSuffix = msgSuffix.trim();
  const etaSuffixSpace = etaSuffix && !/^[,.;:!?]/.test(etaSuffix) ? " " : "";

  const deliveryDaysLabel = useMemo(
    () => formatDeliveryDays(deriveWorkingDays(excluded)),
    [excluded],
  );

  // Latest rule kind, for discarding stale picker results if the
  // merchant switches type while the picker is open.
  const typeRef = useRef(type);
  typeRef.current = type;

  function toggleDay(day: number) {
    setExcluded((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b),
    );
  }

  function handleTypeChange(next: RuleTypeInput) {
    // Picks are resource-specific — never carry products into a
    // collection rule (or vice versa).
    if (next !== type) setSelectedTargets([]);
    setType(next);
    setPickerError(null);
  }

  function removeTarget(id: string) {
    setSelectedTargets((targets) =>
      targets.filter((target) => target.id !== id),
    );
    setPickerError(null);
  }

  async function openPicker() {
    const resourcePicker = window.shopify?.resourcePicker;
    if (!resourcePicker) {
      setPickerError(
        "The picker isn’t available here. Open this app inside your Shopify admin to browse.",
      );
      return;
    }
    setPickerError(null);
    const requestedKind = typeRef.current;
    try {
      const result = await resourcePicker({
        type: requestedKind === "COLLECTION" ? "collection" : "product",
        multiple: MAX_PICKER_TARGETS,
        selectionIds: selectedTargets.map((t) => t.id),
        action: "select",
      });
      // Merchant switched kind mid-pick: drop the stale result so
      // product IDs can never land in a collection rule (or reverse).
      if (typeRef.current !== requestedKind) return;
      // undefined = merchant cancelled — keep existing picks.
      if (result) {
        setSelectedTargets(
          result
            .filter((r) => typeof r.id === "string" && r.id.length > 0)
            .map((r) => ({
              id: r.id,
              title:
                typeof r.title === "string" && r.title.length > 0
                  ? r.title
                  : r.id,
            })),
        );
      }
    } catch (error) {
      console.error("[rule-form] resource picker failed", error);
      setPickerError("Couldn’t open the picker. Try again.");
    }
  }

  function doSave() {
    // Guard against double-clicks: a second submit would save twice.
    if (navigation.state !== "idle") return;
    const fd = new FormData();
    fd.append("name", name);
    fd.append("type", type);
    fd.append("targetIds", selectedTargets.map((t) => t.id).join(", "));
    fd.append("processingDays", processingDays);
    fd.append("minDeliveryDays", minDays);
    fd.append("maxDeliveryDays", maxDays);
    for (const d of excluded) fd.append("excludedDays", String(d));
    fd.append("msgPrefix", msgPrefix);
    fd.append("msgSeparator", msgSeparator);
    fd.append("msgSuffix", msgSuffix);
    fd.append("dateStyle", dateStyle);
    fd.append("enabled", enabled ? "true" : "false");
    // Instant client check with the exact server rules — fixable mistakes
    // highlight immediately with no spinner flash. The server re-validates
    // as source of truth.
    const checked = validateRuleInput(parseRuleFormData(fd));
    if (!checked.valid) {
      setClientErrors(checked.errors);
      const now = Date.now();
      if (now - lastClientValidationToastAt.current > 750) {
        lastClientValidationToastAt.current = now;
        shopify.toast.show("Couldn’t save — check the highlighted fields.", {
          isError: true,
        });
      }
      return;
    }
    setClientErrors({});
    submit(fd, { method: "post" });
  }

  // Fresh keystrokes clear stale client errors as the merchant fixes them.
  const fieldChangeStarted = useRef(false);
  useEffect(() => {
    if (!fieldChangeStarted.current) {
      fieldChangeStarted.current = true;
      return;
    }
    setClientErrors({});
    setServerErrors({});
    setFormError(undefined);
  }, [
    name,
    type,
    selectedTargets,
    processingDays,
    minDays,
    maxDays,
    excluded,
    msgPrefix,
    msgSeparator,
    msgSuffix,
    dateStyle,
    enabled,
  ]);

  function handleSaveForm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    doSave();
  }

  function handleSaveClick(e: React.MouseEvent) {
    e.preventDefault();
    doSave();
  }

  async function handleBackClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    try {
      await shopify.saveBar.leaveConfirmation();
      void navigate("/app/rules");
    } catch (error) {
      console.debug("[rule-form] navigation cancelled", error);
    }
  }

  function handleResetClick(e: React.MouseEvent) {
    e.preventDefault();
    handleReset();
  }

  function handleReset() {
    setClientErrors({});
    setServerErrors({});
    setFormError(undefined);
    setName(initial.name);
    setType(initial.type);
    setSelectedTargets(initial.targets);
    setPickerError(null);
    setProcessingDays(initial.processingDays);
    setMinDays(initial.minDeliveryDays);
    setMaxDays(initial.maxDeliveryDays);
    setExcluded(initial.excludedDays);
    setMsgPrefix(initial.msgPrefix);
    setMsgSeparator(initial.msgSeparator);
    setMsgSuffix(initial.msgSuffix);
    setDateStyle(initial.dateStyle);
    setEnabled(initial.enabled);
  }

  function resetMessage() {
    setMsgPrefix(DEFAULT_MESSAGE_PARTS.prefix);
    setMsgSeparator(DEFAULT_MESSAGE_PARTS.separator);
    setMsgSuffix(DEFAULT_MESSAGE_PARTS.suffix);
    setDateStyle(DEFAULT_MESSAGE_PARTS.dateStyle);
  }

  const minGreaterThanMax =
    Number.isInteger(Number(minDays)) &&
    Number.isInteger(Number(maxDays)) &&
    Number(minDays) > Number(maxDays);

  return (
    <>
      <ui-save-bar id="rule-form-save-bar">
        {/* variant is an App Bridge save-bar button API prop */}
        <button
          variant="primary"
          aria-label="Save rule"
          disabled={isSaving}
          onClick={handleSaveClick}
        ></button>
        <button
          aria-label="Discard changes"
          disabled={isSaving}
          onClick={handleResetClick}
        ></button>
      </ui-save-bar>

      <form
        onSubmit={handleSaveForm}
        onReset={handleReset}
        aria-busy={isSaving}
      >
        <s-page>
          <s-stack direction="block" gap="base">
            <s-stack direction="block" gap="small-200">
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <Link
                  to="/app/rules"
                  aria-label="Back to ETA rules"
                  onClick={handleBackClick}
                  style={{
                    display: "inline-flex",
                    lineHeight: 0,
                    padding: "8px",
                    margin: "-8px",
                    color: "#5c5f62",
                    textDecoration: "none",
                  }}
                >
                  <s-icon type="arrow-left" size="base" />
                </Link>
                <h1
                  style={{
                    margin: "0",
                    fontSize: "20px",
                    fontWeight: 700,
                    lineHeight: "28px",
                    letterSpacing: "-0.02em",
                    color: "#202223",
                  }}
                >
                  {labels.title}
                </h1>
              </s-stack>
              <s-paragraph color="subdued">{labels.subtitle}</s-paragraph>
            </s-stack>

            {formError ? (
              <s-banner heading="Couldn’t save this rule" tone="critical">
                {formError}
              </s-banner>
            ) : null}

            <s-grid
              gridTemplateColumns="@container (inline-size <= 900px) 1fr, 2fr 1fr"
              gap="base"
              alignItems="start"
            >
              {/* LEFT — form */}
              <s-stack direction="block" gap="base">
                <s-section heading="Rule details">
                  <s-stack direction="block" gap="base">
                    <s-text-field
                      label="Rule name"
                      name="name"
                      placeholder="e.g. Standard US"
                      required
                      maxLength={100}
                      autocomplete="off"
                      value={name}
                      error={errors.name}
                      onInput={(e: unknown) => setName(getInputValue(e))}
                    />
                    <s-switch
                      label="Active"
                      name="enabled"
                      details={
                        enabled
                          ? "Showing on storefront."
                          : "Inactive — hidden from storefront."
                      }
                      checked={enabled}
                      onChange={(e: unknown) => {
                        const t = (e as { target?: { checked?: boolean } })
                          ?.target;
                        if (t && typeof t.checked === "boolean") {
                          setEnabled(t.checked);
                        } else {
                          setEnabled((v) => !v);
                        }
                      }}
                    />
                  </s-stack>
                </s-section>

                <TargetSelectionSection
                  type={type}
                  selectedTargets={selectedTargets}
                  pickerError={pickerError}
                  errors={errors}
                  onTypeChange={(event) =>
                    handleTypeChange(getInputValue(event) as RuleTypeInput)
                  }
                  onOpenPicker={openPicker}
                  onRemoveTarget={removeTarget}
                />

                <DeliveryTimingSections
                  processingDays={processingDays}
                  minDays={minDays}
                  maxDays={maxDays}
                  excluded={excluded}
                  deliveryDaysLabel={deliveryDaysLabel}
                  minGreaterThanMax={minGreaterThanMax}
                  errors={errors}
                  onProcessingDaysInput={(event) =>
                    setProcessingDays(getInputValue(event))
                  }
                  onMinDaysInput={(event) => setMinDays(getInputValue(event))}
                  onMaxDaysInput={(event) => setMaxDays(getInputValue(event))}
                  onToggleDay={toggleDay}
                />

                <StorefrontMessageSection
                  msgPrefix={msgPrefix}
                  msgSeparator={msgSeparator}
                  msgSuffix={msgSuffix}
                  dateStyle={dateStyle}
                  etaText={etaText}
                  errors={errors}
                  onPrefixInput={(event) => setMsgPrefix(getInputValue(event))}
                  onSeparatorInput={(event) =>
                    setMsgSeparator(getInputValue(event))
                  }
                  onSuffixInput={(event) => setMsgSuffix(getInputValue(event))}
                  onDateStyleChange={(event) => {
                    const next = getInputValue(event);
                    setDateStyle(
                      isStorefrontDateStyle(next)
                        ? next
                        : DEFAULT_MESSAGE_PARTS.dateStyle,
                    );
                  }}
                  onReset={resetMessage}
                />
              </s-stack>

              <StorefrontPreview
                previewAvailable={previewDates.ok}
                prefix={msgPrefix}
                etaCore={etaCore}
                suffixSpace={etaSuffixSpace}
                suffix={etaSuffix}
              />
            </s-grid>
          </s-stack>
        </s-page>
      </form>
    </>
  );
}
