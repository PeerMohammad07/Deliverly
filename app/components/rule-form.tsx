import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useActionData, useNavigation, useSubmit } from "react-router";
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

export interface RuleFormActionData {
  errors: RuleFormErrors;
  values: Record<string, string>;
}

export interface RuleTargetPick {
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

export interface RuleFormLabels {
  title: string;
  subtitle: string;
}

const WEEKDAYS = [
  { value: 0, short: "Sun" },
  { value: 1, short: "Mon" },
  { value: 2, short: "Tue" },
  { value: 3, short: "Wed" },
  { value: 4, short: "Thu" },
  { value: 5, short: "Fri" },
  { value: 6, short: "Sat" },
];

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

interface PickedTarget {
  id: string;
  title: string;
}

/** Single source for the picker cap — matches MAX_TARGETS in validation. */
const MAX_PICKER_TARGETS = MAX_TARGETS;

function initTargets(raw: string | undefined): PickedTarget[] {
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
  const navigation = useNavigation();
  const submit = useSubmit();
  const shopify = useAppBridge();
  const isSaving = navigation.state !== "idle";

  const serverErrors = actionData?.errors ?? {};
  const serverValues = actionData?.values;
  // Client-side mirror of server validation (same function, same rules).
  // Catches mistakes instantly with highlights — no spinner flash for
  // fixable errors. The server always re-validates as source of truth.
  const [clientErrors, setClientErrors] = useState<RuleFormErrors>({});
  const errors = useMemo(
    () => ({ ...serverErrors, ...clientErrors }),
    [serverErrors, clientErrors],
  );

  const [name, setName] = useState(serverValues?.name ?? initial.name);
  const [type, setType] = useState<RuleTypeInput>(() =>
    actionData ? initType(serverValues?.type) : initial.type,
  );
  const [selectedTargets, setSelectedTargets] = useState<PickedTarget[]>(
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
  // Real product photo lives at public/preview-chair.jpg.
  const [imgOk, setImgOk] = useState(true);

  const saveBarRef = useRef<
    (HTMLElement & { show: () => void; hide: () => void }) | null
  >(null);

  const initialSnapshot = useRef(
    JSON.stringify({
      name: initial.name,
      type: initial.type,
      targetIds: initial.targets.map((t) => t.id).join(","),
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
    targetIds: selectedTargets.map((t) => t.id).join(","),
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

  // The bar only ever mounts when there is something to save, so it
  // can never flash on page load. The unmount cleanup is critical:
  // App Bridge keeps a global save bar, and without an explicit hide()
  // it stays stuck open (with dead buttons) after navigating away.
  // Both the element and the global API are hidden — whichever owns
  // the visible bar releases it.
  useEffect(() => {
    const bar = saveBarRef.current;
    bar?.show();
    return () => {
      try {
        bar?.hide();
      } catch {
        // Element already gone — nothing to hide.
      }
      shopify.saveBar
        .hide("rule-form-save-bar")
        .catch(() => undefined);
    };
  }, [isDirty, isSaving, shopify]);

  // Failed saves surface as a native error toast; the fields
  // themselves still carry inline errors. No banner needed.
  useEffect(() => {
    if (actionData && Object.keys(actionData.errors).length > 0) {
      shopify.toast.show("Couldn’t save — check the highlighted fields.", {
        isError: true,
      });
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
    : "Get Estimated delivery —";

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
    } catch {
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
      shopify.toast.show("Couldn’t save — check the highlighted fields.", {
        isError: true,
      });
      return;
    }
    setClientErrors({});
    submit(fd, { method: "post" });
  }

  // Fresh keystrokes clear stale client errors as the merchant fixes them.
  // Server errors persist until the next server response.
  useEffect(() => {
    setClientErrors({});
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

  function handleResetClick(e: React.MouseEvent) {
    e.preventDefault();
    handleReset();
  }

  function handleReset() {
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
      {isDirty || isSaving ? (
        <ui-save-bar ref={saveBarRef} id="rule-form-save-bar">
          {/* variant is an App Bridge save-bar button API prop */}
          <button variant="primary" onClick={handleSaveClick}></button>
          <button onClick={handleResetClick}></button>
        </ui-save-bar>
      ) : null}

      <form onSubmit={handleSaveForm} onReset={handleReset}>
        <s-page>
          <s-stack direction="block" gap="base">
            <s-stack direction="block" gap="small-200">
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <Link
                  to="/app/rules"
                  aria-label="Back to ETA rules"
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

            {isSaving ? (
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-spinner accessibilityLabel="Saving your rule" />
                <s-paragraph color="subdued">
                  Saving your rule…
                </s-paragraph>
              </s-stack>
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

                <s-section heading="Targets">
                  <s-stack direction="block" gap="base">
                    <s-select
                      label="Applies to"
                      name="type"
                      value={type}
                      error={errors.type}
                      onChange={(e: unknown) =>
                        handleTypeChange(getInputValue(e) as RuleTypeInput)
                      }
                    >
                      <s-option value="DEFAULT">All products</s-option>
                      <s-option value="PRODUCT">Specific products</s-option>
                      <s-option value="COLLECTION">
                        Specific collections
                      </s-option>
                    </s-select>
                    {type === "DEFAULT" ? (
                      <s-stack direction="block" gap="small-200">
                        <s-box
                          border="base"
                          borderRadius="base"
                          background="base"
                          padding="small"
                        >
                          <s-stack
                            direction="inline"
                            gap="small-200"
                            alignItems="center"
                            justifyContent="space-between"
                          >
                            <span
                              style={{
                                fontSize: "14px",
                                fontWeight: 600,
                                color: "#202223",
                              }}
                            >
                              All products
                            </span>
                            <s-badge tone="success">Selected</s-badge>
                          </s-stack>
                        </s-box>
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            alignItems: "flex-start",
                          }}
                        >
                          <span
                            style={{
                              flexShrink: 0,
                              display: "inline-flex",
                              paddingTop: "2px",
                            }}
                          >
                            <s-icon type="info" size="small" />
                          </span>
                          <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                            <s-paragraph color="subdued">
                              This default rule applies to all products without
                              a more specific rule. Priority: Product →
                              Collection → Default.
                            </s-paragraph>
                          </span>
                        </div>
                      </s-stack>
                    ) : (
                      <s-stack direction="block" gap="small-200">
                        {selectedTargets.length > 0 ? (
                          <>
                            <s-stack
                              direction="inline"
                              gap="small-200"
                              alignItems="center"
                              justifyContent="space-between"
                            >
                              <s-text type="strong">
                                {selectedTargets.length === 1
                                  ? type === "PRODUCT"
                                    ? "1 product selected"
                                    : "1 collection selected"
                                  : type === "PRODUCT"
                                    ? `${selectedTargets.length} products selected`
                                    : `${selectedTargets.length} collections selected`}
                              </s-text>
                              <s-button
                                type="button"
                                variant="tertiary"
                                onClick={openPicker}
                              >
                                Edit
                              </s-button>
                            </s-stack>
                            <s-unordered-list>
                              {selectedTargets.map((t) => (
                                <s-list-item key={t.id}>
                                  <s-paragraph>{t.title}</s-paragraph>
                                </s-list-item>
                              ))}
                            </s-unordered-list>
                          </>
                        ) : (
                          <>
                            <s-stack direction="inline" gap="small-200">
                              <s-button
                                type="button"
                                variant="secondary"
                                icon={
                                  type === "PRODUCT" ? "product" : "collection"
                                }
                                onClick={openPicker}
                              >
                                {type === "PRODUCT"
                                  ? "Browse products"
                                  : "Browse collections"}
                              </s-button>
                            </s-stack>
                            <s-text type="strong">
                              {type === "PRODUCT"
                                ? "No products selected"
                                : "No collections selected"}
                            </s-text>
                            <s-paragraph color="subdued">
                              {type === "PRODUCT"
                                ? "Choose the products this delivery rule should apply to."
                                : "Choose the collections this delivery rule should apply to."}
                            </s-paragraph>
                          </>
                        )}
                        {pickerError ? (
                          <s-paragraph tone="critical">
                            {pickerError}
                          </s-paragraph>
                        ) : null}
                        {errors.targetIds ? (
                          <s-paragraph tone="critical">
                            {errors.targetIds}
                          </s-paragraph>
                        ) : null}
                      </s-stack>
                    )}
                  </s-stack>
                </s-section>

                <s-section heading="Delivery timing">
                  <s-stack direction="block" gap="base">
                    <s-paragraph color="subdued">
                      Ticked days below are skipped.
                    </s-paragraph>
                    <s-grid
                      gridTemplateColumns="@container (inline-size <= 560px) 1fr, 1fr 1fr 1fr"
                      gap="base"
                    >
                      <s-number-field
                        label="Processing"
                        name="processingDays"
                        suffix="days"
                        min={0}
                        max={30}
                        step={1}
                        inputMode="numeric"
                        details="Prep time."
                        value={processingDays}
                        error={errors.processingDays}
                        onInput={(e: unknown) =>
                          setProcessingDays(getInputValue(e))
                        }
                      />
                      <s-number-field
                        label="Min shipping"
                        name="minDeliveryDays"
                        suffix="days"
                        min={0}
                        max={60}
                        step={1}
                        inputMode="numeric"
                        details="Fastest."
                        value={minDays}
                        error={errors.minDeliveryDays}
                        onInput={(e: unknown) => setMinDays(getInputValue(e))}
                      />
                      <s-number-field
                        label="Max shipping"
                        name="maxDeliveryDays"
                        suffix="days"
                        min={0}
                        max={60}
                        step={1}
                        inputMode="numeric"
                        details="Slowest."
                        value={maxDays}
                        error={errors.maxDeliveryDays}
                        onInput={(e: unknown) => setMaxDays(getInputValue(e))}
                      />
                    </s-grid>
                    {minGreaterThanMax ? (
                      <s-paragraph tone="critical">
                        Max shipping must be the same or later than min.
                      </s-paragraph>
                    ) : null}
                  </s-stack>
                </s-section>

                <s-section heading="Days excluded from delivery">
                  <s-stack direction="block" gap="base">
                    <s-paragraph color="subdued">
                      Tick days you don’t deliver. Estimates skip them
                      automatically.
                    </s-paragraph>
                    <div
                      role="group"
                      aria-label="Days you don't deliver"
                      style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}
                    >
                      {WEEKDAYS.map((d) => {
                        const off = excluded.includes(d.value);
                        return (
                          <button
                            key={d.value}
                            type="button"
                            aria-pressed={off}
                            onClick={() => toggleDay(d.value)}
                            style={{
                              border: off
                                ? "1px solid #1a1a1a"
                                : "1px solid #dfe1e6",
                              borderRadius: "999px",
                              padding: "9px 14px",
                              minWidth: "64px",
                              textAlign: "center",
                              fontSize: "13px",
                              fontWeight: 600,
                              cursor: "pointer",
                              background: off ? "#1a1a1a" : "#ffffff",
                              color: off ? "#ffffff" : "#202223",
                            }}
                          >
                            {off ? `✓ ${d.short}` : d.short}
                          </button>
                        );
                      })}
                    </div>
                    {errors.excludedDays ? (
                      <s-paragraph tone="critical">
                        {serverErrors.excludedDays}
                      </s-paragraph>
                    ) : null}
                    <s-paragraph color="subdued">
                      📅 Delivery days: {deliveryDaysLabel}
                    </s-paragraph>
                  </s-stack>
                </s-section>

                <s-section heading="Storefront message">
                  <s-stack direction="block" gap="base">
                    <s-text-field
                      label="Opening text"
                      name="msgPrefix"
                      details="Shown before the delivery dates."
                      maxLength={120}
                      autocomplete="off"
                      value={msgPrefix}
                      error={errors.msgPrefix}
                      onInput={(e: unknown) => setMsgPrefix(getInputValue(e))}
                    />
                    <s-grid
                      gridTemplateColumns="@container (inline-size <= 560px) 1fr, 1fr 1fr"
                      gap="base"
                    >
                      <s-text-field
                        label="Text between dates"
                        name="msgSeparator"
                        maxLength={10}
                        autocomplete="off"
                        value={msgSeparator}
                        error={errors.msgSeparator}
                        onInput={(e: unknown) =>
                          setMsgSeparator(getInputValue(e))
                        }
                      />
                      <s-text-field
                        label="Closing text (optional)"
                        name="msgSuffix"
                        maxLength={200}
                        autocomplete="off"
                        value={msgSuffix}
                        error={errors.msgSuffix}
                        onInput={(e: unknown) => setMsgSuffix(getInputValue(e))}
                      />
                    </s-grid>
                    <s-select
                      label="Date style"
                      name="dateStyle"
                      details="How the earliest and latest dates look."
                      value={dateStyle}
                      error={errors.dateStyle}
                      onChange={(e: unknown) => {
                        const next = getInputValue(e);
                        setDateStyle(
                          isStorefrontDateStyle(next)
                            ? next
                            : DEFAULT_MESSAGE_PARTS.dateStyle,
                        );
                      }}
                    >
                      <s-option value="ordinal">Sept 17th</s-option>
                      <s-option value="short">Sep 17</s-option>
                      <s-option value="weekday">Fri, Sep 17</s-option>
                    </s-select>
                    <s-box
                      background="subdued"
                      border="base"
                      borderRadius="base"
                      padding="small"
                    >
                      <s-stack direction="block" gap="small-100">
                        <s-paragraph color="subdued">Preview</s-paragraph>
                        <s-text type="strong">{etaText}</s-text>
                      </s-stack>
                    </s-box>
                    <s-stack direction="inline" gap="small-200">
                      <s-button
                        type="button"
                        variant="tertiary"
                        icon="reset"
                        onClick={resetMessage}
                      >
                        Reset
                      </s-button>
                    </s-stack>
                  </s-stack>
                </s-section>
              </s-stack>

              {/* RIGHT — live preview */}
              <div style={{ position: "sticky", top: "16px" }}>
                <s-stack direction="block" gap="base">
                  {/* Storefront mock — matches product-page design */}
                  <div
                    style={{
                      background: "#ffffff",
                      border: "1px solid #e7e5e4",
                      borderRadius: "18px",
                      overflow: "hidden",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                    }}
                  >
                    <div
                      style={{
                        padding: "14px 18px 12px",
                        borderBottom: "1px solid #edebe8",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "17px",
                          fontWeight: 600,
                          lineHeight: "24px",
                          color: "#1a1a1a",
                        }}
                      >
                        Preview
                      </div>
                    </div>

                    <div style={{ padding: "18px" }}>
                      <div
                        style={{
                          position: "relative",
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          background: "#ffffff",
                        }}
                      >
                        {imgOk ? (
                          <img
                            src="/preview-chair.jpg"
                            alt="Example product"
                            style={{
                              width: "100%",
                              height: "120px",
                              objectFit: "contain",
                              display: "block",
                            }}
                            onError={() => setImgOk(false)}
                          />
                        ) : (
                          <svg
                            width="110"
                            height="110"
                            viewBox="0 0 150 150"
                            fill="none"
                            aria-hidden="true"
                          >
                            <rect
                              x="30"
                              y="52"
                              width="20"
                              height="36"
                              rx="10"
                              fill="#b4bac5"
                            />
                            <rect
                              x="100"
                              y="52"
                              width="20"
                              height="36"
                              rx="10"
                              fill="#b4bac5"
                            />
                            <rect
                              x="46"
                              y="16"
                              width="58"
                              height="54"
                              rx="15"
                              fill="#c6ccd5"
                            />
                            <rect
                              x="55"
                              y="26"
                              width="40"
                              height="32"
                              rx="10"
                              fill="#d4d9e1"
                            />
                            <rect
                              x="46"
                              y="66"
                              width="58"
                              height="16"
                              rx="8"
                              fill="#d8dce3"
                            />
                            <g
                              stroke="#c69a63"
                              strokeWidth="5"
                              strokeLinecap="round"
                            >
                              <line x1="56" y1="82" x2="48" y2="128" />
                              <line x1="68" y1="82" x2="65" y2="128" />
                              <line x1="82" y1="82" x2="85" y2="128" />
                              <line x1="94" y1="82" x2="102" y2="128" />
                            </g>
                          </svg>
                        )}
                        <span
                          style={{
                            position: "absolute",
                            top: "0",
                            right: "0",
                            background: "#f1f1f3",
                            borderRadius: "8px",
                            padding: "6px 10px",
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "#1a1a1a",
                          }}
                        >
                          15% off
                        </span>
                      </div>

                      <div
                        style={{
                          marginTop: "14px",
                          border: "1px solid #e3e1de",
                          borderRadius: "12px",
                          padding: "10px",
                          textAlign: "center",
                          fontSize: "14px",
                          fontWeight: 500,
                          color: "#1a1a1a",
                          background: "#ffffff",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                        }}
                      >
                        Add To Cart
                      </div>

                      <div
                        style={{
                          marginTop: "10px",
                          border: "2px solid #111111",
                          padding: "14px 16px",
                          fontSize: "17px",
                          lineHeight: "26px",
                          fontWeight: 500,
                          letterSpacing: "-0.01em",
                          color: "#111111",
                          background: "#ffffff",
                        }}
                      >
                        {previewDates.ok ? (
                          <>
                            {msgPrefix.trim() ? `${msgPrefix.trim()} ` : ""}
                            <span style={{ fontWeight: 700 }}>{etaCore}</span>
                            {msgSuffix.trim() ? ` ${msgSuffix.trim()}` : ""}
                          </>
                        ) : (
                          "Get Estimated delivery —"
                        )}
                      </div>
                    </div>
                  </div>

                  <s-section heading="Tips">
                    <s-stack direction="block" gap="small-200">
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          alignItems: "flex-start",
                        }}
                      >
                        <span
                          style={{
                            flexShrink: 0,
                            display: "inline-flex",
                            paddingTop: "2px",
                          }}
                        >
                          <s-icon type="lightbulb" size="small" />
                        </span>
                        <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                          <s-paragraph color="subdued">
                            Keep ranges tight (3–5 days) to build trust.
                          </s-paragraph>
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          alignItems: "flex-start",
                        }}
                      >
                        <span
                          style={{
                            flexShrink: 0,
                            display: "inline-flex",
                            paddingTop: "2px",
                          }}
                        >
                          <s-icon type="lightbulb" size="small" />
                        </span>
                        <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                          <s-paragraph color="subdued">
                            Use Default for everything, Product for express
                            items.
                          </s-paragraph>
                        </span>
                      </div>
                    </s-stack>
                  </s-section>
                </s-stack>
              </div>
            </s-grid>
          </s-stack>
        </s-page>
      </form>
    </>
  );
}
