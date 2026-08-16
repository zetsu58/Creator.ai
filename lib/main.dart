import 'package:flutter/material.dart';
import 'core/ai/prompt_plan.dart';
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

class CreatorHome extends StatefulWidget {
  const CreatorHome({super.key});

  @override
  State<CreatorHome> createState() => _CreatorHomeState();
}

class _CreatorHomeState extends State<CreatorHome> {
  int index = 0;
  final int credits = 100;

  @override
  Widget build(BuildContext context) {
    final pages = <Widget>[
      HomeTab(credits: credits, onVideo: () => setState(() => index = 1)),
      VideoStudio(credits: credits),
      const ProjectsTab(),
      const ProfileTab(),
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
                leading: const Padding(
                  padding: EdgeInsets.symmetric(vertical: 18),
                  child: VeyraMark(size: 42),
                ),
                destinations: const [
                  NavigationRailDestination(icon: Icon(Icons.auto_awesome), label: Text('Studio')),
                  NavigationRailDestination(icon: Icon(Icons.movie_creation_outlined), label: Text('Video')),
                  NavigationRailDestination(icon: Icon(Icons.folder_outlined), label: Text('Projects')),
                  NavigationRailDestination(icon: Icon(Icons.person_outline), label: Text('Profile')),
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
            NavigationDestination(icon: Icon(Icons.movie_creation_outlined), label: 'Video'),
            NavigationDestination(icon: Icon(Icons.folder_outlined), label: 'Projects'),
            NavigationDestination(icon: Icon(Icons.person_outline), label: 'Profile'),
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
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1280),
          child: child,
        ),
      );
}

class VeyraMark extends StatelessWidget {
  const VeyraMark({super.key, this.size = 46});
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF663CFF), Color(0xFFD74BFF), Color(0xFF25C5FF)],
        ),
        borderRadius: BorderRadius.circular(size * .3),
        boxShadow: const [BoxShadow(blurRadius: 24, color: Color(0x55683CFF))],
      ),
      child: Icon(Icons.auto_awesome, color: Colors.white, size: size * .52),
    );
  }
}

class HomeTab extends StatelessWidget {
  const HomeTab({super.key, required this.credits, required this.onVideo});
  final int credits;
  final VoidCallback onVideo;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      final columns = c.maxWidth >= 1050 ? 4 : c.maxWidth >= 650 ? 3 : 2;
      return ListView(
        key: const Key('veyra_home'),
        padding: EdgeInsets.all(c.maxWidth >= 900 ? 28 : 20),
        children: [
          Row(children: [
            const VeyraMark(),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Veyra AI', style: TextStyle(fontSize: 25, fontWeight: FontWeight.w900)),
                Text('Create. Imagine. Inspire.', style: TextStyle(color: Colors.white54, fontSize: 12)),
              ]),
            ),
            _CreditBadge(credits: credits),
          ]),
          const SizedBox(height: 22),
          _HeroCard(onTap: onVideo),
          const SizedBox(height: 20),
          const _ProBanner(),
          const SizedBox(height: 26),
          const Row(children: [
            Expanded(child: Text('Create with AI', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900))),
            Text('All tools', style: TextStyle(color: CreatorTheme.cyan, fontWeight: FontWeight.w700)),
          ]),
          const SizedBox(height: 12),
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: columns,
            childAspectRatio: columns >= 3 ? 1.35 : 1.1,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            children: const [
              _ToolCard(Icons.movie_creation_outlined, 'Video Studio', 'Text or image to cinematic video', [Color(0xFF6B3CFF), Color(0xFF9C35FF)]),
              _ToolCard(Icons.image_outlined, 'Image Studio', 'Generate, edit and enhance', [Color(0xFF126BDF), Color(0xFF25C5FF)]),
              _ToolCard(Icons.shopping_bag_outlined, 'Product Ads', 'Turn products into sales creatives', [Color(0xFFEB6A28), Color(0xFFFFA53B)]),
              _ToolCard(Icons.face_retouching_natural, 'Headshot AI', 'Professional portrait studio', [Color(0xFF139A9A), Color(0xFF36D9D0)]),
              _ToolCard(Icons.auto_fix_high, 'Magic Edit', 'Describe exactly what should change', [Color(0xFF9C35FF), Color(0xFFE047E6)]),
              _ToolCard(Icons.hd_outlined, 'Enhance & Upscale', 'Sharper HD and 4K-ready output', [Color(0xFF0E77BD), Color(0xFF40D0F5)]),
              _ToolCard(Icons.campaign_outlined, 'Social Creator', 'Posts, stories and campaign assets', [Color(0xFF5651D8), Color(0xFF7E6CFF)]),
              _ToolCard(Icons.view_timeline_outlined, 'Scene Director', 'Control every video scene', [Color(0xFF3B4EC7), Color(0xFF6D7CFF)]),
            ],
          ),
          const SizedBox(height: 28),
          const _TrustStrip(),
        ],
      );
    });
  }
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
            constraints: const BoxConstraints(minHeight: 240),
            padding: const EdgeInsets.all(24),
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF301C66), Color(0xFF17162D), Color(0xFF082F45)],
              ),
            ),
            child: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Wrap(spacing: 8, runSpacing: 8, children: [
                Chip(label: Text('AI CREATE')),
                Chip(label: Text('VIDEO')),
                Chip(label: Text('IMAGE')),
                Chip(label: Text('ADS')),
              ]),
              SizedBox(height: 36),
              Text('One intelligent studio for everything you want to create.', style: TextStyle(fontSize: 29, fontWeight: FontWeight.w900)),
              SizedBox(height: 9),
              Text('From an idea to a polished image, cinematic video or product campaign — without leaving Veyra AI.'),
              SizedBox(height: 22),
              Row(children: [
                Icon(Icons.auto_awesome, color: CreatorTheme.cyan),
                SizedBox(width: 9),
                Text('Start creating', style: TextStyle(fontWeight: FontWeight.w900)),
                SizedBox(width: 8),
                Icon(Icons.arrow_forward),
              ]),
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
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: const Color(0x667A4CFF)),
          gradient: const LinearGradient(colors: [Color(0xFF22183C), Color(0xFF121827)]),
        ),
        child: const Row(children: [
          Icon(Icons.workspace_premium_outlined, color: CreatorTheme.gold, size: 32),
          SizedBox(width: 13),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Veyra Pro', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
            SizedBox(height: 3),
            Text('Premium models • higher quality • no ads • commercial creator tools', style: TextStyle(color: Colors.white60, fontSize: 12)),
          ])),
          Icon(Icons.chevron_right),
        ]),
      );
}

class _ToolCard extends StatelessWidget {
  const _ToolCard(this.icon, this.title, this.subtitle, this.colors);
  final IconData icon;
  final String title;
  final String subtitle;
  final List<Color> colors;

  @override
  Widget build(BuildContext context) => Card(
        clipBehavior: Clip.antiAlias,
        child: Container(
          padding: const EdgeInsets.all(15),
          decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [colors.first.withValues(alpha: .28), const Color(0xFF151822)])),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(gradient: LinearGradient(colors: colors), borderRadius: BorderRadius.circular(13)),
              child: Icon(icon, color: Colors.white),
            ),
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
              const SizedBox(height: 4),
              Text(subtitle, style: const TextStyle(fontSize: 12, color: Colors.white60)),
            ]),
          ]),
        ),
      );
}

class _TrustStrip extends StatelessWidget {
  const _TrustStrip();

  @override
  Widget build(BuildContext context) => const Wrap(
        alignment: WrapAlignment.spaceBetween,
        spacing: 18,
        runSpacing: 12,
        children: [
          _Trust(Icons.auto_awesome, 'Smart AI routing'),
          _Trust(Icons.hd_outlined, 'HD / 4K tools'),
          _Trust(Icons.lock_outline, 'Private by design'),
          _Trust(Icons.storefront_outlined, 'Commercial tools'),
        ],
      );
}

class _Trust extends StatelessWidget {
  const _Trust(this.icon, this.text);
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [Icon(icon, size: 18, color: CreatorTheme.cyan), const SizedBox(width: 7), Text(text, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700))]);
}

class _CreditBadge extends StatelessWidget {
  const _CreditBadge({required this.credits});
  final int credits;

  @override
  Widget build(BuildContext context) => Chip(
        avatar: const Icon(Icons.bolt, size: 18, color: CreatorTheme.gold),
        label: Text('$credits credits'),
      );
}

class VideoStudio extends StatefulWidget {
  const VideoStudio({super.key, required this.credits});
  final int credits;

  @override
  State<VideoStudio> createState() => _VideoStudioState();
}

class _VideoStudioState extends State<VideoStudio> {
  final prompt = TextEditingController();
  int seconds = 8;
  String ratio = '9:16';
  String quality = 'Fast';
  CreatorMode mode = CreatorMode.smart;
  bool preserveSubject = true;
  bool audio = true;

  int get cost => seconds * (quality == 'Pro' ? 8 : 5) + (audio ? 8 : 0);

  CreatorPromptPlan get preview => PromptPlanPreview.build(
        prompt: prompt.text,
        mode: mode,
        aspectRatio: ratio,
        durationSeconds: seconds,
        qualityProfile: quality,
      );

  @override
  void dispose() {
    prompt.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final canGenerate = prompt.text.trim().isNotEmpty && cost <= widget.credits;
    return LayoutBuilder(builder: (context, c) {
      final wide = c.maxWidth >= 850;
      final editor = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SegmentedButton<CreatorMode>(
          segments: const [
            ButtonSegment(value: CreatorMode.smart, icon: Icon(Icons.auto_awesome), label: Text('Smart')),
            ButtonSegment(value: CreatorMode.director, icon: Icon(Icons.tune), label: Text('Director')),
          ],
          selected: {mode},
          onSelectionChanged: (v) => setState(() => mode = v.first),
        ),
        const SizedBox(height: 14),
        TextField(
          key: const Key('video_prompt'),
          controller: prompt,
          onChanged: (_) => setState(() {}),
          minLines: 7,
          maxLines: 12,
          decoration: const InputDecoration(
            labelText: 'Describe your video',
            hintText: 'A luxury perfume commercial at night, cinematic lighting, slow camera orbit, precise product consistency and natural ambience…',
            alignLabelWithHint: true,
          ),
        ),
        const SizedBox(height: 18),
        const Text('Duration', style: TextStyle(fontWeight: FontWeight.w800)),
        Slider(value: seconds.toDouble(), min: 4, max: 20, divisions: 4, label: '${seconds}s', onChanged: (v) => setState(() => seconds = v.round())),
        Wrap(spacing: 8, runSpacing: 8, children: ['9:16', '16:9', '1:1'].map((v) => ChoiceChip(label: Text(v), selected: ratio == v, onSelected: (_) => setState(() => ratio = v))).toList()),
        const SizedBox(height: 12),
        Wrap(spacing: 8, runSpacing: 8, children: ['Fast', 'Pro'].map((v) => ChoiceChip(label: Text(v), selected: quality == v, onSelected: (_) => setState(() => quality = v))).toList()),
        SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, title: const Text('Preserve product / character'), subtitle: const Text('Keep important visual identity consistent'), value: preserveSubject, onChanged: (v) => setState(() => preserveSubject = v)),
        SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, title: const Text('Audio plan'), subtitle: const Text('Prepare ambience, effects and voice direction'), value: audio, onChanged: (v) => setState(() => audio = v)),
        const SizedBox(height: 8),
        FilledButton.icon(onPressed: canGenerate ? () {} : null, icon: const Icon(Icons.auto_awesome), label: Text('Create with Veyra • $cost credits')),
      ]);

      final inspector = Card(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Veyra Intelligence', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            const SizedBox(height: 7),
            const Text('Your request is routed through the specialist roles needed for the job.', style: TextStyle(color: Colors.white60)),
            const SizedBox(height: 18),
            _InspectorLine('Specialists', '${preview.capabilities.length} roles'),
            _InspectorLine('Output', '$seconds sec • $ratio • $quality'),
            _InspectorLine('Estimated cost', '$cost credits'),
            const Divider(height: 28),
            const Text('Quality safeguards', style: TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 9),
            const Text('✓ Prompt intent check\n✓ Subject consistency\n✓ Scene planning\n✓ Output quality review', style: TextStyle(color: Colors.white70, height: 1.7)),
          ]),
        ),
      );

      return ListView(
        key: const Key('video_studio'),
        padding: EdgeInsets.all(wide ? 28 : 20),
        children: [
          Row(children: [
            const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Video Studio', style: TextStyle(fontSize: 27, fontWeight: FontWeight.w900)),
              Text('Turn an idea into a directed AI video', style: TextStyle(color: Colors.white54)),
            ])),
            _CreditBadge(credits: widget.credits),
          ]),
          const SizedBox(height: 18),
          if (wide)
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(flex: 3, child: editor), const SizedBox(width: 18), Expanded(flex: 2, child: inspector)])
          else ...[editor, const SizedBox(height: 16), inspector],
        ],
      );
    });
  }
}

class _InspectorLine extends StatelessWidget {
  const _InspectorLine(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(children: [Expanded(child: Text(label, style: const TextStyle(color: Colors.white54))), Text(value, style: const TextStyle(fontWeight: FontWeight.w800))]),
      );
}

class ProjectsTab extends StatelessWidget {
  const ProjectsTab({super.key});

  @override
  Widget build(BuildContext context) => const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.folder_copy_outlined, size: 52, color: CreatorTheme.cyan),
            SizedBox(height: 14),
            Text('Your Veyra projects', style: TextStyle(fontSize: 21, fontWeight: FontWeight.w900)),
            SizedBox(height: 6),
            Text('Images, videos and campaigns will sync here across your devices.', textAlign: TextAlign.center),
          ]),
        ),
      );
}

class ProfileTab extends StatelessWidget {
  const ProfileTab({super.key});

  @override
  Widget build(BuildContext context) => const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            VeyraMark(size: 64),
            SizedBox(height: 14),
            Text('Veyra AI', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
            SizedBox(height: 5),
            Text('Free plan • 100 credits'),
            SizedBox(height: 18),
            Chip(avatar: Icon(Icons.workspace_premium_outlined), label: Text('Upgrade to Veyra Pro')),
          ]),
        ),
      );
}
