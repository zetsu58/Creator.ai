import 'package:flutter/material.dart';
import 'core/ai/prompt_plan.dart';
import 'core/design/creator_theme.dart';

void main() => runApp(const CreatorAIApp());

class CreatorAIApp extends StatelessWidget {
  const CreatorAIApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'CreatorAI',
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
  int credits = 100;

  @override
  Widget build(BuildContext context) {
    final pages = [
      HomeTab(credits: credits, onVideo: () => setState(() => index = 1)),
      VideoStudio(credits: credits),
      const ProjectsTab(),
      const ProfileTab(),
    ];

    return Scaffold(
      body: SafeArea(child: pages[index]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (value) => setState(() => index = value),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.auto_awesome), label: 'Studio'),
          NavigationDestination(icon: Icon(Icons.movie_creation_outlined), label: 'Video'),
          NavigationDestination(icon: Icon(Icons.folder_outlined), label: 'Projects'),
          NavigationDestination(icon: Icon(Icons.person_outline), label: 'Profile'),
        ],
      ),
    );
  }
}

class HomeTab extends StatelessWidget {
  const HomeTab({super.key, required this.credits, required this.onVideo});
  final int credits;
  final VoidCallback onVideo;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
      children: [
        Row(
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [CreatorTheme.violet, CreatorTheme.cyan]),
                borderRadius: BorderRadius.circular(15),
              ),
              child: const Icon(Icons.auto_awesome, color: Colors.white),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('CreatorAI', style: TextStyle(fontSize: 25, fontWeight: FontWeight.w900)),
                  Text('Your intelligent content studio', style: TextStyle(color: Colors.white54, fontSize: 12)),
                ],
              ),
            ),
            _CreditBadge(credits: credits),
          ],
        ),
        const SizedBox(height: 24),
        _HeroCard(onTap: onVideo),
        const SizedBox(height: 26),
        const _SectionTitle('Create with AI', 'One request, specialist AI orchestration behind the scenes.'),
        const SizedBox(height: 13),
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 2,
          childAspectRatio: 1.22,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          children: const [
            _ToolCard(Icons.image_outlined, 'Image Studio', 'Create, enhance & edit'),
            _ToolCard(Icons.shopping_bag_outlined, 'Product Ads', 'Brand-safe sales visuals'),
            _ToolCard(Icons.face_retouching_natural, 'AI Headshot', 'Professional portraits'),
            _ToolCard(Icons.auto_fix_high, 'Magic Edit', 'Describe the exact change'),
          ],
        ),
      ],
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF2A1D53), Color(0xFF121827), Color(0xFF0B2C38)],
        ),
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: const Color(0xFF343D52)),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(26),
          onTap: onTap,
          child: const Padding(
            padding: EdgeInsets.all(23),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _MiniPill(icon: Icons.movie_filter_outlined, text: 'AI VIDEO'),
                    Spacer(),
                    _MiniPill(icon: Icons.auto_awesome, text: 'SMART MODE'),
                  ],
                ),
                SizedBox(height: 54),
                Text('Turn an idea into a directed video.', style: TextStyle(fontSize: 26, height: 1.05, fontWeight: FontWeight.w900)),
                SizedBox(height: 9),
                Text('CreatorAI understands intent, plans scenes, directs camera and checks the result before delivery.', style: TextStyle(color: Colors.white70, height: 1.4)),
                SizedBox(height: 21),
                Row(children: [Text('Open Video Studio', style: TextStyle(fontWeight: FontWeight.w800)), SizedBox(width: 7), Icon(Icons.arrow_forward_rounded)]),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MiniPill extends StatelessWidget {
  const _MiniPill({required this.icon, required this.text});
  final IconData icon;
  final String text;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(color: Colors.white.withValues(alpha: .08), borderRadius: BorderRadius.circular(99), border: Border.all(color: Colors.white12)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [Icon(icon, size: 14), const SizedBox(width: 6), Text(text, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: .6))]),
      );
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.title, this.subtitle);
  final String title;
  final String subtitle;
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w850)), const SizedBox(height: 4), Text(subtitle, style: const TextStyle(color: Colors.white54))]);
}

class _CreditBadge extends StatelessWidget {
  const _CreditBadge({required this.credits});
  final int credits;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(color: const Color(0x20FFD76A), borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0x55FFD76A))),
        child: Row(mainAxisSize: MainAxisSize.min, children: [const Icon(Icons.bolt, size: 17, color: CreatorTheme.gold), const SizedBox(width: 4), Text('$credits', style: const TextStyle(fontWeight: FontWeight.w900))]),
      );
}

class _ToolCard extends StatelessWidget {
  const _ToolCard(this.icon, this.title, this.subtitle);
  final IconData icon;
  final String title;
  final String subtitle;
  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(15),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Container(width: 39, height: 39, decoration: BoxDecoration(color: const Color(0x228B5CF6), borderRadius: BorderRadius.circular(12)), child: Icon(icon, size: 21)),
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(fontWeight: FontWeight.w800)), const SizedBox(height: 3), Text(subtitle, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: Colors.white54))]),
          ]),
        ),
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
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 30),
      children: [
        Row(children: [const Expanded(child: Text('Video Studio', style: TextStyle(fontSize: 27, fontWeight: FontWeight.w900))), _CreditBadge(credits: widget.credits)]),
        const SizedBox(height: 6),
        const Text('Describe naturally. CreatorAI turns your request into a production plan.', style: TextStyle(color: Colors.white54)),
        const SizedBox(height: 20),
        SegmentedButton<CreatorMode>(
          segments: const [ButtonSegment(value: CreatorMode.smart, icon: Icon(Icons.auto_awesome), label: Text('Smart')), ButtonSegment(value: CreatorMode.director, icon: Icon(Icons.tune), label: Text('Director'))],
          selected: {mode},
          onSelectionChanged: (v) => setState(() => mode = v.first),
        ),
        const SizedBox(height: 15),
        TextField(
          controller: prompt,
          onChanged: (_) => setState(() {}),
          minLines: 6,
          maxLines: 10,
          decoration: const InputDecoration(
            labelText: 'What should CreatorAI make?',
            hintText: 'Example: A black sports car driving through rainy Istanbul at night. Premium automotive commercial, neon reflections, front tracking shot then right-side orbit…',
            alignLabelWithHint: true,
          ),
        ),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          ActionChip(avatar: const Icon(Icons.auto_fix_high, size: 16), label: const Text('Promptumu Güçlendir'), onPressed: () {}),
          ActionChip(avatar: const Icon(Icons.view_timeline_outlined, size: 16), label: const Text('Sahnelere Böl'), onPressed: () => setState(() => mode = CreatorMode.director)),
          ActionChip(avatar: const Icon(Icons.add_photo_alternate_outlined, size: 16), label: const Text('Referans Ekle'), onPressed: () {}),
        ]),
        const SizedBox(height: 20),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Row(children: [Icon(Icons.psychology_alt_outlined), SizedBox(width: 8), Text('AI Orchestration', style: TextStyle(fontWeight: FontWeight.w850))]),
              const SizedBox(height: 7),
              Text('${preview.capabilities.length} specialist roles will be prepared for this request.', style: const TextStyle(color: Colors.white60)),
              const SizedBox(height: 12),
              Wrap(spacing: 7, runSpacing: 7, children: preview.capabilities.take(8).map((c) => _CapabilityChip(c.name)).toList()),
            ]),
          ),
        ),
        const SizedBox(height: 18),
        const Text('Duration', style: TextStyle(fontWeight: FontWeight.w800)),
        Slider(value: seconds.toDouble(), min: 4, max: 20, divisions: 4, label: '${seconds}s', onChanged: (v) => setState(() => seconds = v.round())),
        Wrap(spacing: 8, runSpacing: 8, children: ['9:16', '16:9', '1:1'].map((v) => ChoiceChip(label: Text(v), selected: ratio == v, onSelected: (_) => setState(() => ratio = v))).toList()),
        const SizedBox(height: 12),
        Wrap(spacing: 8, runSpacing: 8, children: ['Fast', 'Pro'].map((v) => ChoiceChip(label: Text(v), selected: quality == v, onSelected: (_) => setState(() => quality = v))).toList()),
        const SizedBox(height: 13),
        SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, title: const Text('Keep product / character consistent'), subtitle: const Text('Protect reference identity when the selected model supports it.'), value: preserveSubject, onChanged: (v) => setState(() => preserveSubject = v)),
        SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, title: const Text('Generate audio plan'), subtitle: const Text('Ambience, effects, dialogue or music when supported.'), value: audio, onChanged: (v) => setState(() => audio = v)),
        const SizedBox(height: 18),
        FilledButton.icon(onPressed: canGenerate ? () {} : null, icon: const Icon(Icons.auto_awesome), label: Text('Create with AI • $cost credits')),
        const SizedBox(height: 9),
        Text(canGenerate ? 'Final cost and provider are revalidated securely by the backend before generation.' : 'Write a prompt and keep the estimated cost within your credit balance.', textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, color: Colors.white46)),
      ],
    );
  }
}

class _CapabilityChip extends StatelessWidget {
  const _CapabilityChip(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Container(padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6), decoration: BoxDecoration(color: const Color(0x1F55D6FF), borderRadius: BorderRadius.circular(99), border: Border.all(color: const Color(0x3855D6FF))), child: Text(text, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700)));
}

class ProjectsTab extends StatelessWidget {
  const ProjectsTab({super.key});
  @override
  Widget build(BuildContext context) => const Center(child: Text('Your generations will appear here.'));
}

class ProfileTab extends StatelessWidget {
  const ProfileTab({super.key});
  @override
  Widget build(BuildContext context) => const Center(child: Text('CreatorAI Profile'));
}
