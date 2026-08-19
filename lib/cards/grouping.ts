import type { Brand, Card, Product } from "@/lib/types";

export const NO_BRAND = "__sin_marca__";
export const NO_PRODUCT = "__sin_producto__";

export type ProductGroup = { productId: string; productName: string; cards: Card[] };
export type BrandGroup = {
  brandId: string;
  brand?: Brand;
  brandName: string;
  products: ProductGroup[];
};

const nameOf = (id: string, list: { id: string; name: string }[], fallback: string) =>
  id === NO_BRAND || id === NO_PRODUCT ? fallback : list.find((x) => x.id === id)?.name || fallback;

/**
 * Dos niveles: la marca es una columna y, dentro, cada producto abre una
 * fila con sus tarjetas al lado. "Sin marca" y "Sin producto" van al final.
 */
export function groupCards(cards: Card[], brands: Brand[], products: Product[]): BrandGroup[] {
  const byBrand = new Map<string, Map<string, Card[]>>();

  for (const card of cards) {
    const bKey = card.brand_id || NO_BRAND;
    const pKey = card.product_id || NO_PRODUCT;
    if (!byBrand.has(bKey)) byBrand.set(bKey, new Map());
    const inner = byBrand.get(bKey)!;
    inner.set(pKey, [...(inner.get(pKey) || []), card]);
  }

  return Array.from(byBrand.entries())
    .map(([brandId, inner]) => ({
      brandId,
      brand: brands.find((b) => b.id === brandId),
      brandName: nameOf(brandId, brands, "Sin marca"),
      products: Array.from(inner.entries())
        .map(([productId, list]) => ({
          productId,
          productName: nameOf(productId, products, "Sin producto"),
          cards: list,
        }))
        .sort((a, b) =>
          a.productId === NO_PRODUCT ? 1 : b.productId === NO_PRODUCT ? -1 : a.productName.localeCompare(b.productName)
        ),
    }))
    .sort((a, b) => (a.brandId === NO_BRAND ? 1 : b.brandId === NO_BRAND ? -1 : a.brandName.localeCompare(b.brandName)));
}
