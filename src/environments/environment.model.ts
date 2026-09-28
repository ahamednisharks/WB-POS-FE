export interface ShopProfile {
  name: string;
  /** Path under public/ to the shop logo. */
  logo: string;
  tagline: string;
  address: string;
  phone: string;
  gstin: string;
  /** Used to decide CGST+SGST (same state) vs IGST (other state) on purchases. */
  state: string;
  upiId: string;
}

export interface AppEnvironment {
  production: boolean;
  apiUrl: string;
  useMock: boolean;
  mockDelayMs: number;
  shop: ShopProfile;
}
