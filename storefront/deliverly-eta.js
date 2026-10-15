// Bundled by esbuild (pnpm build:storefront): the imports below are the
// same rule-picking and date code the server uses, so both always agree.
import { computeEstimate } from "../app/utils/compute-estimate";
import { COUNTDOWN_TOKEN, formatCountdown } from "../app/utils/delivery-dates";
import { selectRule } from "../app/utils/select-rule";
import { parseStorefrontConfig } from "../app/utils/storefront-config";

(function () {
  "use strict";
  if (window.__deliverlyEtaInit) return;
  window.__deliverlyEtaInit = true;

  // Must match [app_proxy] prefix/subpath in shopify.app.toml. Merchants can
  // customize the proxy URL per store; that breaks this path (see README).
  var ETA_URL = "/apps/delivery-estimate";
  var GID_RE = /^gid:\/\/shopify\/Product\/\S+$/;
  var NUM_RE = /^\d+$/;
  var PREVIEW = "Oct 3 – Oct 7";
  var cached = { productGid: null, productId: null, handle: null };
  var etaSeq = 0;
  var activeGid = null;
  // Product whose estimate is currently visible. Refreshes for it keep the
  // message on screen (no hide/show flash, no layout shift).
  var shownGid = null;
  // A device clock this far behind the page's render time is wrong; its
  // dates would be too, so the server works the estimate out instead.
  var CLOCK_SLACK_SECONDS = 300;
  // Countdown deadline: Date.now() plus the estimate's secondsLeft, so only
  // elapsed time matters, not whether the device clock is right.
  // Date.now (not performance.now) keeps counting while the device sleeps.
  // null = no countdown running.
  var countdownEnd = null;
  // Before-cutoff sentence with {countdown} still in it.
  var countdownMessage = "";
  // Normal sentence, shown the moment the countdown ends.
  var plainMessage = "";
  var countdownTimer = null;
  var ROOTS = [
    'main section[id*="Product"]',
    'main section[id*="product"]',
    'main [id*="MainProduct"]',
    "main product-info",
    "main .product__info-container",
    "main .product--information",
    "main [data-product-container]",
    "main",
    "product-info",
    "product-information",
    ".product__info-container",
    "body",
  ];
  var PRICES = [".price--large", ".price__container", "[data-price]", ".product-price", ".price"];
  var FORMS = ['form[action*="/cart/add"]', "product-form", 'form[action*="cart"]'];

  function toGid(v) {
    if (typeof v === "number" && isFinite(v)) v = String(Math.floor(v));
    if (typeof v !== "string") return null;
    v = v.trim();
    if (!v) return null;
    if (GID_RE.test(v)) return v;
    return NUM_RE.test(v) ? "gid://shopify/Product/" + v : null;
  }
  function gidNum(gid) {
    var m = /^gid:\/\/shopify\/Product\/(\d+)\s*$/.exec(gid || "");
    return m ? m[1] : null;
  }
  function det(gid, id, handle) {
    return { productGid: gid, productId: id || gidNum(gid), handle: handle };
  }
  function readJson(selector) {
    var tags = document.querySelectorAll(selector);
    var out = [];
    for (var i = 0; i < tags.length; i += 1) {
      try {
        out.push(JSON.parse(tags[i].textContent || ""));
      } catch (e) {
        // Skip broken tags.
      }
    }
    return out;
  }
  function readCtx() {
    var all = readJson("[data-deliverly-product-context]");
    for (var i = 0; i < all.length; i += 1) {
      var d = all[i];
      var gid = toGid(d && (d.productGid || d.productId));
      if (!gid) continue;
      var num = d && d.productId != null ? String(d.productId).trim() : gidNum(gid);
      if (!NUM_RE.test(num || "")) num = gidNum(gid);
      var h = d && typeof d.handle === "string" ? d.handle.trim() || null : null;
      return det(gid, num, h);
    }
    return null;
  }
  // Collections and render time of `gid`, from the page's Liquid. null when
  // the page doesn't describe that product (e.g. after a client-side
  // switch to another product): then only the server knows them.
  function readLocalCtx(gid) {
    var all = readJson("[data-deliverly-product-context]");
    for (var i = 0; i < all.length; i += 1) {
      var d = all[i];
      if (!d || toGid(d.productGid || d.productId) !== gid || !Array.isArray(d.collectionIds)) continue;
      var rendered = Number(d.renderedAt);
      return {
        collectionIds: d.collectionIds.map(String),
        renderedAt: isFinite(rendered) && rendered > 0 ? rendered : null,
      };
    }
    return null;
  }
  // Shopper's country (Shopify Markets), so country rules can apply.
  function readCountry() {
    var c = null;
    var tag = document.querySelector("[data-deliverly-product-context]");
    try {
      c = tag && JSON.parse(tag.textContent || "").country;
    } catch (e) {
      c = null;
    }
    if (!c) c = window.Shopify && window.Shopify.country;
    c = typeof c === "string" ? c.trim().toUpperCase() : "";
    return /^[A-Z]{2}$/.test(c) ? c : null;
  }
  function urlHandle() {
    var m = /\/products\/([^/?#]+)/.exec(window.location.pathname || "");
    if (!m) return null;
    try {
      return decodeURIComponent(m[1]);
    } catch (e) {
      return m[1];
    }
  }
  function scrapeGid() {
    try {
      var p = window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.product;
      return toGid(p && p.id);
    } catch (e) {
      return null;
    }
  }
  function detect() {
    var ctx = readCtx();
    var uh = urlHandle();
    var scraped = scrapeGid();
    if (ctx && ctx.productGid && !(uh && ctx.handle && uh !== ctx.handle))
      return det(ctx.productGid, ctx.productId, ctx.handle || uh);
    if (scraped) return det(scraped, null, uh);
    return det(null, null, uh);
  }
  function etaHost() {
    return document.querySelector("[data-deliverly-eta]");
  }
  function isEditor() {
    try {
      return !!(window.Shopify && (window.Shopify.designMode || window.Shopify.visualPreviewMode));
    } catch (e) {
      return false;
    }
  }
  function inner(host) {
    return host ? host.querySelector(".deliverly-eta") : null;
  }
  function datesEl(host) {
    return host ? host.querySelector("[data-deliverly-eta-dates]") : null;
  }
  function stopCountdown() {
    if (countdownTimer) window.clearInterval(countdownTimer);
    countdownTimer = null;
    countdownEnd = null;
  }
  function tickCountdown() {
    var host = etaHost();
    var d = datesEl(host);
    if (countdownEnd === null || !d) return stopCountdown();
    var left = (countdownEnd - Date.now()) / 1000;
    if (left <= 0) {
      // Cutoff passed: show the normal sentence, then work out the new dates.
      stopCountdown();
      d.textContent = plainMessage;
      if (cached.productGid && host) loadEta(host, cached.productGid);
      return;
    }
    d.textContent = countdownMessage.split(COUNTDOWN_TOKEN).join(formatCountdown(left));
  }
  // Shows the estimate: the before-cutoff sentence with a live countdown
  // when the server sent one, otherwise the normal sentence.
  function showEstimate(host, data) {
    stopCountdown();
    plainMessage = data.message;
    showMessage(host, plainMessage);
    var cd = data.countdown;
    if (
      !cd ||
      typeof cd.secondsLeft !== "number" ||
      !(cd.secondsLeft > 0) ||
      typeof cd.message !== "string" ||
      cd.message.indexOf(COUNTDOWN_TOKEN) === -1
    )
      return;
    countdownMessage = cd.message;
    countdownEnd = Date.now() + cd.secondsLeft * 1000;
    tickCountdown();
    countdownTimer = window.setInterval(tickCountdown, 15000);
  }
  function stamp(host, d) {
    if (!host || !host.setAttribute) return;
    if (d && d.productGid) {
      host.setAttribute("data-deliverly-product-gid", d.productGid);
      if (d.productId) host.setAttribute("data-deliverly-product-id", d.productId);
      else host.removeAttribute("data-deliverly-product-id");
    } else {
      host.removeAttribute("data-deliverly-product-gid");
      host.removeAttribute("data-deliverly-product-id");
    }
  }
  function showMessage(host, msg) {
    var el = inner(host);
    if (el) {
      el.setAttribute("data-deliverly-eta-state", "ready");
      el.removeAttribute("hidden");
    }
    var d = datesEl(host);
    if (d) d.textContent = msg;
  }
  function showLoading(host) {
    shownGid = null;
    stopCountdown();
    if (isEditor()) return showMessage(host, PREVIEW);
    var el = inner(host);
    if (el) {
      el.setAttribute("data-deliverly-eta-state", "loading");
      el.setAttribute("hidden", "");
    }
    var d = datesEl(host);
    if (d) d.textContent = "";
  }
  function dropFlight() {
    etaSeq += 1;
    activeGid = null;
  }
  function hideEta() {
    if (isEditor()) {
      var preview = etaHost();
      if (preview) showMessage(preview, PREVIEW);
      return;
    }
    dropFlight();
    shownGid = null;
    stopCountdown();
    var host = etaHost();
    if (host) host.remove();
  }
  // The estimate from the shop's config in the page, with no request.
  // undefined = can't work it out here (no or invalid config, product not
  // described by the page, wrong device clock): ask the server instead.
  // { enabled: false } = the config has no rule for this product.
  function localEstimate(gid) {
    var configs = readJson("[data-deliverly-config]");
    var config = null;
    for (var i = 0; i < configs.length && !config; i += 1) config = parseStorefrontConfig(configs[i]);
    var ctx = config && readLocalCtx(gid);
    var productId = gidNum(gid);
    if (!ctx || !productId) return undefined;
    var now = Date.now();
    if (ctx.renderedAt !== null && now / 1000 < ctx.renderedAt - CLOCK_SLACK_SECONDS) return undefined;
    var rule = selectRule(config.rules, {
      productId: productId,
      collectionIds: ctx.collectionIds,
      country: readCountry(),
    });
    if (!rule) return { enabled: false };
    try {
      var estimate = computeEstimate(rule, new Date(now), config.timezone);
      return {
        enabled: true,
        message: estimate.message,
        countdown: estimate.countdown,
      };
    } catch (e) {
      return undefined;
    }
  }
  function applyEstimate(host, gid, data) {
    activeGid = null;
    if (!host || !host.isConnected) return;
    if (data && data.enabled === true && typeof data.message === "string" && data.message.trim()) {
      stamp(host, cached);
      showEstimate(host, data);
      shownGid = gid;
    } else hideEta();
  }
  function loadEta(host, gid) {
    if (activeGid === gid) return;
    var local = localEstimate(gid);
    if (local !== undefined) {
      dropFlight();
      return applyEstimate(host, gid, local);
    }
    var my = (etaSeq += 1);
    activeGid = gid;
    var refreshing = shownGid === gid;
    if (!refreshing) showLoading(host);
    if (typeof fetch === "undefined") return hideEta();
    var country = readCountry();
    var qs = "?productId=" + encodeURIComponent(gid) + (country ? "&country=" + country : "");
    fetch(ETA_URL + qs, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(function (res) {
        if (!res || !res.ok) throw new Error("bad estimate");
        return res.json();
      })
      .then(function (data) {
        if (my !== etaSeq || (cached.productGid || "") !== gid) return;
        applyEstimate(etaHost(), gid, data);
      })
      .catch(function () {
        if (my !== etaSeq) return;
        // A failed background refresh keeps the estimate already shown.
        if (refreshing && shownGid === gid) activeGid = null;
        else hideEta();
      });
  }
  function isProductPage() {
    return !!(readCtx() || /\/products\/[^/?#]+/.test(window.location.pathname || ""));
  }
  function isVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length));
  }
  function inOverlay(el) {
    return !!el.closest('dialog,[role="dialog"],[aria-modal="true"],cart-drawer,.drawer,.cart-drawer');
  }
  function firstVisible(root, selectors) {
    for (var i = 0; i < selectors.length; i += 1) {
      var nodes;
      try {
        nodes = root.querySelectorAll(selectors[i]);
      } catch (e) {
        continue;
      }
      for (var j = 0; j < nodes.length; j += 1) {
        if (isVisible(nodes[j]) && !inOverlay(nodes[j]) && !nodes[j].closest("[data-deliverly-eta]"))
          return nodes[j];
      }
    }
    return null;
  }
  function findAnchor() {
    for (var i = 0; i < ROOTS.length; i += 1) {
      var root;
      try {
        root = document.querySelector(ROOTS[i]);
      } catch (e) {
        continue;
      }
      if (!root || !isVisible(root)) continue;
      var price = firstVisible(root, PRICES);
      if (price) return { node: price, position: "after" };
      var form = firstVisible(root, FORMS);
      if (form) return { node: form, position: "before" };
      return { node: root, position: "append" };
    }
    return null;
  }
  function buildInstance() {
    var tpl = document.querySelector("template[data-deliverly-eta-template]");
    if (!tpl || !tpl.content) return null;
    var host = document.createElement("div");
    host.setAttribute("data-deliverly-eta", "");
    stamp(host, cached);
    host.appendChild(tpl.content.cloneNode(true));
    showLoading(host);
    return host;
  }
  function place() {
    var existing = etaHost();
    if (existing && existing.isConnected) {
      stamp(existing, cached);
      return true;
    }
    if (existing) existing.remove();
    if (!isProductPage() && !isEditor()) return false;
    var anchor = findAnchor();
    var node = buildInstance();
    if (!anchor || !node || !anchor.node.parentNode) return false;
    if (anchor.position === "after")
      anchor.node.parentNode.insertBefore(node, anchor.node.nextSibling);
    else if (anchor.position === "before")
      anchor.node.parentNode.insertBefore(node, anchor.node);
    else anchor.node.appendChild(node);
    return true;
  }
  function syncEta() {
    cached = detect();
    var host = etaHost();
    if (host && host.isConnected) stamp(host, cached);
    var gid = cached.productGid;
    var editor = isEditor();
    if ((!gid || !isProductPage()) && !editor) return hideEta();
    if (!place()) {
      dropFlight();
      return;
    }
    host = etaHost();
    if (!host) return;
    if (editor) showMessage(host, PREVIEW);
    if (gid) loadEta(host, gid);
  }
  function patchHistory() {
    ["pushState", "replaceState"].forEach(function (m) {
      if (!window.history || !window.history[m] || window.history[m].__deliverlyPatched) return;
      var orig = window.history[m];
      var patched = function () {
        var r = orig.apply(this, arguments);
        window.setTimeout(syncEta, 0);
        return r;
      };
      patched.__deliverlyPatched = true;
      window.history[m] = patched;
    });
  }

  patchHistory();
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", syncEta);
  else syncEta();
  ["shopify:section:load", "shopify:section:select", "shopify:section:deselect", "shopify:section:reorder"].forEach(
    function (ev) {
      document.addEventListener(ev, syncEta);
    },
  );
  window.addEventListener("focus", syncEta);
  window.addEventListener("popstate", syncEta);
})();
