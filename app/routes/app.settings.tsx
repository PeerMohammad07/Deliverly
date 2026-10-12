import { useEffect, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  data,
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getShopCutoff,
  isValidCutoffMinutes,
  saveShopCutoff,
} from "../services/shopSettings.server";
import { fetchShopTimeZone } from "../services/shopTimeZone.server";
import {
  formatCutoffTime,
  joinCutoffTime,
  splitCutoffMinutes,
} from "../utils/delivery-dates";
import {
  CutoffTimeFields,
  cutoffFieldErrors,
  type CutoffFieldsValue,
} from "../components/settings/cutoff-time-fields";

/** Turning the cutoff on starts at 2:00 PM, a common dispatch cutoff. */
const DEFAULT_CUTOFF: CutoffFieldsValue = {
  hour: "2",
  minute: "00",
  period: "PM",
};

const MIDNIGHT_ERROR =
  "Pick a time after 12:00 AM. A midnight cutoff would never count today.";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const [cutoffMinutes, timeZone] = await Promise.all([
    getShopCutoff(session.shop),
    fetchShopTimeZone(admin),
  ]);
  return { cutoffMinutes, timeZone };
};

interface SettingsActionData {
  ok: boolean;
  error?: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const enabled = formData.get("cutoffEnabled") === "true";
  const period = formData.get("period") === "AM" ? "AM" : "PM";
  const minutes = enabled
    ? joinCutoffTime(
        String(formData.get("hour") ?? ""),
        String(formData.get("minute") ?? ""),
        period,
      )
    : null;

  if (enabled && !isValidCutoffMinutes(minutes)) {
    return data<SettingsActionData>(
      {
        ok: false,
        error: minutes === 0 ? MIDNIGHT_ERROR : "Enter a valid cutoff time.",
      },
      { status: 400 },
    );
  }

  try {
    await saveShopCutoff(session.shop, minutes);
    return data<SettingsActionData>({ ok: true });
  } catch (error) {
    console.error("[app.settings] save failed", { shop: session.shop, error });
    return data<SettingsActionData>(
      { ok: false, error: "Couldn’t save settings. Try again." },
      { status: 500 },
    );
  }
};

function toFields(minutes: number | null): CutoffFieldsValue {
  if (minutes === null) return DEFAULT_CUTOFF;
  const parts = splitCutoffMinutes(minutes);
  return {
    hour: String(parts.hour),
    minute: String(parts.minute).padStart(2, "0"),
    period: parts.period,
  };
}

export default function SettingsPage() {
  const loaderData = useLoaderData<typeof loader>();
  // Remount after each save so the saved values become the new baseline.
  return (
    <SettingsForm
      key={String(loaderData.cutoffMinutes)}
      cutoffMinutes={loaderData.cutoffMinutes}
      timeZone={loaderData.timeZone}
    />
  );
}

function SettingsForm({
  cutoffMinutes,
  timeZone,
}: {
  cutoffMinutes: number | null;
  timeZone: string | null;
}) {
  const shopify = useAppBridge();
  const submit = useSubmit();
  const navigation = useNavigation();
  const actionData = useActionData<SettingsActionData>();
  const isSaving =
    navigation.state !== "idle" &&
    navigation.formMethod?.toLowerCase() === "post";

  const [enabled, setEnabled] = useState(cutoffMinutes !== null);
  const [fields, setFields] = useState(() => toFields(cutoffMinutes));
  const [error, setError] = useState<string>();

  const minutes = enabled
    ? joinCutoffTime(fields.hour, fields.minute, fields.period)
    : null;
  const isDirty = enabled
    ? minutes !== cutoffMinutes ||
      cutoffFieldErrors(fields).hour !== undefined ||
      cutoffFieldErrors(fields).minute !== undefined
    : cutoffMinutes !== null;

  useEffect(() => {
    const action = isDirty
      ? shopify.saveBar.show("settings-save-bar")
      : shopify.saveBar.hide("settings-save-bar");
    action.catch((e) => console.warn("[app.settings] save bar failed", e));
  }, [shopify, isDirty]);

  useEffect(() => {
    return () => {
      shopify.saveBar.hide("settings-save-bar").catch(() => {});
    };
  }, [shopify]);

  const handledAction = useRef<SettingsActionData | undefined>(undefined);
  useEffect(() => {
    if (!actionData || handledAction.current === actionData) return;
    handledAction.current = actionData;
    if (actionData.ok) {
      shopify.toast.show("Settings saved");
    } else {
      setError(actionData.error);
      shopify.toast.show(actionData.error ?? "Couldn’t save settings.", {
        isError: true,
      });
    }
  }, [actionData, shopify]);

  function save() {
    if (isSaving) return;
    const errors = cutoffFieldErrors(fields);
    if (enabled && (errors.hour || errors.minute)) {
      shopify.toast.show("Couldn’t save — check the highlighted fields.", {
        isError: true,
      });
      return;
    }
    if (enabled && minutes === 0) {
      setError(MIDNIGHT_ERROR);
      return;
    }
    const fd = new FormData();
    fd.append("cutoffEnabled", enabled ? "true" : "false");
    fd.append("hour", fields.hour);
    fd.append("minute", fields.minute);
    fd.append("period", fields.period);
    submit(fd, { method: "post" });
  }

  function discard() {
    setEnabled(cutoffMinutes !== null);
    setFields(toFields(cutoffMinutes));
    setError(undefined);
  }

  const zone =
    timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const cutoffLabel =
    minutes !== null && minutes > 0 ? formatCutoffTime(minutes) : null;

  return (
    <>
      <ui-save-bar id="settings-save-bar">
        <button
          variant="primary"
          loading={isSaving ? "" : undefined}
          disabled={isSaving}
          onClick={save}
        ></button>
        <button disabled={isSaving} onClick={discard}></button>
      </ui-save-bar>

      <s-page heading="Settings">
        <s-section heading="Order cutoff">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              The time of day you stop shipping orders the same day. It applies
              to every ETA rule.
            </s-paragraph>
            <s-switch
              label="Use an order cutoff time"
              checked={enabled}
              onChange={(event) => {
                setEnabled(event.currentTarget.checked);
                setError(undefined);
              }}
            />
            {enabled ? (
              <CutoffTimeFields
                value={fields}
                timeZone={zone}
                error={error}
                onChange={(next) => {
                  setFields(next);
                  setError(undefined);
                }}
              />
            ) : null}
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack direction="block" gap="small-200">
                <s-text>
                  <strong>How it works</strong>
                </s-text>
                {enabled && cutoffLabel ? (
                  <s-unordered-list>
                    <s-list-item>
                      Orders placed before {cutoffLabel} on a working day count
                      from that day.
                    </s-list-item>
                    <s-list-item>
                      Orders placed at or after {cutoffLabel} count from the
                      next working day, so their delivery dates move one working
                      day later.
                    </s-list-item>
                    <s-list-item>
                      Each rule can show a countdown to the cutoff in its
                      storefront message, like “Order within 3h 20m to get it
                      between October 14 and October 16”.
                    </s-list-item>
                  </s-unordered-list>
                ) : (
                  <s-paragraph color="subdued">
                    With no cutoff, an order counts from the day it’s placed,
                    whatever the time, and no countdown is shown.
                  </s-paragraph>
                )}
              </s-stack>
            </s-box>
          </s-stack>
        </s-section>
      </s-page>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
