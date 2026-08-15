import 'package:flutter/material.dart';

void main() => runApp(const CreatorAIApp());

class CreatorAIApp extends StatelessWidget {
  const CreatorAIApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'CreatorAI',
      theme: ThemeData(
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF8B5CF6),
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xFF09090F),
        useMaterial3: true,
      ),
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
  final int credits;
  final VoidCallback onVideo;
  const HomeTab({super.key, required this.credits, required this.onVideo});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Row(
          children: [
            const Expanded(child: Text('CreatorAI', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800))),
            Chip(avatar: const Icon(Icons.bolt, size: 18), label: Text('$credits credits')),
          ],
        ),
        const SizedBox(height: 8),
        Text('Create studio-quality content with AI.', style: TextStyle(color: Colors.white.withValues(alpha: .65))),
        const SizedBox(height: 24),
        _HeroCard(onTap: onVideo),
        const SizedBox(height: 24),
        const Text('Create', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 2,
          childAspectRatio: 1.35,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          children: const [
            _ToolCard(Icons.image_outlined, 'Image Studio', 'Enhance & transform'),
            _ToolCard(Icons.shopping_bag_outlined, 'Product Ads', 'Sell with better visuals'),
            _ToolCard(Icons.face_retouching_natural, 'AI Headshot', 'Professional portraits'),
            _ToolCard(Icons.auto_fix_high, 'Magic Edit', 'Edit with a prompt'),
          ],
        ),
      ],
    );
  }
}

class _HeroCard extends StatelessWidget {
  final VoidCallback onTap;
  const _HeroCard({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: const Padding(
          padding: EdgeInsets.all(22),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(Icons.movie_filter_outlined, size: 42),
            SizedBox(height: 26),
            Text('AI Video Studio', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
            SizedBox(height: 6),
            Text('Prompt → cinematic video. Control duration, ratio, style and camera.'),
            SizedBox(height: 18),
            Row(children: [Text('Start creating', style: TextStyle(fontWeight: FontWeight.w700)), SizedBox(width: 6), Icon(Icons.arrow_forward)]),
          ]),
        ),
      ),
    );
  }
}

class _ToolCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  const _ToolCard(this.icon, this.title, this.subtitle);

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Icon(icon),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
            Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: .55))),
          ]),
        ]),
      ),
    );
  }
}

class VideoStudio extends StatefulWidget {
  final int credits;
  const VideoStudio({super.key, required this.credits});

  @override
  State<VideoStudio> createState() => _VideoStudioState();
}

class _VideoStudioState extends State<VideoStudio> {
  final prompt = TextEditingController();
  int seconds = 4;
  String ratio = '9:16';
  String quality = 'Fast';

  int get cost => seconds * (quality == 'Pro' ? 8 : 5);

  @override
  void dispose() {
    prompt.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Row(children: [
          const Expanded(child: Text('Video Studio', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800))),
          Chip(label: Text('${widget.credits} credits')),
        ]),
        const SizedBox(height: 18),
        TextField(
          controller: prompt,
          minLines: 5,
          maxLines: 8,
          decoration: const InputDecoration(
            labelText: 'Describe your video',
            hintText: 'A luxury perfume bottle on black marble, cinematic light, slow camera orbit…',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(onPressed: () {}, icon: const Icon(Icons.add_photo_alternate_outlined), label: const Text('Add reference image')),
        const SizedBox(height: 22),
        const Text('Duration', style: TextStyle(fontWeight: FontWeight.w700)),
        Slider(value: seconds.toDouble(), min: 4, max: 20, divisions: 4, label: '${seconds}s', onChanged: (v) => setState(() => seconds = v.round())),
        Wrap(spacing: 8, children: ['9:16', '16:9', '1:1'].map((v) => ChoiceChip(label: Text(v), selected: ratio == v, onSelected: (_) => setState(() => ratio = v))).toList()),
        const SizedBox(height: 14),
        Wrap(spacing: 8, children: ['Fast', 'Pro'].map((v) => ChoiceChip(label: Text(v), selected: quality == v, onSelected: (_) => setState(() => quality = v))).toList()),
        const SizedBox(height: 28),
        FilledButton.icon(
          onPressed: prompt.text.trim().isEmpty || cost > widget.credits ? null : () {},
          icon: const Icon(Icons.auto_awesome),
          label: Text('Generate • $cost credits'),
        ),
        const SizedBox(height: 10),
        Text('V1 preview: generation API will be connected through the secure CreatorAI backend.', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: .5))),
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
