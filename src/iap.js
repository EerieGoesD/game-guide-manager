// src/iap.js
// Wraps cordova-plugin-purchase for Reader Vault Android IAP

const PRODUCT_ID = 'reader_vault_pro';

let _isPro = false;
let _store = null;

export function getIsPro() {
  return _isPro;
}

export function initIAP(onProUnlocked) {
  if (typeof CdvPurchase === 'undefined') {
    // Not on Android native — skip silently
    return;
  }

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
        _isPro = true;
        savePro();
        if (onProUnlocked) onProUnlocked();
      }
    });

  _store.initialize([Platform.GOOGLE_PLAY]);

  // Also check local flag immediately (for offline use)
  if (localStorage.getItem('reader_vault_pro') === '1') {
    _isPro = true;
  }
}

export async function purchasePro() {
  if (!_store) throw new Error('Store not available');
  const product = _store.get(PRODUCT_ID, CdvPurchase.Platform.GOOGLE_PLAY);
  if (!product) throw new Error('Product not found');
  const offer = product.getOffer();
  if (!offer) throw new Error('No offer available');
  await _store.order(offer);
}

export function restorePurchases() {
  if (!_store) return;
  _store.restorePurchases();
}

function savePro() {
  localStorage.setItem('reader_vault_pro', '1');
}