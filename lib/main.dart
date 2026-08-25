import 'package:flutter/material.dart';

import 'core/api/veyra_api.dart';
import 'core/auth/veyra_session.dart';
import 'core/design/creator_theme.dart';
import 'core/localization/veyra_locale.dart';
import 'main_legacy.dart' as legacy;
import 'screens/image_to_video_screen.dart';

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
  bool _openingImageToVideo = false;

  @override
  void dispose() {
    _api.close();
    super.dispose();
  }

  Future<void> _openImageToVideo() async {
    if (_openingImageToVideo) return;
    setState(() => _openingImageToVideo = true);
    try {
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
      } catch (_) {
        // Generation API will still enforce the authoritative server-side balance.
      }

      if (!mounted) return;
      await Navigator.of(context).push<Map<String, dynamic>>(
        MaterialPageRoute(
          builder: (_) => ImageToVideoScreen(
            userId: userId,
            credits: credits,
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
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Image to Video açılamadı: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _openingImageToVideo = false);
    }
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
                  key: const Key('open_image_to_video'),
                  onPressed: _openingImageToVideo ? null : _openImageToVideo,
                  icon: _openingImageToVideo
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.photo_camera_back_outlined),
                  label: const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Text('Image to Video'),
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
