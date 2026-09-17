/** Published version of this SDK. Kept in sync with `package.json` by hand. */
export const SDK_VERSION = "0.1.0";

/** Default `User-Agent` sent with every request when the caller does not supply one. */
export function defaultUserAgent(): string {
  return `devino-bestbuy-marketplace-sdk/${SDK_VERSION}`;
}
