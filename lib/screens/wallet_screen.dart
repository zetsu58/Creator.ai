import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:in_app_purchase/in_app_purchase.dart';

import '../core/api/veyra_api.dart';
import '../core/design/creator_theme.dart';

class CreditWalletPage extends StatefulWidget {
  const CreditWalletPage({
    super.key,
    required this.api,
    required this.userId,
    required this.initialCredits,
    required this.backendOnline,
    required this.onWalletChanged,
  });

  final VeyraApi api;
  final String userId;
  final int initialCredits;
  final bool backendOnline;
  final Future<void> Function() onWalletChanged;

  @override
  State<CreditWalletPage> createState() => _CreditWalletPageState();
}

class _CreditWalletPageState extends State<CreditWalletPage> {
  final _iap = InAppPurchase.instance;
  StreamSubscription<List<PurchaseDetails>>? _purchaseSub;
  int credits = 0;
  String plan = 'free';
  bool loading = true;
  bool storeAvailable = false;
  bool _started = false;
  String? error;
  List<Map<String, dynamic>> products = const [];
  List<Map<String, dynamic>> ledger = const [];
  Map<String, ProductDetails> storeProducts = const {};

  String t(String tr, String en) => Localizations.localeOf(context).languageCode == 'tr' ? tr : en;

  @override
  void initState() {
    super.initState();
    credits = widget.initialCredits;
    _purchaseSub = _iap.purchaseStream.listen(_onPurchases, onError: (_) {});
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    _load();
  }

  @override
  void dispose() {
    _purchaseSub?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() { loading = true; error = null; });
    try {
      if (!widget.api.configured) {
        throw Exception(t('Veyra Cloud sunucu adresi yapılandırılmadı', 'Veyra Cloud server URL is not configured'));
      }
      final wallet = await widget.api.wallet(widget.userId);
      final store = await widget.api.storeProducts();
      final history = await widget.api.walletLedger(widget.userId);
      final items = (store['items'] as List<dynamic>? ?? const []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
      var iapAvailable = false;
      Map<String, ProductDetails> detailsById = {};
      try {
        iapAvailable = await _iap.isAvailable();
        if (iapAvailable && items.isNotEmpty) {
          final ids = items.map((e) => '${e['id']}').toSet();
          final response = await _iap.queryProductDetails(ids);
          detailsById = {for (final p in response.productDetails) p.id: p};
        }
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        credits = (wallet['credits'] as num?)?.toInt() ?? credits;
        plan = '${wallet['plan'] ?? 'free'}';
        products = items;
        ledger = history;
        storeAvailable = iapAvailable;
        storeProducts = detailsById;
      });
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _buy(Map<String, dynamic> item) async {
    final id = '${item['id']}';
    final detail = storeProducts[id];
    if (detail == null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t('Bu kredi paketi henüz mağazada tanımlı değil.', 'This credit package is not configured in the store yet.'))));
      return;
    }
    final param = PurchaseParam(productDetails: detail);
    await _iap.buyConsumable(purchaseParam: param, autoConsume: true);
  }

  Future<void> _onPurchases(List<PurchaseDetails> purchases) async {
    for (final purchase in purchases) {
      if (purchase.status == PurchaseStatus.purchased || purchase.status == PurchaseStatus.restored) {
        try {
          final platform = defaultTargetPlatform == TargetPlatform.iOS ? 'apple' : 'google_play';
          await widget.api.verifyPurchase(
            userId: widget.userId,
            platform: platform,
            productId: purchase.productID,
            transactionId: purchase.purchaseID ?? '${purchase.productID}-${DateTime.now().millisecondsSinceEpoch}',
            purchaseToken: purchase.verificationData.serverVerificationData.isNotEmpty
                ? purchase.verificationData.serverVerificationData
                : purchase.verificationData.localVerificationData,
          );
          await widget.onWalletChanged();
          await _load();
        } catch (e) {
          if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${t('Satın alma doğrulanamadı', 'Purchase could not be verified')}: $e')));
        }
      }
      if (purchase.pendingCompletePurchase) await _iap.completePurchase(purchase);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('credit_wallet_page'),
      appBar: AppBar(title: Text(t('Kredi Merkezi', 'Credit Center'))),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 34),
          children: [
            Container(
              padding: const EdgeInsets.all(22),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(28),
                gradient: const LinearGradient(colors: [Color(0xFF39206F), Color(0xFF13192A), Color(0xFF08394B)]),
                border: Border.all(color: Colors.white12),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Container(width: 48, height: 48, decoration: BoxDecoration(color: CreatorTheme.gold.withValues(alpha: .14), shape: BoxShape.circle), child: const Icon(Icons.bolt, color: CreatorTheme.gold)),
                  const SizedBox(width: 14),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(t('Kullanılabilir kredi', 'Available credits'), style: const TextStyle(color: Colors.white60)),
                    Text('$credits', style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w900)),
                  ])),
                  Chip(label: Text(plan.toUpperCase())),
                ]),
                const SizedBox(height: 16),
                Text(t('Krediler yalnızca bu hesaba aittir. Üretim maliyeti işlem başlamadan önce gösterilir; başarısız işler otomatik iade edilir.', 'Credits belong only to this account. Generation cost is shown before processing; failed jobs are automatically refunded.'), style: const TextStyle(color: Colors.white70, height: 1.35)),
              ]),
            ),
            if (loading) ...[const SizedBox(height: 22), const LinearProgressIndicator()],
            if (error != null) ...[
              const SizedBox(height: 18),
              Card(child: Padding(padding: const EdgeInsets.all(16), child: Row(children: [const Icon(Icons.cloud_off_outlined, color: Colors.orangeAccent), const SizedBox(width: 12), Expanded(child: Text(error!)), IconButton(onPressed: _load, icon: const Icon(Icons.refresh))]))),
            ],
            const SizedBox(height: 26),
            Text(t('Kredi paketleri', 'Credit packages'), style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900)),
            const SizedBox(height: 5),
            Text(storeAvailable ? t('Fiyatlar Google Play / App Store üzerinden gösterilir.', 'Prices are provided by Google Play / App Store.') : t('Mağaza bağlantısı kontrol ediliyor veya ürünler henüz tanımlanmadı.', 'Store connection is being checked or products are not configured yet.'), style: const TextStyle(color: Colors.white54)),
            const SizedBox(height: 12),
            ...products.map((item) {
              final id = '${item['id']}';
              final detail = storeProducts[id];
              final badge = item['badge'];
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Card(child: InkWell(
                  borderRadius: BorderRadius.circular(26),
                  onTap: () => _buy(item),
                  child: Padding(
                    padding: const EdgeInsets.all(17),
                    child: Row(children: [
                      Container(width: 48, height: 48, decoration: BoxDecoration(borderRadius: BorderRadius.circular(17), gradient: const LinearGradient(colors: [Color(0xFF7045E8), Color(0xFF26BDE8)])), child: const Icon(Icons.bolt, color: Colors.white)),
                      const SizedBox(width: 14),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [Text('${item['title']}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)), if (badge != null) ...[const SizedBox(width: 8), Chip(label: Text('$badge'))]]),
                        Text('${item['credits']} ${t('kredi', 'credits')}', style: const TextStyle(color: Colors.white60)),
                      ])),
                      Text(detail?.price ?? t('Mağazada tanımla', 'Configure in store'), style: TextStyle(fontWeight: FontWeight.w900, color: detail == null ? Colors.white38 : CreatorTheme.gold)),
                    ]),
                  ),
                )),
              );
            }),
            const SizedBox(height: 18),
            Card(child: ListTile(
              leading: const Icon(Icons.workspace_premium_outlined, color: CreatorTheme.gold),
              title: const Text('Veyra Pro', style: TextStyle(fontWeight: FontWeight.w900)),
              subtitle: Text(t('Aylık kredi + premium modeller + reklamsız kullanım', 'Monthly credits + premium models + ad-free use')),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t('Pro abonelik ürünü mağaza tarafında bağlanacak.', 'Pro subscription will activate after store product setup.')))),
            )),
            const SizedBox(height: 25),
            Text(t('Kredi hareketleri', 'Credit activity'), style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900)),
            const SizedBox(height: 10),
            if (ledger.isEmpty)
              Card(child: Padding(padding: const EdgeInsets.all(18), child: Text(t('Henüz kredi hareketi yok.', 'No credit activity yet.'), style: const TextStyle(color: Colors.white60))))
            else
              ...ledger.map((tx) => Card(child: ListTile(
                leading: CircleAvatar(backgroundColor: ((tx['delta'] as num?) ?? 0) >= 0 ? Colors.green.withValues(alpha: .15) : Colors.purple.withValues(alpha: .16), child: Icon(((tx['delta'] as num?) ?? 0) >= 0 ? Icons.add : Icons.auto_awesome, color: ((tx['delta'] as num?) ?? 0) >= 0 ? Colors.greenAccent : CreatorTheme.cyan)),
                title: Text('${tx['reason'] ?? 'credit'}', style: const TextStyle(fontWeight: FontWeight.w800)),
                subtitle: Text('${tx['createdAt'] ?? ''}', maxLines: 1, overflow: TextOverflow.ellipsis),
                trailing: Text('${((tx['delta'] as num?) ?? 0) > 0 ? '+' : ''}${tx['delta'] ?? 0}', style: const TextStyle(fontWeight: FontWeight.w900)),
              ))),
          ],
        ),
      ),
    );
  }
}
