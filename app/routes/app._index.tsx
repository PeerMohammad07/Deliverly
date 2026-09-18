import { useCallback, useEffect, useState } from "react";
import { useLoaderData, useNavigate, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import {
  getRulesForShop,
  isValidShopDomain,
  toDisplayRule,
} from "../services/deliveryRule.service.server";
import {
  buildThemeEditorUrl,
  getAppEmbedStatus,
} from "../services/appEmbedStatus.service.server";
import { OverviewCards } from "../components/dashboard/overview-cards";
import { RecentRules } from "../components/dashboard/recent-rules";
import { SetupGuide } from "../components/dashboard/setup-guide";
import { StorefrontDisplay } from "../components/dashboard/storefront-display";

function setupEtaKey(shop: string) {
  return `deliverly.setup.etaConfirmed.${shop}`;
}

function readSetupEtaConfirmed(shop: string) {
  try {
    return window.localStorage.getItem(setupEtaKey(shop)) === "1";
  } catch (error) {
    console.error("[app.dashboard] setup progress read failed", error);
    return false;
  }
}

function writeSetupEtaConfirmed(shop: string) {
  try {
    window.localStorage.setItem(setupEtaKey(shop), "1");
  } catch (error) {
    console.error("[app.dashboard] setup progress write failed", error);
  }
}

function firstIncompleteStep(
  embedEnabled: boolean,
  hasRule: boolean,
  etaConfirmed: boolean,
) {
  if (!embedEnabled) return 1;
  if (!hasRule) return 2;
  if (!etaConfirmed) return 3;
  return 3;
}

/**
 * App-embed status for the setup guide. Never throws: any failure
 * resolves to disabled (fail closed) so the dashboard always renders
 * and never claims "enabled" it couldn't verify.
 */
async function readAppEmbedEnabled(
  admin: Parameters<typeof getAppEmbedStatus>[0]["admin"],
  shop: string,
): Promise<boolean> {
  try {
    return await getAppEmbedStatus({
      shop,
      admin,
      apiKey: process.env.SHOPIFY_API_KEY ?? "",
      appHandle: process.env.SHOPIFY_APP_HANDLE,
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[app.dashboard] app embed status failed", {
      shop,
      error,
    });
    return false;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = (session as { shop?: string })?.shop;
  if (!shop || !isValidShopDomain(shop)) {
    throw new Response("Unauthorized: missing shop", { status: 401 });
  }

  try {
    const rules = await getRulesForShop(shop);
    const recent = rules.slice(0, 3).map((rule) => {
      const display = toDisplayRule(rule);
      return {
        id: display.id,
        name: display.name,
        kind: display.displayTypeLabel,
        targets: display.displayTargets,
        eta: display.displayEta,
        enabled: display.enabled,
      };
    });
    return {
      stats: {
        total: rules.length,
        active: rules.filter((r) => r.enabled).length,
        product: rules.filter((r) => r.type === "PRODUCT").length,
        collection: rules.filter((r) => r.type === "COLLECTION").length,
      },
      recent,
      shop,
      appEmbed: {
        enabled: await readAppEmbedEnabled(admin, shop),
        editorUrl: buildThemeEditorUrl(shop, process.env.SHOPIFY_API_KEY ?? ""),
        manageUrl: buildThemeEditorUrl(shop, ""),
      },
    };
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[app.dashboard] loader failed", { shop, error });
    throw new Response("Failed to load dashboard", { status: 500 });
  }
};

export default function Dashboard() {
  const { stats, recent, shop, appEmbed } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const hasRule = stats.total > 0;
  const [embedEnabled, setEmbedEnabled] = useState(appEmbed.enabled);
  const [etaConfirmed, setEtaConfirmed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(
    firstIncompleteStep(appEmbed.enabled, hasRule, false),
  );

  const checkThemeExtensionStatus = useCallback(
    async (showLoading = false) => {
      if (showLoading) setChecking(true);
      try {
        const extensions = await shopify.app.extensions();
        let embedActive = false;

        for (const extension of extensions) {
          if (extension.type !== "theme_app_extension") continue;
          for (const activation of extension.activations) {
            if (
              !("handle" in activation) ||
              !("status" in activation) ||
              !("activations" in activation) ||
              activation.status !== "active" ||
              !Array.isArray(activation.activations)
            ) {
              continue;
            }
            if (
              activation.handle === "app-embed" &&
              activation.target === "body" &&
              activation.activations.length > 0
            ) {
              embedActive = true;
            }
          }
        }

        setEmbedEnabled(embedActive);
      } catch (error) {
        console.error("[app.dashboard] theme extension status failed", error);
      } finally {
        if (showLoading) setChecking(false);
      }
    },
    [shopify],
  );

  useEffect(() => {
    void checkThemeExtensionStatus();
    const refreshStatus = () => void checkThemeExtensionStatus();
    window.addEventListener("focus", refreshStatus);
    return () => window.removeEventListener("focus", refreshStatus);
  }, [checkThemeExtensionStatus]);

  useEffect(() => {
    const confirmed = readSetupEtaConfirmed(shop);
    setEtaConfirmed(confirmed);
    setStep(firstIncompleteStep(appEmbed.enabled, hasRule, confirmed));
    if (confirmed) setOpen(false);
  }, [shop, appEmbed.enabled, hasRule]);

  const completedSteps =
    Number(embedEnabled) + Number(hasRule) + Number(etaConfirmed);
  const targetedRules = stats.product + stats.collection;
  const loadingRules =
    navigation.state !== "idle" &&
    navigation.location?.pathname.startsWith("/app/rules");

  return (
    <s-page>
      <s-stack direction="block" gap="base">
        <s-stack direction="block" gap="small-200">
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
            Dashboard
          </h1>
          <s-paragraph color="subdued">
            Get a quick overview of your delivery estimates and storefront
            setup.
          </s-paragraph>
        </s-stack>
        <SetupGuide
          hidden={hidden}
          open={open}
          step={step}
          completedSteps={completedSteps}
          embedEnabled={embedEnabled}
          hasRule={hasRule}
          etaConfirmed={etaConfirmed}
          checking={checking}
          editorUrl={appEmbed.editorUrl}
          onDismiss={() => setHidden(true)}
          onToggleOpen={() => setOpen(!open)}
          onStepChange={setStep}
          onCheckStatus={() => void checkThemeExtensionStatus(true)}
          onViewRules={() => navigate("/app/rules")}
          onConfirmEta={() => {
            writeSetupEtaConfirmed(shop);
            setEtaConfirmed(true);
            setOpen(false);
          }}
        />

        <OverviewCards
          totalRules={stats.total}
          activeRules={stats.active}
          targetedRules={targetedRules}
        />

        <RecentRules
          rules={recent}
          loading={loadingRules}
          onViewAll={() => navigate("/app/rules")}
        />

        <StorefrontDisplay
          embedEnabled={embedEnabled}
          editorUrl={appEmbed.editorUrl}
          manageUrl={appEmbed.manageUrl}
        />
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
