import type { ReactNode } from "react";
import styles from "./dashboard.module.css";

const TOTAL_STEPS = 3;

interface SetupGuideProps {
  hidden: boolean;
  open: boolean;
  step: number;
  completedSteps: number;
  embedEnabled: boolean;
  hasRule: boolean;
  etaConfirmed: boolean;
  checking: boolean;
  editorUrl: string | null;
  onDismiss: () => void;
  onToggleOpen: () => void;
  onStepChange: (step: number) => void;
  onCheckStatus: () => void;
  onViewRules: () => void;
  onConfirmEta: () => void;
}

function ProgressBar({
  completed,
  compact = false,
}: {
  completed: number;
  compact?: boolean;
}) {
  const percent = Math.round((completed / TOTAL_STEPS) * 100);
  return (
    <div
      className={`${styles.progressTrack} ${compact ? styles.progressTrackCompact : ""}`}
      role="progressbar"
      aria-label="Setup progress"
      aria-valuemin={0}
      aria-valuemax={TOTAL_STEPS}
      aria-valuenow={completed}
    >
      <div className={styles.progressFill} style={{ width: `${percent}%` }} />
    </div>
  );
}

function HeaderActions({
  open,
  onDismiss,
  onToggleOpen,
}: Pick<SetupGuideProps, "open" | "onDismiss" | "onToggleOpen">) {
  return (
    <s-stack direction="inline" gap="small-100" alignItems="center">
      <s-button
        commandFor="setup-menu"
        variant="tertiary"
        tone="neutral"
        icon="menu-horizontal"
        accessibilityLabel="Setup guide actions"
      />
      <s-menu id="setup-menu" accessibilityLabel="Setup guide actions">
        <s-button variant="tertiary" onClick={onDismiss}>
          Dismiss
        </s-button>
      </s-menu>
      <s-button
        variant="tertiary"
        tone="neutral"
        icon={open ? "chevron-up" : "chevron-down"}
        accessibilityLabel={
          open ? "Collapse setup guide" : "Expand setup guide"
        }
        onClick={onToggleOpen}
      />
    </s-stack>
  );
}

function Step({
  index,
  title,
  done,
  active,
  onSelect,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  active: boolean;
  onSelect: (step: number) => void;
  children: ReactNode;
}) {
  return (
    <s-box
      padding="small"
      borderRadius="base"
      background={active ? "subdued" : undefined}
    >
      {/* Icon column + content column keeps the body aligned under the title. */}
      <div className={styles.stepRow}>
        <s-icon type={done ? "check-circle-filled" : "circle-dashed"} />
        <s-stack direction="block" gap="small-200">
          <s-clickable
            onClick={() => onSelect(index)}
            accessibilityLabel={`${title}${done ? " (complete)" : ""}`}
          >
            <s-text>
              <span className={styles.strong}>{title}</span>
            </s-text>
          </s-clickable>
          {active ? children : null}
        </s-stack>
      </div>
    </s-box>
  );
}

export function SetupGuide({
  hidden,
  open,
  step,
  completedSteps,
  embedEnabled,
  hasRule,
  etaConfirmed,
  checking,
  editorUrl,
  onDismiss,
  onToggleOpen,
  onStepChange,
  onCheckStatus,
  onViewRules,
  onConfirmEta,
}: SetupGuideProps) {
  if (hidden) return null;

  const complete = completedSteps >= TOTAL_STEPS;

  const steps = (
    <s-stack direction="block" gap="none">
      <Step
        index={1}
        title="Turn on the app embed"
        done={embedEnabled}
        active={step === 1}
        onSelect={onStepChange}
      >
        {embedEnabled ? (
          <>
            <s-paragraph>
              The app embed is on in your published theme.
            </s-paragraph>
            <s-stack direction="inline">
              <s-button
                variant="secondary"
                href={editorUrl ?? undefined}
                target="_blank"
              >
                Open theme editor
              </s-button>
            </s-stack>
          </>
        ) : (
          <>
            <s-paragraph>
              The app embed puts the delivery estimate on your product pages.
            </s-paragraph>
            <s-ordered-list>
              <s-list-item>
                Select{" "}
                <s-text>
                  <span className={styles.strong}>Enable app embed</span>
                </s-text>{" "}
                to open your theme editor.
              </s-list-item>
              <s-list-item>
                Turn on{" "}
                <s-text>
                  <span className={styles.strong}>Estimated Delivery Date</span>
                </s-text>
                .
              </s-list-item>
              <s-list-item>
                Save, then come back and select{" "}
                <s-text>
                  <span className={styles.strong}>Check status</span>
                </s-text>
                .
              </s-list-item>
            </s-ordered-list>
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-button
                variant="primary"
                href={editorUrl ?? undefined}
                target="_blank"
              >
                Enable app embed
              </s-button>
              <s-button
                variant="tertiary"
                onClick={onCheckStatus}
                loading={checking}
              >
                Check status
              </s-button>
            </s-stack>
          </>
        )}
      </Step>

      <Step
        index={2}
        title="Create a delivery rule"
        done={hasRule}
        active={step === 2}
        onSelect={onStepChange}
      >
        {hasRule ? (
          <>
            <s-paragraph>A delivery rule is set up for your store.</s-paragraph>
            <s-stack direction="inline">
              <s-button variant="secondary" onClick={onViewRules}>
                View rules
              </s-button>
            </s-stack>
          </>
        ) : (
          <>
            <s-paragraph>
              Set which products a rule covers and how many days delivery takes.
            </s-paragraph>
            <s-stack direction="inline">
              <s-button variant="primary" href="/app/rules/new">
                Create rule
              </s-button>
            </s-stack>
          </>
        )}
      </Step>

      <Step
        index={3}
        title="Check the estimate on your storefront"
        done={etaConfirmed}
        active={step === 3}
        onSelect={onStepChange}
      >
        {etaConfirmed ? (
          <s-paragraph>
            The estimate is confirmed on your storefront.
          </s-paragraph>
        ) : (
          <>
            <s-paragraph>
              Open a product page and make sure the estimated delivery date
              shows as expected.
            </s-paragraph>
            <s-stack direction="inline">
              <s-button variant="primary" onClick={onConfirmEta}>
                Confirm it’s working
              </s-button>
            </s-stack>
          </>
        )}
      </Step>
    </s-stack>
  );

  if (complete) {
    return (
      <s-section padding="base">
        <s-stack direction="block" gap="base">
          <div className={styles.completeRow}>
            <s-stack direction="inline" gap="small-300" alignItems="center">
              <s-icon type="check-circle-filled" />
              <s-stack direction="block" gap="none">
                <s-text>
                  <span className={styles.strong}>Setup complete</span>
                </s-text>
                <s-text>Delivery dates are live on your storefront.</s-text>
              </s-stack>
            </s-stack>
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-text color="subdued">
                {completedSteps} of {TOTAL_STEPS} tasks
              </s-text>
              <ProgressBar completed={completedSteps} compact />
              <HeaderActions
                open={open}
                onDismiss={onDismiss}
                onToggleOpen={onToggleOpen}
              />
            </s-stack>
          </div>
          {open ? steps : null}
        </s-stack>
      </s-section>
    );
  }

  return (
    <s-section padding="base">
      <s-stack direction="block" gap="small-200">
        <s-stack
          direction="inline"
          alignItems="center"
          justifyContent="space-between"
          gap="small-200"
        >
          <s-heading>Setup guide</s-heading>
          <HeaderActions
            open={open}
            onDismiss={onDismiss}
            onToggleOpen={onToggleOpen}
          />
        </s-stack>
        <s-paragraph>
          Three steps to start showing estimated delivery dates on your
          storefront.
        </s-paragraph>
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-text color="subdued">
            {completedSteps} of {TOTAL_STEPS} tasks complete
          </s-text>
          <ProgressBar completed={completedSteps} />
        </s-stack>
        {open ? steps : null}
      </s-stack>
    </s-section>
  );
}
