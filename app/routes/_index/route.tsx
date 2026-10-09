import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export default function App() {
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Deliverly</h1>
        <p className={styles.text}>
          Show estimated delivery dates on your Shopify product pages.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Flexible rules</strong>. Set delivery estimates for all
            products, specific collections, or individual products.
          </li>
          <li>
            <strong>Your delivery schedule</strong>. Combine processing and shipping
            days, and skip the days you don’t deliver.
          </li>
          <li>
            <strong>Your wording</strong>. Customize the storefront message and
            date format, and preview it before you save.
          </li>
        </ul>
        <p>Open Deliverly from your Shopify admin to get started.</p>
      </div>
    </div>
  );
}
