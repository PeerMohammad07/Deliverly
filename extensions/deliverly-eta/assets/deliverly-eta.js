(function () {
  "use strict";
  if (window.__deliverlyEtaInit) return;
  window.__deliverlyEtaInit = true;

  var ETA_URL = "/apps/delivery-estimate";
  var GID_RE = /^gid:\/\/shopify\/Product\/\S+$/;
  var NUM_RE = /^\d+$/;
  var PREVIEW = "Oct 3 – Oct 7";
  var cached = { productGid: null, productId: null, handle: null };
  var etaSeq = 0;
  var activeGid = null;
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
  function readCtx() {
    var tags = document.querySelectorAll("[data-deliverly-product-context]");
    for (var i = 0; i < tags.length; i += 1) {
      var d = null;
      try {
        d = JSON.parse(tags[i].textContent || "");
      } catch (e) {
        continue;
      }
      var gid = toGid(d && (d.productGid || d.productId));
      if (!gid) continue;
      var num = d && d.productId != null ? String(d.productId).trim() : gidNum(gid);
      if (!NUM_RE.test(num || "")) num = gidNum(gid);
      var h = d && typeof d.handle === "string" ? d.handle.trim() || null : null;
      return det(gid, num, h);
    }
    return null;
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
    var host = etaHost();
    if (host) host.remove();
  }
  function loadEta(host, gid) {
    if (activeGid === gid) return;
    var my = (etaSeq += 1);
    activeGid = gid;
    showLoading(host);
    if (typeof fetch === "undefined") return hideEta();
    fetch(ETA_URL + "?productId=" + encodeURIComponent(gid), {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(function (res) {
        if (!res || !res.ok) throw new Error("bad estimate");
        return res.json();
      })
      .then(function (data) {
        if (my !== etaSeq || (cached.productGid || "") !== gid) return;
        activeGid = null;
        var h = etaHost();
        if (!h || !h.isConnected) return;
        if (data && data.enabled === true && typeof data.message === "string" && data.message.trim()) {
          stamp(h, cached);
          showMessage(h, data.message);
        } else hideEta();
      })
      .catch(function () {
        if (my === etaSeq) hideEta();
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
