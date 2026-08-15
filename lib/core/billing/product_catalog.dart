enum CreatorProductType { credits, subscription }

class CreatorProduct {
  const CreatorProduct({
    required this.id,
    required this.type,
    required this.credits,
    this.plan,
  });

  final String id;
  final CreatorProductType type;
  final int credits;
  final String? plan;
}

/// Store-side product identifiers.
/// Prices are NOT hard-coded in the app. Google Play / App Store return
/// localized prices so the customer always sees the storefront price.
class ProductCatalog {
  static const credit100 = CreatorProduct(
    id: 'creatorai_credits_100',
    type: CreatorProductType.credits,
    credits: 100,
  );

  static const credit300 = CreatorProduct(
    id: 'creatorai_credits_300',
    type: CreatorProductType.credits,
    credits: 300,
  );

  static const credit1000 = CreatorProduct(
    id: 'creatorai_credits_1000',
    type: CreatorProductType.credits,
    credits: 1000,
  );

  static const plusMonthly = CreatorProduct(
    id: 'creatorai_plus_monthly',
    type: CreatorProductType.subscription,
    credits: 300,
    plan: 'plus',
  );

  static const proMonthly = CreatorProduct(
    id: 'creatorai_pro_monthly',
    type: CreatorProductType.subscription,
    credits: 1000,
    plan: 'pro',
  );

  static const businessMonthly = CreatorProduct(
    id: 'creatorai_business_monthly',
    type: CreatorProductType.subscription,
    credits: 3000,
    plan: 'business',
  );

  static const all = <CreatorProduct>[
    credit100,
    credit300,
    credit1000,
    plusMonthly,
    proMonthly,
    businessMonthly,
  ];

  static Set<String> get storeProductIds => all.map((e) => e.id).toSet();

  static CreatorProduct? byId(String id) {
    for (final product in all) {
      if (product.id == id) return product;
    }
    return null;
  }
}
