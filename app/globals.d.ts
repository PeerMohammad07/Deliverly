declare module "*.css";

declare namespace JSX {
  interface IntrinsicElements {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    "s-app-nav": any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    "ui-save-bar": any;
  }
}

// App Bridge resource picker (window.shopify), per Shopify docs:
// returns picked resources or undefined when the merchant cancels.
interface ShopifyResourcePickerItem {
  id: string;
  title?: string;
  handle?: string;
}

interface ShopifyResourcePickerOptions {
  type: "product" | "collection" | "variant";
  multiple?: boolean | number;
  selectionIds?: string[];
  action?: "select" | "add";
}

interface Window {
  shopify?: {
    resourcePicker?: (
      options: ShopifyResourcePickerOptions,
    ) => Promise<ShopifyResourcePickerItem[] | undefined>;
  };
}
