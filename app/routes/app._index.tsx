import { useCallback, useEffect, useState, type CSSProperties } from "react";
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

const SECTION_HEADING: CSSProperties = {
  margin: "0",
  fontSize: "15px",
  fontWeight: 650,
  lineHeight: "22px",
  color: "#202223",
};

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
      appEmbed: {
        enabled: await readAppEmbedEnabled(admin, shop),
        editorUrl: buildThemeEditorUrl(shop, process.env.SHOPIFY_API_KEY ?? ""),
        manageUrl: buildThemeEditorUrl(shop, ""),
      },
    };
  } catch (error) {
    console.error("[app.dashboard] loader failed", { shop, error });
    throw new Response("Failed to load dashboard", { status: 500 });
  }
};

export default function Dashboard() {
  const { stats, recent, appEmbed } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [embedEnabled, setEmbedEnabled] = useState(appEmbed.enabled);
  const [activeAppBlocks, setActiveAppBlocks] = useState(0);
  const [checking, setChecking] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(appEmbed.enabled ? 3 : 1);

  const checkThemeExtensionStatus = useCallback(
    async (showLoading = false) => {
      if (showLoading) setChecking(true);
      try {
        const extensions = await shopify.app.extensions();
        let embedActive = false;
        let blockCount = 0;

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
            if (activation.target === "section") {
              blockCount += activation.activations.length;
            }
          }
        }

        setEmbedEnabled(embedActive);
        setActiveAppBlocks(blockCount);
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
        {!hidden ? (
          <s-box
            border="base"
            borderRadius="base"
            background="base"
            padding="base"
          >
            <s-stack direction="block" gap="small-200">
              <s-stack
                direction="inline"
                alignItems="center"
                justifyContent="space-between"
                gap="small-200"
              >
                <h2
                  style={{
                    ...SECTION_HEADING,
                    fontSize: "16px",
                    lineHeight: "24px",
                  }}
                >
                  Setup guide
                </h2>
                <s-stack direction="inline" gap="small-100" alignItems="center">
                  <s-button
                    commandFor="setup-menu"
                    variant="tertiary"
                    tone="neutral"
                    icon="menu-horizontal"
                    accessibilityLabel="More actions"
                  />
                  <s-menu
                    id="setup-menu"
                    accessibilityLabel="Setup guide actions"
                  >
                    <s-button
                      variant="tertiary"
                      onClick={() => setHidden(true)}
                    >
                      Dismiss
                    </s-button>
                  </s-menu>
                  <s-button
                    variant="tertiary"
                    tone="neutral"
                    icon={open ? "chevron-up" : "chevron-down"}
                    accessibilityLabel="Toggle setup guide"
                    onClick={() => setOpen(!open)}
                  />
                </s-stack>
              </s-stack>
              <s-stack direction="block" gap="small-100">
                <s-paragraph color="subdued">
                  Get started with the app in just a few simple steps!
                </s-paragraph>
                <s-badge>
                  {embedEnabled ? "3 / 3 completed" : "2 / 3 completed"}
                </s-badge>
              </s-stack>
              {open ? (
                <s-stack direction="block" gap="none">
                  <s-box
                    padding={step === 1 ? "small" : "small-200"}
                    borderRadius="base"
                    background={step === 1 ? "subdued" : undefined}
                  >
                    <s-stack direction="block" gap="small-200">
                      <s-clickable onClick={() => setStep(1)}>
                        <s-stack
                          direction="inline"
                          gap="small-200"
                          alignItems="center"
                        >
                          {embedEnabled ? (
                            <s-icon type="check-circle-filled" />
                          ) : (
                            <s-icon type="circle-dashed" />
                          )}
                          <s-heading>Enable theme app embed block</s-heading>
                        </s-stack>
                      </s-clickable>
                      {step === 1 ? (
                        embedEnabled ? (
                          <s-stack direction="block" gap="small-200">
                            <s-paragraph color="subdued">
                              The Deliverly ETA app embed is enabled on your
                              published theme.
                            </s-paragraph>
                            <s-button
                              variant="secondary"
                              href={appEmbed.editorUrl ?? undefined}
                              target="_blank"
                            >
                              Open theme editor
                            </s-button>
                          </s-stack>
                        ) : (
                          <s-stack direction="block" gap="small-200">
                            <s-paragraph color="subdued">
                              To start using the app, please enable app
                              embedding by following the steps below.
                            </s-paragraph>
                            <s-unordered-list>
                              <s-list-item>
                                <s-text color="subdued">
                                  Click &quot;Enable embed app&quot; below.
                                </s-text>
                              </s-list-item>
                              <s-list-item>
                                <s-text color="subdued">
                                  Find and enable &quot;Estimated Delivery
                                  Date&quot; in the theme customizer.
                                </s-text>
                              </s-list-item>
                              <s-list-item>
                                <s-text color="subdued">
                                  Click &quot;Save&quot; and reload this page.
                                </s-text>
                              </s-list-item>
                            </s-unordered-list>
                            <s-stack
                              direction="inline"
                              gap="small-200"
                              alignItems="center"
                            >
                              <s-button
                                variant="secondary"
                                href={appEmbed.editorUrl ?? undefined}
                                target="_blank"
                              >
                                Enable embed app
                              </s-button>
                              <s-button
                                variant="tertiary"
                                onClick={() =>
                                  void checkThemeExtensionStatus(true)
                                }
                                loading={checking}
                              >
                                Check status
                              </s-button>
                            </s-stack>
                          </s-stack>
                        )
                      ) : null}
                    </s-stack>
                  </s-box>
                  <s-box
                    padding={step === 2 ? "small" : "small-200"}
                    borderRadius="base"
                    background={step === 2 ? "subdued" : undefined}
                  >
                    <s-stack direction="block" gap="small-200">
                      <s-clickable onClick={() => setStep(2)}>
                        <s-stack
                          direction="inline"
                          gap="small-200"
                          alignItems="center"
                        >
                          <s-icon type="check-circle-filled" />
                          <s-heading>Activate app</s-heading>
                        </s-stack>
                      </s-clickable>
                      {step === 2 ? (
                        <s-stack direction="block" gap="small-200">
                          <s-paragraph color="subdued">
                            Activate the app functionality by clicking the
                            &quot;Enable&quot; button below for your store.
                          </s-paragraph>
                          <s-button variant="secondary" disabled>
                            Enable
                          </s-button>
                        </s-stack>
                      ) : null}
                    </s-stack>
                  </s-box>
                  <s-box
                    padding={step === 3 ? "small" : "small-200"}
                    borderRadius="base"
                    background={step === 3 ? "subdued" : undefined}
                  >
                    <s-stack direction="block" gap="small-200">
                      <s-clickable onClick={() => setStep(3)}>
                        <s-stack
                          direction="inline"
                          gap="small-200"
                          alignItems="center"
                        >
                          <s-icon type="check-circle-filled" />
                          <s-heading>Confirm ETA Display</s-heading>
                        </s-stack>
                      </s-clickable>
                      {step === 3 ? (
                        <s-stack direction="block" gap="small-200">
                          <s-paragraph color="subdued">
                            Confirm your store to ensure the estimated delivery
                            date is displaying correctly as expected. Get in
                            touch if you need any tweaks.
                          </s-paragraph>
                          <s-button-group>
                            <s-button slot="primary-action" variant="primary">
                              Yay, Its working 😁
                            </s-button>
                            <s-button
                              slot="secondary-actions"
                              variant="secondary"
                            >
                              Contact support
                            </s-button>
                          </s-button-group>
                        </s-stack>
                      ) : null}
                    </s-stack>
                  </s-box>
                </s-stack>
              ) : null}
            </s-stack>
          </s-box>
        ) : null}

        <s-stack direction="block" gap="small-200">
          <s-heading>Overview</s-heading>
          <s-grid
            gridTemplateColumns="@container (inline-size <= 600px) 1fr, 1fr 1fr 1fr"
            gap="base"
          >
            <s-section padding="base">
              <s-stack direction="block" gap="small-100">
                <s-heading>{stats.total}</s-heading>
                <s-paragraph color="subdued">Total rules</s-paragraph>
              </s-stack>
            </s-section>
            <s-section padding="base">
              <s-stack direction="block" gap="small-100">
                <s-heading>{stats.active}</s-heading>
                <s-paragraph color="subdued">Active rules</s-paragraph>
              </s-stack>
            </s-section>
            <s-section padding="base">
              <s-stack direction="block" gap="small-100">
                <s-heading>{targetedRules}</s-heading>
                <s-paragraph color="subdued">Targeted rules</s-paragraph>
              </s-stack>
            </s-section>
          </s-grid>
        </s-stack>

        <s-stack direction="block" gap="small-200">
          <s-stack
            direction="inline"
            alignItems="center"
            justifyContent="space-between"
            gap="base"
          >
            <s-heading>Recent rules</s-heading>
            <s-button
              variant="secondary"
              onClick={() => navigate("/app/rules")}
              loading={loadingRules}
            >
              View all rules
            </s-button>
          </s-stack>
          <s-box
            border="base"
            borderRadius="base"
            background="base"
            overflow="hidden"
          >
            {recent.length > 0 ? (
              <s-table variant="auto" loading={loadingRules}>
                <s-table-header-row>
                  <s-table-header listSlot="primary">Rule</s-table-header>
                  <s-table-header listSlot="labeled">Applies to</s-table-header>
                  <s-table-header listSlot="labeled">
                    Delivery time
                  </s-table-header>
                  <s-table-header listSlot="inline">Status</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {recent.map((rule) => (
                    <s-table-row key={rule.id}>
                      <s-table-cell>
                        <s-stack direction="block" gap="none">
                          <s-text type="strong">{rule.name}</s-text>
                          <s-paragraph color="subdued">{rule.kind}</s-paragraph>
                        </s-stack>
                      </s-table-cell>
                      <s-table-cell>
                        <s-paragraph>{rule.targets}</s-paragraph>
                      </s-table-cell>
                      <s-table-cell>
                        <s-text type="strong">{rule.eta}</s-text>
                      </s-table-cell>
                      <s-table-cell>
                        <s-badge
                          tone={rule.enabled ? "success" : undefined}
                          color="base"
                        >
                          {rule.enabled ? "Active" : "Inactive"}
                        </s-badge>
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            ) : (
              <s-box padding="large">
                <s-stack direction="block" gap="small-200" alignItems="center">
                  <s-paragraph color="subdued">
                    No delivery rules yet.
                  </s-paragraph>
                  <s-button variant="primary" href="/app/rules/new">
                    Create rule
                  </s-button>
                </s-stack>
              </s-box>
            )}
          </s-box>
        </s-stack>

        <s-stack direction="block" gap="small-200">
          <s-heading>Storefront display</s-heading>
          <s-box
            padding="base"
            background="base"
            border="base"
            borderRadius="base"
          >
            <s-grid
              gridTemplateColumns="@container (inline-size <= 600px) 1fr, 1fr 1fr"
              gap="base"
            >
              <s-box
                padding="base"
                border="base"
                borderStyle="dashed"
                borderRadius="base"
              >
                <s-grid
                  gridTemplateColumns="1fr auto"
                  gap="base"
                  alignItems="center"
                >
                  <s-stack direction="block" gap="small-100">
                    <s-stack
                      direction="inline"
                      gap="small-200"
                      alignItems="center"
                    >
                      <s-heading>App embed</s-heading>
                      <s-badge
                        tone={embedEnabled ? "success" : "warning"}
                        color="base"
                      >
                        {embedEnabled ? "Active" : "Inactive"}
                      </s-badge>
                    </s-stack>
                    <s-paragraph color="subdued">
                      Enable the app embed to display ETA automatically.
                    </s-paragraph>
                  </s-stack>
                  <s-button
                    variant="secondary"
                    href={
                      embedEnabled
                        ? (appEmbed.manageUrl ?? undefined)
                        : (appEmbed.editorUrl ?? undefined)
                    }
                    target="_blank"
                  >
                    {embedEnabled ? "Manage" : "Activate"}
                  </s-button>
                </s-grid>
              </s-box>
              <s-box
                padding="base"
                border="base"
                borderStyle="dashed"
                borderRadius="base"
              >
                <s-grid
                  gridTemplateColumns="1fr auto"
                  gap="base"
                  alignItems="center"
                >
                  <s-stack direction="block" gap="small-100">
                    <s-stack
                      direction="inline"
                      gap="small-200"
                      alignItems="center"
                    >
                      <s-heading>App blocks</s-heading>
                      <s-badge
                        tone={activeAppBlocks > 0 ? "success" : "warning"}
                        color="base"
                      >
                        {activeAppBlocks > 0 ? "Active" : "Inactive"}
                      </s-badge>
                    </s-stack>
                    <s-paragraph color="subdued">
                      {activeAppBlocks} active · Place ETA on product pages.
                    </s-paragraph>
                  </s-stack>
                  <s-button
                    variant="secondary"
                    href={appEmbed.manageUrl ?? undefined}
                    target="_blank"
                  >
                    Manage
                  </s-button>
                </s-grid>
              </s-box>
            </s-grid>
          </s-box>
        </s-stack>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
