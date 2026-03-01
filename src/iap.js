// src/iap.js
// Wraps cordova-plugin-purchase for Reader Vault Android IAP

const PRODUCT_ID = 'reader_vault_pro';

let _isPro = false;
let _store = null;
let _storeReady = false;
let _onProUnlocked = null;

export function getIsPro() {
  return _isPro;
}

export function initIAP(onProUnlocked) {
  if (typeof CdvPurchase === 'undefined') {
    // Not on Android native — skip silently
    return;
  }

  _onProUnlocked = onProUnlocked;
  _store = CdvPurchase.store;
  const { ProductType, Platform } = CdvPurchase;

  _store.register([{
    id: PRODUCT_ID,
    type: ProductType.NON_CONSUMABLE,
    platform: Platform.GOOGLE_PLAY
  }]);

  _store.when()
    .productUpdated(() => {})
    .approved(transaction => {
      transaction.verify();
    })
    .verified(receipt => {
      receipt.finish();
    })
    .finished(transaction => {
      if (transaction.products.some(p => p.id === PRODUCT_ID)) {
        _unlockPro();
      }
    });

  _store.ready(() => {
    _storeReady = true;

    // Re-check owned purchases on every launch (replayed by the store)
    const product = _store.get(PRODUCT_ID, Platform.GOOGLE_PLAY);
    if (product?.owned) {
      _unlockPro();
    }
  });

  _store.error(err => {
    console.warn('[IAP] Store error:', err.code, err.message);
  });

  _store.initialize([Platform.GOOGLE_PLAY]);
}

function _unlockPro() {
  const wasAlreadyPro = _isPro;
  _isPro = true;
  if (!wasAlreadyPro && _onProUnlocked) {
    _onProUnlocked();
  }
}

export async function purchasePro() {
  if (!_store) throw new Error('Store not available. Are you on Android?');
  if (!_storeReady) throw new Error('Store is still loading. Please try again in a moment.');

  const product = _store.get(PRODUCT_ID, CdvPurchase.Platform.GOOGLE_PLAY);
  if (!product) throw new Error('Product not found. Check your Google Play setup.');

  const offer = product.getOffer();
  if (!offer) throw new Error('No offer available for this product.');

  await _store.order(offer);
}

export function restorePurchases() {
  if (!_store) return Promise.reject(new Error('Store not available'));
  if (!_storeReady) return Promise.reject(new Error('Store is still loading. Please try again.'));

  return _store.restorePurchases().then(() => {
    // If the user had a purchase, the when().finished() handler above
    // will fire and call _unlockPro() automatically.
    // If nothing was found, we let the caller handle the UX.
    return _isPro;
  });
}