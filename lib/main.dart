import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'core/api/veyra_api.dart';
import 'core/auth/veyra_session.dart';
import 'core/design/creator_theme.dart';
import 'core/localization/veyra_locale.dart';
import 'screens/wallet_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await VeyraLocaleController.instance.load();
  runApp(const CreatorAIApp());
}

class CreatorAIApp extends StatelessWidget {
  const CreatorAIApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Locale>(
      valueListenable: VeyraLocaleController.instance,
      builder: (context, locale, _) => MaterialApp(
        key: const Key('veyra_app'),
        debugShowCheckedModeBanner: false,
        title: 'Veyra AI',
        theme: CreatorTheme.dark(),
        locale: locale,
        supportedLocales: veyraLanguages.map((e) => Locale(e.code)).toList(),
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: const CreatorHome(),
      ),
    );
  }
}

class ToolSpec {
  const ToolSpec({required this.titleKey, required this.subtitleKey, required this.type, required this.icon, required this.colors, this.isVideo = false});
  final String titleKey;
  final String subtitleKey;
  final String type;
  final IconData icon;
  final List<Color> colors;
  final bool isVideo;
}

const tools = <ToolSpec>[
  ToolSpec(titleKey: 'video_title', subtitleKey: 'video_sub', type: 'video', icon: Icons.movie_creation_outlined, colors: [Color(0xFF6B3CFF), Color(0xFF9C35FF)], isVideo: true),
  ToolSpec(titleKey: 'image_title', subtitleKey: 'image_sub', type: 'image', icon: Icons.image_outlined, colors: [Color(0xFF126BDF), Color(0xFF25C5FF)]),
  ToolSpec(titleKey: 'product_title', subtitleKey: 'product_sub', type: 'product_ad', icon: Icons.shopping_bag_outlined, colors: [Color(0xFFEB6A28), Color(0xFFFFA53B)]),
  ToolSpec(titleKey: 'headshot_title', subtitleKey: 'headshot_sub', type: 'headshot', icon: Icons.face_retouching_natural, colors: [Color(0xFF139A9A), Color(0xFF36D9D0)]),
  ToolSpec(titleKey: 'magic_title', subtitleKey: 'magic_sub', type: 'magic_edit', icon: Icons.auto_fix_high, colors: [Color(0xFF9C35FF), Color(0xFFE047E6)]),
  ToolSpec(titleKey: 'enhance_title', subtitleKey: 'enhance_sub', type: 'image', icon: Icons.hd_outlined, colors: [Color(0xFF0E77BD), Color(0xFF40D0F5)]),
  ToolSpec(titleKey: 'social_title', subtitleKey: 'social_sub', type: 'product_ad', icon: Icons.campaign_outlined, colors: [Color(0xFF5651D8), Color(0xFF7E6CFF)]),
  ToolSpec(titleKey: 'scene_title', subtitleKey: 'scene_sub', type: 'video', icon: Icons.view_timeline_outlined, colors: [Color(0xFF3B4EC7), Color(0xFF6D7CFF)], isVideo: true),
];

class CreatorHome extends StatefulWidget {
  const CreatorHome({super.key});
  @override
  State<CreatorHome> createState() => _CreatorHomeState();
}

class _CreatorHomeState extends State<CreatorHome> {
  final api = VeyraApi();
  final session = VeyraSession.instance;
  final jobs = <Map<String, dynamic>>[];
  int index = 0;
  int credits = 100;
  String plan = 'free';
  String userId = 'local-preview-user';
  bool backendOnline = false;
  bool checkingBackend = true;
  bool sessionReady = false;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    await session.load(api);
    if (api.configured) {
      await session.ensureCloudSession(api);
    }
    if (!mounted) return;
    setState(() {
      userId = session.userId ?? userId;
      sessionReady = session.signedIn || !api.configured;
    });
    await _refreshBackend();
  }

  Future<bool> _ensureSession() async {
    if (!api.configured) return false;
    if (session.signedIn) {
      api.setToken(session.token);
      if (session.userId != null && userId != session.userId) {
        if (mounted) setState(() => userId = session.userId!);
      }
      return true;
    }
    final ok = await session.ensureCloudSession(api);
    if (ok && mounted) {
      setState(() {
        userId = session.userId ?? userId;
        sessionReady = true;
      });
    }
    return ok;
  }

  Future<void> _refreshBackend() async {
    if (mounted) setState(() => checkingBackend = true);
    var online = await api.health();
    if (online) {
      final authed = await _ensureSession();
      online = authed || !api.configured;
    }

    var nextCredits = credits;
    var nextPlan = plan;
    if (online && session.signedIn) {
      try {
        final wallet = await api.wallet(userId);
        nextCredits = (wallet['credits'] as num?)?.toInt() ?? nextCredits;
        nextPlan = '${wallet['plan'] ?? nextPlan}';
        final cloudJobs = await api.userGenerations(userId);
        jobs
          ..clear()
          ..addAll(cloudJobs);
      } catch (_) {
        online = false;
      }
    }
    if (!mounted) return;
    setState(() {
      backendOnline = online;
      credits = nextCredits;
      plan = nextPlan;
      sessionReady = session.signedIn || !api.configured;
      checkingBackend = false;
    });
  }

  Future<void> _openWallet() async {
    if (api.configured && !await _ensureSession()) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Veyra Cloud oturumu oluşturulamadı.')));
      return;
    }
    if (!mounted) return;
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => CreditWalletPage(
      api: api,
      userId: userId,
      initialCredits: credits,
      backendOnline: backendOnline,
      onWalletChanged: _refreshBackend,
    )));
    await _refreshBackend();
  }

  Future<void> _openTool(ToolSpec tool) async {
    if (api.configured && !await _ensureSession()) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Veyra Cloud oturumu oluşturulamadı.')));
      return;
    }
    if (!mounted) return;
    final result = await Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(builder: (_) => ToolStudioPage(tool: tool, userId: userId, credits: credits, api: api, onWallet: _openWallet)),
    );
    if (result != null) {
      jobs.insert(0, result);
      await _refreshBackend();
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
      StudioHome(credits: credits, backendOnline: backendOnline, checkingBackend: checkingBackend, onRefresh: _refreshBackend, onOpenTool: _openTool, onWallet: _openWallet),
      AllToolsPage(onOpenTool: _openTool),
      ProjectsPage(jobs: jobs, api: api),
      ProfilePage(userId: userId, plan: plan, credits: credits, backendOnline: backendOnline, projectCount: jobs.length, onWallet: _openWallet, onRefresh: _refreshBackend),
    ];
    final labels = [vt(context, 'studio'), vt(context, 'tools'), vt(context, 'projects'), vt(context, 'profile')];
    final icons = const [Icons.auto_awesome, Icons.grid_view_rounded, Icons.folder_outlined, Icons.person_outline];

    return LayoutBuilder(builder: (context, c) {
      final wide = c.maxWidth >= 900;
      if (wide) {
        return Scaffold(body: SafeArea(child: Row(children: [
          NavigationRail(
            selectedIndex: index,
            extended: c.maxWidth >= 1180,
            onDestinationSelected: (v) => setState(() => index = v),
            leading: const Padding(padding: EdgeInsets.symmetric(vertical: 18), child: VeyraMark(size: 42)),
            destinations: List.generate(4, (i) => NavigationRailDestination(icon: Icon(icons[i]), label: Text(labels[i]))),
          ),
          const VerticalDivider(width: 1),
          Expanded(child: _PageFrame(child: pages[index])),
        ])));
      }
      return Scaffold(
        body: SafeArea(child: _PageFrame(child: pages[index])),
        bottomNavigationBar: NavigationBar(
          selectedIndex: index,
          onDestinationSelected: (v) => setState(() => index = v),
          destinations: List.generate(4, (i) => NavigationDestination(icon: Icon(icons[i]), label: labels[i])),
        ),
      );
    });
  }
}

class _PageFrame extends StatelessWidget {
  const _PageFrame({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 1280), child: child));
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
  const StudioHome({super.key, required this.credits, required this.backendOnline, required this.checkingBackend, required this.onRefresh, required this.onOpenTool, required this.onWallet});
  final int credits;
  final bool backendOnline;
  final bool checkingBackend;
  final Future<void> Function() onRefresh;
  final Future<void> Function(ToolSpec) onOpenTool;
  final Future<void> Function() onWallet;

  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (context, c) {
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
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Veyra AI', style: TextStyle(fontSize: 25, fontWeight: FontWeight.w900)),
              Text(vt(context, 'tagline'), style: const TextStyle(color: Colors.white54, fontSize: 12)),
            ])),
            CreditBadge(credits: credits, onTap: onWallet),
          ]),
          const SizedBox(height: 14),
          _BackendBar(online: backendOnline, loading: checkingBackend, configured: VeyraApi.baseUrl.isNotEmpty, onTap: onRefresh),
          const SizedBox(height: 18),
          _HeroCard(onTap: () => onOpenTool(tools.first)),
          const SizedBox(height: 18),
          const _ProBanner(),
          const SizedBox(height: 24),
          Text(vt(context, 'ai_tools'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
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

class _BackendBar extends StatelessWidget {
  const _BackendBar({required this.online, required this.loading, required this.configured, required this.onTap});
  final bool online;
  final bool loading;
  final bool configured;
  final Future<void> Function() onTap;
  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(22),
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
      decoration: BoxDecoration(color: const Color(0xB8141821), borderRadius: BorderRadius.circular(22), border: Border.all(color: Colors.white10)),
      child: Row(children: [
        if (loading)
          const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
        else
          Icon(online ? Icons.cloud_done_outlined : configured ? Icons.cloud_off_outlined : Icons.settings_ethernet_outlined, size: 20, color: online ? Colors.greenAccent : Colors.orangeAccent),
        const SizedBox(width: 10),
        Expanded(child: Text(
          loading ? vt(context, 'cloud_check') : online ? vt(context, 'cloud_on') : configured ? vt(context, 'cloud_off') : 'Veyra Cloud sunucu adresi yapılandırılmadı',
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
        )),
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
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Wrap(spacing: 8, runSpacing: 8, children: [Chip(label: Text('AI CREATE')), Chip(label: Text('VIDEO')), Chip(label: Text('IMAGE')), Chip(label: Text('ADS'))]),
          const SizedBox(height: 34),
          Text(vt(context, 'hero_title'), style: const TextStyle(fontSize: 29, fontWeight: FontWeight.w900)),
          const SizedBox(height: 9),
          Text(vt(context, 'hero_sub')),
          const SizedBox(height: 22),
          Row(children: [const Icon(Icons.auto_awesome, color: CreatorTheme.cyan), const SizedBox(width: 9), Text(vt(context, 'open_video'), style: const TextStyle(fontWeight: FontWeight.w900)), const SizedBox(width: 8), const Icon(Icons.arrow_forward)]),
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
    decoration: BoxDecoration(borderRadius: BorderRadius.circular(24), border: Border.all(color: const Color(0x667A4CFF)), gradient: const LinearGradient(colors: [Color(0xFF22183C), Color(0xFF121827)])),
    child: Row(children: [
      const Icon(Icons.workspace_premium_outlined, color: CreatorTheme.gold, size: 32),
      const SizedBox(width: 13),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Veyra Pro', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
        const SizedBox(height: 3),
        Text(vt(context, 'pro_sub'), style: const TextStyle(color: Colors.white60, fontSize: 12)),
      ])),
      const Icon(Icons.chevron_right),
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
          Container(width: 42, height: 42, decoration: BoxDecoration(gradient: LinearGradient(colors: tool.colors), borderRadius: BorderRadius.circular(15)), child: Icon(tool.icon, color: Colors.white)),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(vt(context, tool.titleKey), style: const TextStyle(fontWeight: FontWeight.w900)),
            const SizedBox(height: 4),
            Text(vt(context, tool.subtitleKey), style: const TextStyle(fontSize: 12, color: Colors.white60)),
          ]),
        ]),
      ),
    ),
  );
}

class ToolStudioPage extends StatefulWidget {
  const ToolStudioPage({super.key, required this.tool, required this.userId, required this.credits, required this.api, required this.onWallet});
  final ToolSpec tool;
  final String userId;
  final int credits;
  final VeyraApi api;
  final Future<void> Function() onWallet;
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
    setState(() { busy = true; statusText = vt(context, 'cost_calc'); });
    try {
      if (!widget.api.configured) throw Exception('Veyra Cloud sunucu adresi yapılandırılmadı');
      final value = await widget.api.quote(type: widget.tool.type, seconds: widget.tool.isVideo ? seconds : 0, quality: quality, audio: widget.tool.isVideo && audio);
      if (!mounted) return;
      setState(() { quote = value; statusText = '${vt(context, 'ready')} • $value ${vt(context, 'credits')}'; });
    } catch (e) {
      if (mounted) setState(() => statusText = '${vt(context, 'server_error')}: $e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _generate() async {
    final text = prompt.text.trim();
    if (text.length < 3 || busy) return;
    setState(() { busy = true; statusText = vt(context, 'analyzing'); });
    try {
      if (!widget.api.configured) throw Exception('Veyra Cloud sunucu adresi yapılandırılmadı');
      if (!await widget.api.health()) throw Exception(vt(context, 'cloud_no'));
      final cost = await widget.api.quote(type: widget.tool.type, seconds: widget.tool.isVideo ? seconds : 0, quality: quality, audio: widget.tool.isVideo && audio);
      if (cost > widget.credits) {
        await widget.onWallet();
        throw Exception('Yetersiz kredi: $cost kredi gerekli');
      }
      if (!mounted) return;
      setState(() { quote = cost; statusText = vt(context, 'queueing'); });
      final created = await widget.api.createGeneration(userId: widget.userId, type: widget.tool.type, prompt: text, seconds: widget.tool.isVideo ? seconds : 0, quality: quality, audio: widget.tool.isVideo && audio, aspectRatio: ratio);
      if (!mounted) return;
      setState(() { job = created; statusText = '${vt(context, 'job_created')} • ${created['status'] ?? 'queued'}'; });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(vt(context, 'success_job'))));
    } catch (e) {
      if (mounted) setState(() => statusText = '${vt(context, 'failed')}: $e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = vt(context, widget.tool.titleKey);
    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        actions: [Padding(padding: const EdgeInsets.only(right: 12), child: Center(child: CreditBadge(credits: widget.credits, onTap: widget.onWallet)))],
      ),
      body: Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 900), child: ListView(padding: const EdgeInsets.all(20), children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(26), gradient: LinearGradient(colors: [widget.tool.colors.first.withValues(alpha: .35), const Color(0xFF141722)])),
          child: Row(children: [
            Container(width: 52, height: 52, decoration: BoxDecoration(gradient: LinearGradient(colors: widget.tool.colors), borderRadius: BorderRadius.circular(16)), child: Icon(widget.tool.icon, color: Colors.white)),
            const SizedBox(width: 14),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900)), const SizedBox(height: 4), Text(vt(context, widget.tool.subtitleKey), style: const TextStyle(color: Colors.white60))])),
          ]),
        ),
        const SizedBox(height: 18),
        TextField(
          key: const Key('generation_prompt'),
          controller: prompt,
          minLines: 6,
          maxLines: 12,
          onChanged: (_) => setState(() => quote = null),
          decoration: InputDecoration(labelText: '$title ${vt(context, 'prompt_for')}', hintText: vt(context, 'prompt_hint'), alignLabelWithHint: true),
        ),
        const SizedBox(height: 14),
        Wrap(spacing: 8, runSpacing: 8, children: ['fast', 'pro'].map((v) => ChoiceChip(label: Text(v == 'fast' ? vt(context, 'fast') : vt(context, 'pro')), selected: quality == v, onSelected: (_) => setState(() { quality = v; quote = null; }))).toList()),
        const SizedBox(height: 12),
        Wrap(spacing: 8, runSpacing: 8, children: ['9:16', '16:9', '1:1'].map((v) => ChoiceChip(label: Text(v), selected: ratio == v, onSelected: (_) => setState(() => ratio = v))).toList()),
        if (widget.tool.isVideo) ...[
          const SizedBox(height: 18),
          Text('${vt(context, 'duration')}: $seconds ${vt(context, 'seconds')}', style: const TextStyle(fontWeight: FontWeight.w800)),
          Slider(value: seconds.toDouble(), min: 4, max: 20, divisions: 4, label: '${seconds}s', onChanged: (v) => setState(() { seconds = v.round(); quote = null; })),
          SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, title: Text(vt(context, 'audio_plan')), subtitle: Text(vt(context, 'audio_sub')), value: audio, onChanged: (v) => setState(() { audio = v; quote = null; })),
        ],
        const SizedBox(height: 14),
        Row(children: [
          Expanded(child: OutlinedButton.icon(onPressed: busy || prompt.text.trim().length < 3 ? null : _quote, icon: const Icon(Icons.calculate_outlined), label: Text(quote == null ? vt(context, 'calc_credit') : '$quote ${vt(context, 'credits')}'))),
          const SizedBox(width: 10),
          Expanded(flex: 2, child: FilledButton.icon(onPressed: busy || prompt.text.trim().length < 3 ? null : _generate, icon: busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.auto_awesome), label: Text(busy ? vt(context, 'processing') : vt(context, 'create')))),
        ]),
        if (statusText != null) ...[
          const SizedBox(height: 16),
          Card(child: Padding(padding: const EdgeInsets.all(16), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [const Icon(Icons.info_outline, color: CreatorTheme.cyan), const SizedBox(width: 10), Expanded(child: Text(statusText!))]))),
        ],
        if (job != null) ...[
          const SizedBox(height: 10),
          Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(vt(context, 'job'), style: const TextStyle(fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            Text('ID: ${job!['id']}'),
            Text('${vt(context, 'status')}: ${job!['status']}'),
            Text('${vt(context, 'provider')}: ${job!['provider']}'),
            Text('${vt(context, 'cost')}: ${job!['cost']} ${vt(context, 'credits')}'),
            const SizedBox(height: 10),
            FilledButton.tonalIcon(onPressed: () => Navigator.of(context).pop(job), icon: const Icon(Icons.folder_outlined), label: Text(vt(context, 'add_projects'))),
          ]))),
        ],
      ]))),
    );
  }
}

class AllToolsPage extends StatelessWidget {
  const AllToolsPage({super.key, required this.onOpenTool});
  final Future<void> Function(ToolSpec) onOpenTool;
  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.all(20), children: [
    Text(vt(context, 'all_tools'), style: const TextStyle(fontSize: 27, fontWeight: FontWeight.w900)),
    const SizedBox(height: 8),
    Text(vt(context, 'all_tools_sub'), style: const TextStyle(color: Colors.white60)),
    const SizedBox(height: 18),
    ...tools.map((tool) => Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Card(child: ListTile(
        leading: Container(width: 44, height: 44, decoration: BoxDecoration(gradient: LinearGradient(colors: tool.colors), borderRadius: BorderRadius.circular(15)), child: Icon(tool.icon, color: Colors.white)),
        title: Text(vt(context, tool.titleKey), style: const TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Text(vt(context, tool.subtitleKey)),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => onOpenTool(tool),
      )),
    )),
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
      final updated = await widget.api.generation('${widget.jobs[i]['id']}');
      if (mounted) setState(() => widget.jobs[i] = updated);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${vt(context, 'status_failed')}: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.jobs.isEmpty) return Center(child: Padding(padding: const EdgeInsets.all(30), child: Text(vt(context, 'no_projects'))));
    return ListView(padding: const EdgeInsets.all(20), children: [
      Text(vt(context, 'projects'), style: const TextStyle(fontSize: 27, fontWeight: FontWeight.w900)),
      const SizedBox(height: 14),
      for (var i = 0; i < widget.jobs.length; i++) Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Card(child: ListTile(
          leading: const Icon(Icons.auto_awesome),
          title: Text('${widget.jobs[i]['type'] ?? 'AI'} • ${widget.jobs[i]['status'] ?? 'unknown'}', style: const TextStyle(fontWeight: FontWeight.w800)),
          subtitle: Text('${widget.jobs[i]['prompt'] ?? ''}', maxLines: 2, overflow: TextOverflow.ellipsis),
          trailing: IconButton(icon: const Icon(Icons.refresh), onPressed: () => _refreshJob(i)),
        )),
      ),
    ]);
  }
}

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key, required this.userId, required this.plan, required this.credits, required this.backendOnline, required this.projectCount, required this.onWallet, required this.onRefresh});
  final String userId;
  final String plan;
  final int credits;
  final bool backendOnline;
  final int projectCount;
  final Future<void> Function() onWallet;
  final Future<void> Function() onRefresh;

  Future<void> _selectLanguage(BuildContext context) async {
    final current = Localizations.localeOf(context).languageCode;
    final selected = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(child: ListView(shrinkWrap: true, children: [
        Padding(padding: const EdgeInsets.fromLTRB(20, 8, 20, 12), child: Text(vt(context, 'language'), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900))),
        ...veyraLanguages.map((lang) => RadioListTile<String>(value: lang.code, groupValue: current, title: Text(lang.nativeLabel), subtitle: Text(lang.label), onChanged: (value) => Navigator.pop(context, value))),
      ])),
    );
    if (selected != null) await VeyraLocaleController.instance.setLanguage(selected);
  }

  @override
  Widget build(BuildContext context) {
    final langCode = Localizations.localeOf(context).languageCode;
    final lang = veyraLanguages.firstWhere((e) => e.code == langCode, orElse: () => veyraLanguages.first);
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(padding: const EdgeInsets.all(20), children: [
        Text(vt(context, 'profile_title'), style: const TextStyle(fontSize: 27, fontWeight: FontWeight.w900)),
        const SizedBox(height: 18),
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(28), gradient: const LinearGradient(colors: [Color(0xFF251A45), Color(0xFF111722)]), border: Border.all(color: Colors.white10)),
          child: Column(children: [
            Row(children: [
              const CircleAvatar(radius: 34, backgroundColor: Color(0xFF5E419B), child: Icon(Icons.person_outline, size: 34)),
              const SizedBox(width: 15),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(vt(context, 'test_user'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                const SizedBox(height: 3),
                Text('ID: $userId', style: const TextStyle(color: Colors.white54, fontSize: 12)),
                const SizedBox(height: 7),
                Wrap(spacing: 7, children: [Chip(label: Text(plan.toUpperCase())), Chip(label: Text(backendOnline ? 'Cloud Online' : 'Cloud Offline'))]),
              ])),
            ]),
            const SizedBox(height: 18),
            Row(children: [
              Expanded(child: _ProfileStat(label: 'Kredi', value: '$credits', icon: Icons.bolt)),
              const SizedBox(width: 10),
              Expanded(child: _ProfileStat(label: 'Projeler', value: '$projectCount', icon: Icons.folder_outlined)),
            ]),
          ]),
        ),
        const SizedBox(height: 14),
        Card(child: ListTile(
          leading: const Icon(Icons.account_balance_wallet_outlined, color: CreatorTheme.gold),
          title: const Text('Kredi Merkezi', style: TextStyle(fontWeight: FontWeight.w900)),
          subtitle: Text('$credits kredi • Paketler • Geçmiş • Satın almalar'),
          trailing: const Icon(Icons.chevron_right),
          onTap: onWallet,
        )),
        Card(child: ListTile(leading: const Icon(Icons.language), title: Text(vt(context, 'language')), subtitle: Text('${vt(context, 'language_sub')} • ${lang.nativeLabel}'), trailing: const Icon(Icons.chevron_right), onTap: () => _selectLanguage(context))),
        Card(child: ListTile(leading: const Icon(Icons.workspace_premium_outlined), title: const Text('Veyra Pro'), subtitle: Text(vt(context, 'pro_account_sub')), trailing: const Icon(Icons.chevron_right), onTap: onWallet)),
        Card(child: ListTile(leading: const Icon(Icons.shield_outlined), title: Text(vt(context, 'privacy')), subtitle: Text(vt(context, 'privacy_sub')), trailing: const Icon(Icons.chevron_right))),
      ]),
    );
  }
}

class _ProfileStat extends StatelessWidget {
  const _ProfileStat({required this.label, required this.value, required this.icon});
  final String label;
  final String value;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(color: Colors.white.withValues(alpha: .045), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white10)),
    child: Row(children: [Icon(icon, color: CreatorTheme.cyan), const SizedBox(width: 10), Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)), Text(label, style: const TextStyle(color: Colors.white54, fontSize: 12))])]),
  );
}

class CreditBadge extends StatelessWidget {
  const CreditBadge({super.key, required this.credits, required this.onTap});
  final int credits;
  final Future<void> Function() onTap;
  @override
  Widget build(BuildContext context) => InkWell(
    borderRadius: BorderRadius.circular(30),
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(color: Colors.white.withValues(alpha: .055), borderRadius: BorderRadius.circular(30), border: Border.all(color: Colors.white12)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [const Icon(Icons.bolt, size: 18, color: CreatorTheme.gold), const SizedBox(width: 6), Text('$credits ${vt(context, 'credits')}', style: const TextStyle(fontWeight: FontWeight.w800))]),
    ),
  );
}

class _TrustStrip extends StatelessWidget {
  const _TrustStrip();
  @override
  Widget build(BuildContext context) => Wrap(alignment: WrapAlignment.spaceBetween, spacing: 18, runSpacing: 12, children: [
    _Trust(Icons.auto_awesome, vt(context, 'routing')),
    _Trust(Icons.hd_outlined, vt(context, 'hd_tools')),
    _Trust(Icons.lock_outline, vt(context, 'secure')),
    _Trust(Icons.storefront_outlined, vt(context, 'commercial')),
  ]);
}

class _Trust extends StatelessWidget {
  const _Trust(this.icon, this.text);
  final IconData icon;
  final String text;
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [Icon(icon, size: 18, color: CreatorTheme.cyan), const SizedBox(width: 7), Text(text, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700))]);
}
