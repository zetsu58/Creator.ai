import 'package:flutter/material.dart';

import 'core/api/veyra_api.dart';
import 'core/auth/veyra_session.dart';
import 'core/design/creator_theme.dart';
import 'core/localization/veyra_locale.dart';
import 'main_legacy.dart' as legacy;
import 'screens/image_to_video_screen.dart';
import 'screens/my_videos_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await VeyraLocaleController.instance.load();
  runApp(const VeyraRootApp());
}

class VeyraRootApp extends StatelessWidget {
  const VeyraRootApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Veyra AI',
      theme: CreatorTheme.dark(),
      home: const _VeyraRootShell(),
    );
  }
}

class _VeyraRootShell extends StatefulWidget {
  const _VeyraRootShell();

  @override
  State<_VeyraRootShell> createState() => _VeyraRootShellState();
}

class _VeyraRootShellState extends State<_VeyraRootShell> {
  final VeyraApi _api = VeyraApi();
  final VeyraSession _session = VeyraSession.instance;
  bool _opening = false;

  @override
  void dispose() {
    _api.close();
    super.dispose();
  }

  Future<({String userId, int credits})> _ensureCloudUser() async {
    await _session.load(_api);
    if (!_session.signedIn) {
      final ok = await _session.ensureCloudSession(_api);
      if (!ok) throw Exception('Veyra Cloud oturumu oluşturulamadı.');
    }
    _api.setToken(_session.token);
    final userId = _session.userId;
    if (userId == null || userId.isEmpty) throw Exception('Kullanıcı kimliği bulunamadı.');
    var credits = 0;
    try {
      credits = await _api.walletCredits(userId);
    } catch (_) {}
    return (userId: userId, credits: credits);
  }

  Future<void> _openImageToVideo() async {
    if (_opening) return;
    setState(() => _opening = true);
    try {
      final cloud = await _ensureCloudUser();
      if (!mounted) return;
      await Navigator.of(context).push<Map<String, dynamic>>(
        MaterialPageRoute(
          builder: (_) => ImageToVideoScreen(
            userId: cloud.userId,
            credits: cloud.credits,
            api: _api,
            onWallet: () async {
              if (!mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Kredi Merkezi ana Veyra ekranında açık.')),
              );
            },
          ),
        ),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Image to Video açılamadı: $e')));
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  Future<void> _openMyVideos() async {
    if (_opening) return;
    setState(() => _opening = true);
    try {
      final cloud = await _ensureCloudUser();
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => MyVideosScreen(userId: cloud.userId, api: _api)),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Videolarım açılamadı: $e')));
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  Future<void> _openVideoWorkspace() async {
    if (_opening) return;
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(8, 4, 8, 12),
                child: Text('Veyra Video', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
              ),
              Card(
                child: ListTile(
                  leading: const Icon(Icons.photo_camera_back_outlined, color: Colors.cyanAccent),
                  title: const Text('Image to Video', style: TextStyle(fontWeight: FontWeight.w900)),
                  subtitle: const Text('Galeriden görsel seç, Runway Gen-4.5 ile videoya dönüştür.'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _openImageToVideo();
                  },
                ),
              ),
              Card(
                child: ListTile(
                  leading: const Icon(Icons.video_library_outlined, color: Colors.purpleAccent),
                  title: const Text('Videolarım', style: TextStyle(fontWeight: FontWeight.w900)),
                  subtitle: const Text('Generation geçmişini gör, durumu yenile ve tamamlanan videoyu oynat.'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _openMyVideos();
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          const Positioned.fill(child: legacy.CreatorAIApp()),
          Positioned(
            right: 18,
            bottom: 92,
            child: SafeArea(
              child: Material(
                color: Colors.transparent,
                elevation: 12,
                borderRadius: BorderRadius.circular(28),
                child: FilledButton.icon(
                  key: const Key('open_video_workspace'),
                  onPressed: _opening ? null : _openVideoWorkspace,
                  icon: _opening
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.video_collection_outlined),
                  label: const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Text('Veyra Video'),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
