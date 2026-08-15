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
  final int credits = 100;

  @override
  Widget build(BuildContext context) {
    final pages = <Widget>[
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
      padding: const EdgeInsets.all(20),
      children: [
        Row(children: [
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
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('CreatorAI', style: TextStyle(fontSize: 25, fontWeight: FontWeight.w900)),
              Text('Your intelligent content studio', style: TextStyle(color: Colors.white54, fontSize: 12)),
            ]),
          ),
          _CreditBadge(credits: credits),
        ]),
        const SizedBox(height: 24),
        Card(
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onVideo,
            child: Container(
              padding: const EdgeInsets.all(22),
              decoration: const BoxDecoration(
                gradient: LinearGradient(colors: [Color(0xFF2A1D53), Color(0xFF121827), Color(0xFF0B2C38)]),
              ),
              child: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(Icons.movie_filter_outlined, size: 42),
                SizedBox(height: 40),
                Text('AI Video Studio', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
                SizedBox(height: 8),
                Text('Prompt, scene planning, camera direction, reference consistency and quality checks.'),
                SizedBox(height: 18),
                Row(children: [Text('Open studio', style: TextStyle(fontWeight: FontWeight.w800)), SizedBox(width: 8), Icon(Icons.arrow_forward)]),
              ]),
            ),
          ),
        ),
        const SizedBox(height: 24),
        const Text('Create with AI', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
        const SizedBox(height: 12),
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 2,
          childAspectRatio: 1.25,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          children: const [
            _ToolCard(Icons.image_outlined, 'Image Studio', 'Create & enhance'),
            _ToolCard(Icons.shopping_bag_outlined, 'Product Ads', 'Sales visuals'),
            _ToolCard(Icons.face_retouching_natural, 'AI Headshot', 'Portrait studio'),
            _ToolCard(Icons.auto_fix_high, 'Magic Edit', 'Prompt editing'),
          ],
        ),
      ],
    );
  }
}

class _ToolCard extends StatelessWidget {
  const _ToolCard(this.icon, this.title, this.subtitle);
  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Icon(icon),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
            Text(subtitle, style: const TextStyle(fontSize: 12, color: Colors.white54)),
          ]),
        ]),
      ),
    );
  }
}

class _CreditBadge extends StatelessWidget {
  const _CreditBadge({required this.credits});
  final int credits;

  @override
  Widget build(BuildContext context) {
    return Chip(
      avatar: const Icon(Icons.bolt, size: 18, color: CreatorTheme.gold),
      label: Text('$credits credits'),
    );
  }
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
      padding: const EdgeInsets.all(20),
      children: [
        Row(children: [
          const Expanded(child: Text('Video Studio', style: TextStyle(fontSize: 27, fontWeight: FontWeight.w900))),
          _CreditBadge(credits: widget.credits),
        ]),
        const SizedBox(height: 18),
        SegmentedButton<CreatorMode>(
          segments: const [
            ButtonSegment(value: CreatorMode.smart, icon: Icon(Icons.auto_awesome), label: Text('Smart')),
            ButtonSegment(value: CreatorMode.director, icon: Icon(Icons.tune), label: Text('Director')),
          ],
          selected: {mode},
          onSelectionChanged: (value) => setState(() => mode = value.first),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: prompt,
          onChanged: (_) => setState(() {}),
          minLines: 6,
          maxLines: 10,
          decoration: const InputDecoration(
            labelText: 'What should CreatorAI make?',
            hintText: 'A premium product commercial with cinematic lighting and a slow camera orbit…',
            alignLabelWithHint: true,
          ),
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('AI Orchestration', style: TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              Text('${preview.capabilities.length} specialist roles are prepared for this request.'),
            ]),
          ),
        ),
        const SizedBox(height: 18),
        const Text('Duration', style: TextStyle(fontWeight: FontWeight.w800)),
        Slider(
          value: seconds.toDouble(),
          min: 4,
          max: 20,
          divisions: 4,
          label: '${seconds}s',
          onChanged: (value) => setState(() => seconds = value.round()),
        ),
        Wrap(spacing: 8, children: ['9:16', '16:9', '1:1'].map((value) {
          return ChoiceChip(label: Text(value), selected: ratio == value, onSelected: (_) => setState(() => ratio = value));
        }).toList()),
        const SizedBox(height: 12),
        Wrap(spacing: 8, children: ['Fast', 'Pro'].map((value) {
          return ChoiceChip(label: Text(value), selected: quality == value, onSelected: (_) => setState(() => quality = value));
        }).toList()),
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          title: const Text('Keep product / character consistent'),
          value: preserveSubject,
          onChanged: (value) => setState(() => preserveSubject = value),
        ),
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          title: const Text('Generate audio plan'),
          value: audio,
          onChanged: (value) => setState(() => audio = value),
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: canGenerate ? () {} : null,
          icon: const Icon(Icons.auto_awesome),
          label: Text('Create with AI • $cost credits'),
        ),
      ],
    );
  }
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
