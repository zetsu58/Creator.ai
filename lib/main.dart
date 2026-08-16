import 'package:flutter/material.dart';

import 'core/api/veyra_api.dart';
import 'core/design/creator_theme.dart';

void main() => runApp(const CreatorAIApp());

class CreatorAIApp extends StatelessWidget {
  const CreatorAIApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      key: const Key('veyra_app'),
      debugShowCheckedModeBanner: false,
      title: 'Veyra AI',
      theme: CreatorTheme.dark(),
      home: const CreatorHome(),
    );
  }
}

class ToolSpec {
  const ToolSpec({
    required this.title,
    required this.subtitle,
    required this.type,
    required this.icon,
    required this.colors,
    this.isVideo = false,
  });

  final String title;
  final String subtitle;
  final String type;
  final IconData icon;
  final List<Color> colors;
  final bool isVideo;
}

const tools = <ToolSpec>[
  ToolSpec(title: 'Video Studio', subtitle: 'Metinden veya görselden sinematik video', type: 'video', icon: Icons.movie_creation_outlined, colors: [Color(0xFF6B3CFF), Color(0xFF9C35FF)], isVideo: true),
  ToolSpec(title: 'Image Studio', subtitle: 'Görsel üret, düzenle ve geliştir', type: 'image', icon: Icons.image_outlined, colors: [Color(0xFF126BDF), Color(0xFF25C5FF)]),
  ToolSpec(title: 'Product Ads', subtitle: 'Ürününü profesyonel reklama dönüştür', type: 'product_ad', icon: Icons.shopping_bag_outlined, colors: [Color(0xFFEB6A28), Color(0xFFFFA53B)]),
  ToolSpec(title: 'Headshot AI', subtitle: 'Profesyonel portre ve profil stüdyosu', type: 'headshot', icon: Icons.face_retouching_natural, colors: [Color(0xFF139A9A), Color(0xFF36D9D0)]),
  ToolSpec(title: 'Magic Edit', subtitle: 'İstediğin değişikliği metinle tarif et', type: 'magic_edit', icon: Icons.auto_fix_high, colors: [Color(0xFF9C35FF), Color(0xFFE047E6)]),
  ToolSpec(title: 'Enhance & Upscale', subtitle: 'Kalite, netlik ve çözünürlük iyileştirme', type: 'image', icon: Icons.hd_outlined, colors: [Color(0xFF0E77BD), Color(0xFF40D0F5)]),
  ToolSpec(title: 'Social Creator', subtitle: 'Post, story ve reklam içerikleri', type: 'product_ad', icon: Icons.campaign_outlined, colors: [Color(0xFF5651D8), Color(0xFF7E6CFF)]),
  ToolSpec(title: 'Scene Director', subtitle: 'Videoyu sahne sahne yönet', type: 'video', icon: Icons.view_timeline_outlined, colors: [Color(0xFF3B4EC7), Color(0xFF6D7CFF)], isVideo: true),
];

class CreatorHome extends StatefulWidget {
  const CreatorHome({super.key});

  @override
  State<CreatorHome> createState() => _CreatorHomeState();
}

class _CreatorHomeState extends State<CreatorHome> {
  static const userId = 'veyra-test-user';
  final api = VeyraApi();
  final jobs = <Map<String, dynamic>>[];

  int index = 0;
  int credits = 100;
  bool backendOnline = false;
  bool checkingBackend = true;

  @override
  void initState() {
    super.initState();
    _refreshBackend();
  }

  Future<void> _refreshBackend() async {
    if (mounted) setState(() => checkingBackend = true);
    final online = await api.health();
    var nextCredits = credits;
    if (online) {
      try {
        nextCredits = await api.walletCredits(userId);
      } catch (_) {}
    }
    if (!mounted) return;
    setState(() {
      backendOnline = online;
      credits = nextCredits;
      checkingBackend = false;
    });
  }

  Future<void> _openTool(ToolSpec tool) async {
    final result = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(
        builder: (_) => ToolStudioPage(
          tool: tool,
          userId: userId,
          credits: credits,
          api: api,
        ),
      ),
    );
    if (result != null) {
      jobs.insert(0, result);
      await _refreshBackend();
      if (mounted) setState(() {});
    }
  }

  @override
  void dispose() {
    api.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pages = <Widget>[
      StudioHome(
        credits: credits,
        backendOnline: backendOnline,
        checkingBackend: checkingBackend,
        onRefresh: _refreshBackend,
        onOpenTool: _openTool,
      ),
      AllToolsPage(onOpenTool: _openTool),
      ProjectsPage(jobs: jobs, api: api),
      ProfilePage(credits: credits, backendOnline: backendOnline),
    ];

    return LayoutBuilder(builder: (context, c) {
      final wide = c.maxWidth >= 900;
      if (wide) {
        return Scaffold(
          body: SafeArea(
            child: Row(children: [
              NavigationRail(
                selectedIndex: index,
                extended: c.maxWidth >= 1180,
                onDestinationSelected: (v) => setState(() => index = v),
                leading: const Padding(padding: EdgeInsets.symmetric(vertical: 18), child: VeyraMark(size: 42)),
                destinations: const [
                  NavigationRailDestination(icon: Icon(Icons.auto_awesome), label: Text('Studio')),
                  NavigationRailDestination(icon: Icon(Icons.grid_view_rounded), label: Text('Araçlar')),
                  NavigationRailDestination(icon: Icon(Icons.folder_outlined), label: Text('Projeler')),
                  NavigationRailDestination(icon: Icon(Icons.person_outline), label: Text('Profil')),
                ],
              ),
              const VerticalDivider(width: 1),
              Expanded(child: _PageFrame(child: pages[index])),
            ]),
          ),
        );
      }

      return Scaffold(
        body: SafeArea(child: _PageFrame(child: pages[index])),
        bottomNavigationBar: NavigationBar(
          selectedIndex: index,
          onDestinationSelected: (v) => setState(() => index = v),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.auto_awesome), label: 'Studio'),
            NavigationDestination(icon: Icon(Icons.grid_view_rounded), label: 'Araçlar'),
            NavigationDestination(icon: Icon(Icons.folder_outlined), label: 'Projeler'),
            NavigationDestination(icon: Icon(Icons.person_outline), label: 'Profil'),
          ],
        ),
      );
    });
  }
}

class _PageFrame extends StatelessWidget {
  const _PageFrame({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Center(
        child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 1280), child: child),
      );
}

class VeyraMark extends StatelessWidget {
  const VeyraMark({super.key, this.size = 46});
  final double size;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF663CFF), Color(0xFFD74BFF), Color(0xFF25C5FF)]),
          borderRadius: BorderRadius.circular(size * .3),
          boxShadow: const [BoxShadow(blurRadius: 24, color: Color(0x55683CFF))],
        ),
        child: Icon(Icons.auto_awesome, color: Colors.white, size: size * .52),
      );
}

class StudioHome extends StatelessWidget {
  const StudioHome({
    super.key,
    required this.credits,
    required this.backendOnline,
    required this.checkingBackend,
    required this.onRefresh,
    required this.onOpenTool,
  });

  final int credits;
  final bool backendOnline;
  final bool checkingBackend;
  final Future<void> Function() onRefresh;
  final Future<void> Function(ToolSpec) onOpenTool;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      final columns = c.maxWidth >= 1050 ? 4 : c.maxWidth >= 650 ? 3 : 2;
      return RefreshIndicator(
        onRefresh: onRefresh,
        child: ListView(
          key: const Key('veyra_home'),
          padding: EdgeInsets.all(c.maxWidth >= 900 ? 28 : 20),
          children: [
            Row(children: [
              const VeyraMark(),
              const SizedBox(width: 12),
              const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Veyra AI', style: TextStyle(fontSize: 25, fontWeight: FontWeight.w900)),
                Text('Create. Imagine. Inspire.', style: TextStyle(color: Colors.white54, fontSize: 12)),
              ])),
              _CreditBadge(credits: credits),
            ]),
            const SizedBox(height: 14),
            _BackendBar(online: backendOnline, loading: checkingBackend, onTap: onRefresh),
            const SizedBox(height: 18),
            _HeroCard(onTap: () => onOpenTool(tools.first)),
            const SizedBox(height: 18),
            const _ProBanner(),
            const SizedBox(height: 24),
            const Text('AI araçları', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
            const SizedBox(height: 12),
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: columns,
              childAspectRatio: columns >= 3 ? 1.35 : 1.08,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              children: tools.map((tool) => _ToolCard(tool: tool, onTap: () => onOpenTool(tool))).toList(),
            ),
            const SizedBox(height: 28),
            const _TrustStrip(),
          ],
        ),
      );
    });
  }
}

class _BackendBar extends StatelessWidget {
  const _BackendBar({required this.online, required this.loading, required this.onTap});
  final bool online;
  final bool loading;
  final Future<void> Function() onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
          decoration: BoxDecoration(color: const Color(0xFF141821), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white10)),
          child: Row(children: [
            if (loading)
              const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
            else
              Icon(online ? Icons.cloud_done_outlined : Icons.cloud_off_outlined, size: 20, color: online ? Colors.greenAccent : Colors.orangeAccent),
            const SizedBox(width: 9),
            Expanded(child: Text(loading ? 'Sunucu kontrol ediliyor…' : online ? 'Veyra Cloud bağlı' : 'Veyra Cloud çevrimdışı — tekrar denemek için dokun', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700))),
            const Icon(Icons.refresh, size: 18),
          ]),
        ),
      );
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: 235),
            padding: const EdgeInsets.all(24),
            decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF301C66), Color(0xFF17162D), Color(0xFF082F45)])),
            child: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Wrap(spacing: 8, runSpacing: 8, children: [Chip(label: Text('AI CREATE')), Chip(label: Text('VIDEO')), Chip(label: Text('IMAGE')), Chip(label: Text('ADS'))]),
              SizedBox(height: 34),
              Text('Hayal et. Veyra AI üretsin.', style: TextStyle(fontSize: 29, fontWeight: FontWeight.w900)),
              SizedBox(height: 9),
              Text('Görsel, video, ürün reklamı ve profesyonel içerik üretimini tek stüdyoda yönet.'),
              SizedBox(height: 22),
              Row(children: [Icon(Icons.auto_awesome, color: CreatorTheme.cyan), SizedBox(width: 9), Text('Video Studio’yu aç', style: TextStyle(fontWeight: FontWeight.w900)), SizedBox(width: 8), Icon(Icons.arrow_forward)]),
            ]),
          ),
        ),
      );
}

class _ProBanner extends StatelessWidget {
  const _ProBanner();

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(17),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), border: Border.all(color: const Color(0x667A4CFF)), gradient: const LinearGradient(colors: [Color(0xFF22183C), Color(0xFF121827)])),
        child: const Row(children: [
          Icon(Icons.workspace_premium_outlined, color: CreatorTheme.gold, size: 32),
          SizedBox(width: 13),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Veyra Pro', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
            SizedBox(height: 3),
            Text('Premium modeller • yüksek kalite • reklamsız • ticari araçlar', style: TextStyle(color: Colors.white60, fontSize: 12)),
          ])),
          Icon(Icons.chevron_right),
        ]),
      );
}

class _ToolCard extends StatelessWidget {
  const _ToolCard({required this.tool, required this.onTap});
  final ToolSpec tool;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.all(15),
            decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [tool.colors.first.withValues(alpha: .28), const Color(0xFF151822)])),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Container(width: 42, height: 42, decoration: BoxDecoration(gradient: LinearGradient(colors: tool.colors), borderRadius: BorderRadius.circular(13)), child: Icon(tool.icon, color: Colors.white)),
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(tool.title, style: const TextStyle(fontWeight: FontWeight.w900)),
                const SizedBox(height: 4),
                Text(tool.subtitle, style: const TextStyle(fontSize: 12, color: Colors.white60)),
              ]),
            ]),
          ),
        ),
      );
}

class ToolStudioPage extends StatefulWidget {
  const ToolStudioPage({super.key, required this.tool, required this.userId, required this.credits, required this.api});
  final ToolSpec tool;
  final String userId;
  final int credits;
  final VeyraApi api;

  @override
  State<ToolStudioPage> createState() => _ToolStudioPageState();
}

class _ToolStudioPageState extends State<ToolStudioPage> {
  final prompt = TextEditingController();
  String quality = 'fast';
  String ratio = '9:16';
  int seconds = 8;
  bool audio = true;
  bool busy = false;
  int? quote;
  String? statusText;
  Map<String, dynamic>? job;

  @override
  void dispose() {
    prompt.dispose();
    super.dispose();
  }

  Future<void> _quote() async {
    if (prompt.text.trim().length < 3) return;
    setState(() {
      busy = true;
      statusText = 'Maliyet hesaplanıyor…';
    });
    try {
      final value = await widget.api.quote(type: widget.tool.type, seconds: widget.tool.isVideo ? seconds : 0, quality: quality, audio: widget.tool.isVideo && audio);
      if (!mounted) return;
      setState(() {
        quote = value;
        statusText = 'Hazır • $value kredi';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => statusText = 'Sunucu hatası: $e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _generate() async {
    final text = prompt.text.trim();
    if (text.length < 3 || busy) return;
    setState(() {
      busy = true;
      statusText = 'Veyra isteğini analiz ediyor…';
    });
    try {
      final online = await widget.api.health();
      if (!online) throw Exception('Veyra Cloud bağlantısı yok');
      final cost = await widget.api.quote(type: widget.tool.type, seconds: widget.tool.isVideo ? seconds : 0, quality: quality, audio: widget.tool.isVideo && audio);
      if (!mounted) return;
      setState(() {
        quote = cost;
        statusText = 'İş kuyruğa gönderiliyor…';
      });
      final created = await widget.api.createGeneration(
        userId: widget.userId,
        type: widget.tool.type,
        prompt: text,
        seconds: widget.tool.isVideo ? seconds : 0,
        quality: quality,
        audio: widget.tool.isVideo && audio,
        aspectRatio: ratio,
      );
      if (!mounted) return;
      setState(() {
        job = created;
        statusText = 'İş oluşturuldu • ${created['status'] ?? 'queued'}';
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Veyra AI üretim işi başarıyla oluşturuldu.')));
    } catch (e) {
      if (!mounted) return;
      setState(() => statusText = 'İşlem başarısız: $e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.tool.title), actions: [Padding(padding: const EdgeInsets.only(right: 12), child: Center(child: _CreditBadge(credits: widget.credits)))]),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 900),
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(borderRadius: BorderRadius.circular(22), gradient: LinearGradient(colors: [widget.tool.colors.first.withValues(alpha: .35), const Color(0xFF141722)])),
                child: Row(children: [
                  Container(width: 52, height: 52, decoration: BoxDecoration(gradient: LinearGradient(colors: widget.tool.colors), borderRadius: BorderRadius.circular(16)), child: Icon(widget.tool.icon, color: Colors.white)),
                  const SizedBox(width: 14),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(widget.tool.title, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900)), const SizedBox(height: 4), Text(widget.tool.subtitle, style: const TextStyle(color: Colors.white60))])),
                ]),
              ),
              const SizedBox(height: 18),
              TextField(
                key: const Key('generation_prompt'),
                controller: prompt,
                minLines: 6,
                maxLines: 12,
                onChanged: (_) => setState(() => quote = null),
                decoration: InputDecoration(labelText: '${widget.tool.title} için ne istiyorsun?', hintText: 'Detaylı anlat: konu, stil, ışık, kamera, renkler, korunacak detaylar…', alignLabelWithHint: true),
              ),
              const SizedBox(height: 14),
              Wrap(spacing: 8, runSpacing: 8, children: ['fast', 'pro'].map((v) => ChoiceChip(label: Text(v == 'fast' ? 'Fast' : 'Pro'), selected: quality == v, onSelected: (_) => setState(() { quality = v; quote = null; }))).toList()),
              const SizedBox(height: 12),
              Wrap(spacing: 8, runSpacing: 8, children: ['9:16', '16:9', '1:1'].map((v) => ChoiceChip(label: Text(v), selected: ratio == v, onSelected: (_) => setState(() => ratio = v))).toList()),
              if (widget.tool.isVideo) ...[
                const SizedBox(height: 18),
                Text('Süre: $seconds saniye', style: const TextStyle(fontWeight: FontWeight.w800)),
                Slider(value: seconds.toDouble(), min: 4, max: 20, divisions: 4, label: '${seconds}s', onChanged: (v) => setState(() { seconds = v.round(); quote = null; })),
                SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, title: const Text('Ses planı'), subtitle: const Text('Ambiyans, efekt ve konuşma yönlendirmesi'), value: audio, onChanged: (v) => setState(() { audio = v; quote = null; })),
              ],
              const SizedBox(height: 14),
              Row(children: [
                Expanded(child: OutlinedButton.icon(onPressed: busy || prompt.text.trim().length < 3 ? null : _quote, icon: const Icon(Icons.calculate_outlined), label: Text(quote == null ? 'Krediyi hesapla' : '$quote kredi'))),
                const SizedBox(width: 10),
                Expanded(flex: 2, child: FilledButton.icon(onPressed: busy || prompt.text.trim().length < 3 ? null : _generate, icon: busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.auto_awesome), label: Text(busy ? 'İşleniyor…' : 'Veyra ile oluştur'))),
              ]),
              if (statusText != null) ...[
                const SizedBox(height: 16),
                Card(child: Padding(padding: const EdgeInsets.all(16), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [const Icon(Icons.info_outline, color: CreatorTheme.cyan), const SizedBox(width: 10), Expanded(child: Text(statusText!))]))),
              ],
              if (job != null) ...[
                const SizedBox(height: 10),
                Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Üretim işi', style: TextStyle(fontWeight: FontWeight.w900)),
                  const SizedBox(height: 8),
                  Text('ID: ${job!['id']}'),
                  Text('Durum: ${job!['status']}'),
                  Text('Provider: ${job!['provider']}'),
                  Text('Maliyet: ${job!['cost']} kredi'),
                  const SizedBox(height: 10),
                  FilledButton.tonalIcon(onPressed: () => Navigator.of(context).pop(job), icon: const Icon(Icons.folder_outlined), label: const Text('Projelerime ekle')),
                ]))),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class AllToolsPage extends StatelessWidget {
  const AllToolsPage({super.key, required this.onOpenTool});
  final Future<void> Function(ToolSpec) onOpenTool;

  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.all(20), children: [
        const Text('Tüm Veyra araçları', style: TextStyle(fontSize: 27, fontWeight: FontWeight.w900)),
        const SizedBox(height: 8),
        const Text('Her araç aynı Veyra Cloud kredi ve üretim kuyruğunu kullanır.', style: TextStyle(color: Colors.white60)),
        const SizedBox(height: 18),
        ...tools.map((tool) => Card(child: ListTile(leading: Icon(tool.icon), title: Text(tool.title, style: const TextStyle(fontWeight: FontWeight.w800)), subtitle: Text(tool.subtitle), trailing: const Icon(Icons.chevron_right), onTap: () => onOpenTool(tool)))),
      ]);
}

class ProjectsPage extends StatefulWidget {
  const ProjectsPage({super.key, required this.jobs, required this.api});
  final List<Map<String, dynamic>> jobs;
  final VeyraApi api;

  @override
  State<ProjectsPage> createState() => _ProjectsPageState();
}

class _ProjectsPageState extends State<ProjectsPage> {
  Future<void> _refreshJob(int i) async {
    try {
      final id = '${widget.jobs[i]['id']}';
      final updated = await widget.api.generation(id);
      if (mounted) setState(() => widget.jobs[i] = updated);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Durum alınamadı: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.jobs.isEmpty) return const Center(child: Padding(padding: EdgeInsets.all(30), child: Text('Henüz proje yok. Bir AI aracı açıp ilk üretim işini oluştur.')));
    return ListView(padding: const EdgeInsets.all(20), children: [
      const Text('Projeler', style: TextStyle(fontSize: 27, fontWeight: FontWeight.w900)),
      const SizedBox(height: 14),
      for (var i = 0; i < widget.jobs.length; i++)
        Card(child: ListTile(
          leading: const Icon(Icons.auto_awesome),
          title: Text('${widget.jobs[i]['type'] ?? 'AI'} • ${widget.jobs[i]['status'] ?? 'unknown'}', style: const TextStyle(fontWeight: FontWeight.w800)),
          subtitle: Text('${widget.jobs[i]['prompt'] ?? ''}', maxLines: 2, overflow: TextOverflow.ellipsis),
          trailing: IconButton(icon: const Icon(Icons.refresh), onPressed: () => _refreshJob(i)),
        )),
    ]);
  }
}

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key, required this.credits, required this.backendOnline});
  final int credits;
  final bool backendOnline;

  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.all(20), children: [
        const Text('Veyra AI Profil', style: TextStyle(fontSize: 27, fontWeight: FontWeight.w900)),
        const SizedBox(height: 18),
        Card(child: ListTile(leading: const CircleAvatar(child: Icon(Icons.person_outline)), title: const Text('Test Kullanıcısı'), subtitle: Text('$credits kredi • ${backendOnline ? 'Cloud bağlı' : 'Cloud çevrimdışı'}'))),
        const SizedBox(height: 12),
        const Card(child: ListTile(leading: Icon(Icons.workspace_premium_outlined), title: Text('Veyra Pro'), subtitle: Text('Abonelik ve satın alma ürünleri mağaza bağlantısından sonra aktif olacak.'), trailing: Icon(Icons.chevron_right))),
        const Card(child: ListTile(leading: Icon(Icons.shield_outlined), title: Text('Gizlilik & Güvenlik'), subtitle: Text('API anahtarları cihazda tutulmaz; üretim istekleri Veyra Cloud üzerinden gider.'))),
      ]);
}

class _CreditBadge extends StatelessWidget {
  const _CreditBadge({required this.credits});
  final int credits;

  @override
  Widget build(BuildContext context) => Chip(avatar: const Icon(Icons.bolt, size: 18, color: CreatorTheme.gold), label: Text('$credits kredi'));
}

class _TrustStrip extends StatelessWidget {
  const _TrustStrip();

  @override
  Widget build(BuildContext context) => const Wrap(alignment: WrapAlignment.spaceBetween, spacing: 18, runSpacing: 12, children: [
        _Trust(Icons.auto_awesome, 'Akıllı AI routing'),
        _Trust(Icons.hd_outlined, 'HD / 4K araçları'),
        _Trust(Icons.lock_outline, 'Güvenli mimari'),
        _Trust(Icons.storefront_outlined, 'Ticari araçlar'),
      ]);
}

class _Trust extends StatelessWidget {
  const _Trust(this.icon, this.text);
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [Icon(icon, size: 18, color: CreatorTheme.cyan), const SizedBox(width: 7), Text(text, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700))]);
}
