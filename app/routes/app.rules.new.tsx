import { boundary } from "@shopify/shopify-app-react-router/server";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { data, redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { createDeliveryRule } from "../services/deliveryRule.service.server";
import {
  parseRuleFormData,
  validateRuleInput,
  type RuleFormErrors,
} from "../validators/deliveryRule.validator";
import { DEFAULT_MESSAGE_PARTS } from "../utils/delivery-dates";
import { actionValues } from "../utils/action-values";
import {
  RuleForm,
  type RuleFormActionData,
  type RuleFormInitial,
} from "../components/rule-form";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

const CREATE_INITIAL: RuleFormInitial = {
  name: "",
  type: "DEFAULT",
  targets: [],
  processingDays: "1",
  minDeliveryDays: "3",
  maxDeliveryDays: "5",
  excludedDays: [0, 6],
  msgPrefix: DEFAULT_MESSAGE_PARTS.prefix,
  msgSeparator: DEFAULT_MESSAGE_PARTS.separator,
  msgSuffix: DEFAULT_MESSAGE_PARTS.suffix,
  dateStyle: DEFAULT_MESSAGE_PARTS.dateStyle,
  enabled: true,
};

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
    return data<RuleFormActionData>(
      { errors: checked.errors, values: actionValues(formData) },
      { status: 400 },
    );
  }

  try {
    await createDeliveryRule(shop, checked.value);
    return redirect("/app/rules?notice=created");
  } catch (error) {
    console.error("[app.rules.new] create failed", { shop, error });
    const fieldErrors =
      (error as { fieldErrors?: RuleFormErrors }).fieldErrors ?? {};
    const validationFailure = Object.keys(fieldErrors).length > 0;
    return data<RuleFormActionData>(
      {
        errors: validationFailure
          ? fieldErrors
          : {},
        formError: validationFailure
          ? undefined
          : "Something went wrong while saving. Try again.",
        values: actionValues(formData),
      },
      { status: validationFailure ? 400 : 500 },
    );
  }
};

export default function NewEtaRulePage() {
  return (
    <RuleForm
      initial={CREATE_INITIAL}
      labels={{
        title: "Create ETA rule",
        subtitle:
          "Set when this rule applies and how delivery dates are calculated.",
      }}
    />
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
