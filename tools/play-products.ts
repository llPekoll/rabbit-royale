/**
 * Creates (or updates) the Google Play one-time products from config/store.ts.
 *
 *   PLAY_KEY=~/.config/rabbit-royale/play-billing-service-account.json bun tools/play-products.ts
 *   … bun tools/play-products.ts --dry      prints what it would send
 *
 * The service account (play-billing@…) must be invited in the Play Console
 * with "Manage store presence". Each sachet of gold gets the catalog's
 * `usdCents` as its base price, which Google converts to every country
 * (convertRegionPrices, its own rounding), an English and a French listing,
 * and one "buy" purchase option, activated. Running it again only rewrites them: an
 * id, once created, can never be deleted or reused, so ids come from
 * config/store.ts and nowhere else.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { SignJWT, importPKCS8 } from 'jose';
import { STORE_PRODUCTS, type StoreProductId } from '@config/store';
import { playPackage } from '@/lib/world';

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const PKG = playPackage();
const dry = process.argv.includes('--dry');

/** What a sachet says in the store: how much gold, and what it buys. */
function words(qty: number, lang: 'en-US' | 'fr-FR') {
  const n = qty.toLocaleString(lang);
  return lang === 'fr-FR'
    ? { title: `${n} Gold`, description: 'Du Gold pour la boutique : objets, packs et skins.' }
    : { title: `${n} Gold`, description: 'Gold for the shop: items, packs and skins.' };
}

async function token(): Promise<string> {
  const path = (process.env.PLAY_KEY ?? '~/.config/rabbit-royale/play-billing-service-account.json').replace(/^~/, homedir());
  const sa = JSON.parse(readFileSync(path, 'utf8')) as { client_email: string; private_key: string };
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/androidpublisher' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(await importPKCS8(sa.private_key, 'RS256'));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function call(bearer: string, method: string, path: string, body: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text || '{}');
}

interface Money { currencyCode: string; units?: string; nanos?: number }
interface Converted {
  convertedRegionPrices: Record<string, { regionCode: string; price: Money }>;
  convertedOtherRegionsPrice: { usdPrice: Money; eurPrice: Money };
  regionVersion: { version: string };
}

const bearer = await token();
for (const [id, p] of Object.entries(STORE_PRODUCTS) as [StoreProductId, (typeof STORE_PRODUCTS)[StoreProductId]][]) {
  const usd: Money = { currencyCode: 'USD', units: String(Math.floor(p.usdCents / 100)), nanos: (p.usdCents % 100) * 10_000_000 };
  const conv = (await call(bearer, 'POST', `/applications/${PKG}/pricing:convertRegionPrices`, { price: usd })) as Converted;
  const product = {
    packageName: PKG,
    productId: id,
    listings: [
      { languageCode: 'en-US', ...words(p.qty, 'en-US') },
      { languageCode: 'fr-FR', ...words(p.qty, 'fr-FR') },
    ],
    purchaseOptions: [{
      purchaseOptionId: 'buy',
      // legacyCompatible: what Billing Library versions before 8 see.
      buyOption: { legacyCompatible: true, multiQuantityEnabled: false },
      regionalPricingAndAvailabilityConfigs: Object.values(conv.convertedRegionPrices).map((r) => ({
        regionCode: r.regionCode, price: r.price, availability: 'AVAILABLE',
      })),
      newRegionsConfig: { ...conv.convertedOtherRegionsPrice, availability: 'AVAILABLE' },
    }],
  };
  const fr_ = conv.convertedRegionPrices.FR?.price;
  const label = `${id}: ${product.listings[0].title} — $${(p.usdCents / 100).toFixed(2)} (FR ${fr_?.units}.${String((fr_?.nanos ?? 0) / 1e7).padStart(2, '0')} €)`;
  if (dry) {
    console.log('[dry]', label, `${product.purchaseOptions[0].regionalPricingAndAvailabilityConfigs.length} regions`);
    continue;
  }
  const q = new URLSearchParams({
    allowMissing: 'true',
    updateMask: 'listings,purchaseOptions',
    'regionsVersion.version': conv.regionVersion.version,
  });
  await call(bearer, 'PATCH', `/applications/${PKG}/onetimeproducts/${id}?${q}`, product);
  await call(bearer, 'POST', `/applications/${PKG}/oneTimeProducts/${id}/purchaseOptions:batchUpdateStates`, {
    requests: [{ activatePurchaseOptionRequest: { packageName: PKG, productId: id, purchaseOptionId: 'buy' } }],
  });
  console.log('✓', label);
}
