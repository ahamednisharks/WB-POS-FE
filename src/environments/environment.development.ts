import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: false,
  apiUrl: 'http://localhost:9000/api',
  /** true = answer every API call from the in-browser mock backend (localStorage). */
  useMock: false,
  mockDelayMs: 300,
  shop: {
    name: 'Wonder Bakery',
    logo: 'images/WB-logo.jpg',
    tagline: 'Fresh from the oven',
    address: '12, Gandhi Road, T. Nagar, Chennai - 600017',
    phone: '+91 98400 12345',
    gstin: '33ABCDE1234F1Z5',
    state: 'Tamil Nadu',
    upiId: 'wbbakery@upi',
  },
};
