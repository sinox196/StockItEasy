import { Sector } from '@prisma/client';

type L = { 'fr-TN': string; en: string; 'ar-TN': string };

/**
 * Starter categories and units proposed at onboarding, per sector.
 * Users can rename or delete them; nothing else depends on these names.
 */
export const SECTOR_TEMPLATES: Record<Sector, { categories: L[]; defaultUnit: string }> = {
  GROCERY: {
    defaultUnit: 'pc',
    categories: [
      { 'fr-TN': 'Épicerie', en: 'Grocery', 'ar-TN': 'عطرية' },
      { 'fr-TN': 'Boissons', en: 'Beverages', 'ar-TN': 'مشروبات' },
      { 'fr-TN': 'Produits laitiers', en: 'Dairy', 'ar-TN': 'مشتقات الحليب' },
      { 'fr-TN': 'Hygiène & entretien', en: 'Hygiene & cleaning', 'ar-TN': 'نظافة' },
      { 'fr-TN': 'Snacks & confiserie', en: 'Snacks & sweets', 'ar-TN': 'حلويات' },
    ],
  },
  WHOLESALE: {
    defaultUnit: 'carton',
    categories: [
      { 'fr-TN': 'Alimentaire', en: 'Food', 'ar-TN': 'مواد غذائية' },
      { 'fr-TN': 'Boissons', en: 'Beverages', 'ar-TN': 'مشروبات' },
      { 'fr-TN': 'Droguerie', en: 'Household', 'ar-TN': 'مواد التنظيف' },
    ],
  },
  RETAIL: {
    defaultUnit: 'pc',
    categories: [
      { 'fr-TN': 'Vêtements', en: 'Clothing', 'ar-TN': 'حوايج' },
      { 'fr-TN': 'Accessoires', en: 'Accessories', 'ar-TN': 'أكسسوارات' },
      { 'fr-TN': 'Maison', en: 'Home', 'ar-TN': 'دار' },
    ],
  },
  AUTO_PARTS: {
    defaultUnit: 'pc',
    categories: [
      { 'fr-TN': 'Batteries', en: 'Batteries', 'ar-TN': 'باطاريات' },
      { 'fr-TN': 'Filtres', en: 'Filters', 'ar-TN': 'فلترات' },
      { 'fr-TN': 'Freinage', en: 'Brakes', 'ar-TN': 'فرانات' },
      { 'fr-TN': 'Huiles & lubrifiants', en: 'Oils & lubricants', 'ar-TN': 'زيوت' },
    ],
  },
  ELECTRONICS: {
    defaultUnit: 'pc',
    categories: [
      { 'fr-TN': 'Téléphonie', en: 'Phones', 'ar-TN': 'تليفونات' },
      { 'fr-TN': 'Informatique', en: 'Computers', 'ar-TN': 'إعلامية' },
      { 'fr-TN': 'Accessoires', en: 'Accessories', 'ar-TN': 'أكسسوارات' },
    ],
  },
  COSMETICS: {
    defaultUnit: 'pc',
    categories: [
      { 'fr-TN': 'Soins visage', en: 'Face care', 'ar-TN': 'عناية بالوجه' },
      { 'fr-TN': 'Cheveux', en: 'Hair', 'ar-TN': 'شعر' },
      { 'fr-TN': 'Parapharmacie', en: 'Parapharmacy', 'ar-TN': 'بارافارمسي' },
    ],
  },
  ECOMMERCE: {
    defaultUnit: 'pc',
    categories: [
      { 'fr-TN': 'Best-sellers', en: 'Best sellers', 'ar-TN': 'الأكثر مبيعًا' },
      { 'fr-TN': 'Nouveautés', en: 'New arrivals', 'ar-TN': 'جديد' },
    ],
  },
  MULTI_STORE: {
    defaultUnit: 'pc',
    categories: [{ 'fr-TN': 'Général', en: 'General', 'ar-TN': 'عام' }],
  },
  OTHER: {
    defaultUnit: 'pc',
    categories: [{ 'fr-TN': 'Général', en: 'General', 'ar-TN': 'عام' }],
  },
};

/** Default quotas per plan (null = unlimited). Prices are intentionally not defined here. */
export const PLAN_QUOTAS = {
  STARTER: { maxUsers: 3, maxWarehouses: 2, maxProducts: 1000, aiEnabled: false },
  BUSINESS: { maxUsers: 10, maxWarehouses: 5, maxProducts: 10000, aiEnabled: false },
  PRO_AI: { maxUsers: 25, maxWarehouses: 20, maxProducts: 50000, aiEnabled: true },
  ENTERPRISE: { maxUsers: null, maxWarehouses: null, maxProducts: null, aiEnabled: true },
} as const;
