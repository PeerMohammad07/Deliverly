import { useEffect, useMemo, useRef, useState } from "react";
import {
  data,
  Link,
  redirect,
  useActionData,
  useNavigation,
  useSubmit,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { authenticate } from "../shopify.server";
import { createDeliveryRule } from "../services/deliveryRule.service.server";
import {
  parseRuleFormData,
  validateRuleInput,
  MAX_TARGETS,
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
  type StorefrontDateStyle,
} from "../utils/delivery-dates";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

interface ActionResponse {
  errors: RuleFormErrors;
  values: Record<string, string>;
}

const ACTION_VALUE_DEFAULTS: Record<string, string> = {
  name: "",
  type: "DEFAULT",
  targetIds: "",
  processingDays: "",
  minDeliveryDays: "",
  maxDeliveryDays: "",
  msgPrefix: "",
  msgSeparator: "",
  msgSuffix: "",
  dateStyle: "",
  enabled: "true",
};

function actionValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, fallback] of Object.entries(ACTION_VALUE_DEFAULTS)) {
    values[key] = String(formData.get(key) ?? fallback);
  }
  return values;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = (session as { shop?: string })?.shop;
  if (!shop) {
    throw new Response("Unauthorized: missing shop", { status: 401 });
  }

  const formData = await request.formData();
  const parsed = parseRuleFormData(formData);

  const checked = validateRuleInput(parsed);
  if (!checked.valid || !checked.value) {
    return data<ActionResponse>(
      { errors: checked.errors, values: actionValues(formData) },
      { status: 400 },
    );
  }

  try {
    await createDeliveryRule(shop, checked.value);
    return redirect("/app/rules");
  } catch (error) {
    console.error("[app.rules.new] create failed", { shop, error });
    const fieldErrors =
      (error as { fieldErrors?: RuleFormErrors }).fieldErrors ?? {};
    return data<ActionResponse>(
      {
        errors:
          Object.keys(fieldErrors).length > 0
            ? fieldErrors
            : { name: "Couldn’t save this rule. Try again." },
        values: actionValues(formData),
      },
      { status: 400 },
    );
  }
};

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

export default function NewEtaRulePage() {
  const actionData = useActionData<ActionResponse | undefined>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const serverErrors = actionData?.errors ?? {};
  const serverValues = actionData?.values;

  const [name, setName] = useState(serverValues?.name ?? "");
  const [type, setType] = useState<RuleTypeInput>(() =>
    initType(serverValues?.type),
  );
  const [selectedTargets, setSelectedTargets] = useState<PickedTarget[]>(
    () => initTargets(serverValues?.targetIds),
  );
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [processingDays, setProcessingDays] = useState(
    serverValues?.processingDays ?? "1",
  );
  const [minDays, setMinDays] = useState(serverValues?.minDeliveryDays ?? "3");
  const [maxDays, setMaxDays] = useState(serverValues?.maxDeliveryDays ?? "5");
  const [excluded, setExcluded] = useState<number[]>([0, 6]);
  const [msgPrefix, setMsgPrefix] = useState(
    serverValues?.msgPrefix ?? DEFAULT_MESSAGE_PARTS.prefix,
  );
  const [msgSeparator, setMsgSeparator] = useState(
    serverValues?.msgSeparator || DEFAULT_MESSAGE_PARTS.separator,
  );
  const [msgSuffix, setMsgSuffix] = useState(serverValues?.msgSuffix ?? "");
  const [dateStyle, setDateStyle] = useState<StorefrontDateStyle>(
    isStorefrontDateStyle(serverValues?.dateStyle)
      ? serverValues.dateStyle
      : DEFAULT_MESSAGE_PARTS.dateStyle,
  );
  const [enabled, setEnabled] = useState(
    serverValues ? serverValues.enabled !== "false" : true,
  );
  // Real product photo lives at public/preview-chair.png.
  // Falls back to an illustration until the file is added.
  const [imgOk, setImgOk] = useState(true);

  const saveBarRef = useRef<{ show: () => void; hide: () => void } | null>(
    null,
  );

  const initialSnapshot = useRef(
    JSON.stringify({
      name: "",
      type: "DEFAULT",
      targetIds: "",
      processingDays: "1",
      minDays: "3",
      maxDays: "5",
      excluded: [0, 6],
      msgPrefix: DEFAULT_MESSAGE_PARTS.prefix,
      msgSeparator: DEFAULT_MESSAGE_PARTS.separator,
      msgSuffix: "",
      dateStyle: DEFAULT_MESSAGE_PARTS.dateStyle,
      enabled: true,
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

  useEffect(() => {
    const bar = saveBarRef.current;
    if (!bar) return;
    if (isDirty) bar.show();
    else bar.hide();
  }, [isDirty]);

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
    // Guard against double-clicks: a second submit would create
    // a duplicate rule.
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
    submit(fd, { method: "post" });
  }

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
    setName("");
    setType("DEFAULT");
    setSelectedTargets([]);
    setPickerError(null);
    setProcessingDays("1");
    setMinDays("3");
    setMaxDays("5");
    setExcluded([0, 6]);
    setMsgPrefix(DEFAULT_MESSAGE_PARTS.prefix);
    setMsgSeparator(DEFAULT_MESSAGE_PARTS.separator);
    setMsgSuffix(DEFAULT_MESSAGE_PARTS.suffix);
    setDateStyle(DEFAULT_MESSAGE_PARTS.dateStyle);
    setEnabled(true);
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
      <ui-save-bar ref={saveBarRef} id="new-rule-save-bar">
        {/* ui-save-bar expects variant prop on native button at runtime */}
        {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
        {/* @ts-expect-error - App Bridge save-bar button API */}
        <button variant="primary" onClick={handleSaveClick}></button>
        <button onClick={handleResetClick}></button>
      </ui-save-bar>

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
                  Create ETA rule
                </h1>
              </s-stack>
              <s-paragraph color="subdued">
                Set when this rule applies and how delivery dates are
                calculated.
              </s-paragraph>
            </s-stack>

            {Object.keys(serverErrors).length > 0 ? (
              <s-banner tone="critical" heading="There’s a problem">
                <s-paragraph>
                  Check the highlighted fields and try again.
                </s-paragraph>
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
                      error={serverErrors.name}
                      onInput={(e: unknown) => setName(getInputValue(e))}
                    />
                    <s-switch
                      label="Active"
                      name="enabled"
                      details={
                        enabled
                          ? "Showing on storefront."
                          : "Paused — hidden from storefront."
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
                      error={serverErrors.type}
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
                        <s-banner tone="info" heading="Covers everything">
                          <s-paragraph>
                            This default rule applies to all products without a
                            more specific rule. Priority: Product → Collection →
                            Default.
                          </s-paragraph>
                        </s-banner>
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
                              <s-button type="button" onClick={openPicker}>
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
                        {serverErrors.targetIds ? (
                          <s-paragraph tone="critical">
                            {serverErrors.targetIds}
                          </s-paragraph>
                        ) : null}
                      </s-stack>
                    )}
                  </s-stack>
                </s-section>

                <s-section heading="Delivery timing">
                  <s-stack direction="block" gap="base">
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
                        error={serverErrors.processingDays}
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
                        error={serverErrors.minDeliveryDays}
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
                        error={serverErrors.maxDeliveryDays}
                        onInput={(e: unknown) => setMaxDays(getInputValue(e))}
                      />
                    </s-grid>
                    {minGreaterThanMax ? (
                      <s-banner tone="critical" heading="Check your range">
                        <s-paragraph>
                          Max shipping must be the same or later than min.
                        </s-paragraph>
                      </s-banner>
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
                    {serverErrors.excludedDays ? (
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
                      error={serverErrors.msgPrefix}
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
                        error={serverErrors.msgSeparator}
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
                        error={serverErrors.msgSuffix}
                        onInput={(e: unknown) => setMsgSuffix(getInputValue(e))}
                      />
                    </s-grid>
                    <s-select
                      label="Date style"
                      name="dateStyle"
                      details="How the earliest and latest dates look."
                      value={dateStyle}
                      error={serverErrors.dateStyle}
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
                      <div
                        style={{
                          marginTop: "2px",
                          fontSize: "13px",
                          lineHeight: "19px",
                          color: "#6f6f6f",
                        }}
                      >
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

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
