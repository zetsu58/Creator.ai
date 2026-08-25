import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

class VeyraVideoPlayerScreen extends StatefulWidget {
  const VeyraVideoPlayerScreen({super.key, required this.url, this.title = 'Veyra Video'});

  final String url;
  final String title;

  @override
  State<VeyraVideoPlayerScreen> createState() => _VeyraVideoPlayerScreenState();
}

class _VeyraVideoPlayerScreenState extends State<VeyraVideoPlayerScreen> {
  late final VideoPlayerController _controller;
  bool _initializing = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _controller = VideoPlayerController.networkUrl(Uri.parse(widget.url));
    _init();
  }

  Future<void> _init() async {
    try {
      await _controller.initialize();
      await _controller.setLooping(true);
      if (mounted) setState(() => _initializing = false);
    } catch (e) {
      if (mounted) setState(() {
        _initializing = false;
        _error = '$e';
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1000),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: _initializing
                ? const CircularProgressIndicator()
                : _error != null
                    ? Card(
                        child: Padding(
                          padding: const EdgeInsets.all(20),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.error_outline, color: Colors.orangeAccent, size: 36),
                              const SizedBox(height: 12),
                              const Text('Video oynatılamadı.', style: TextStyle(fontWeight: FontWeight.w900)),
                              const SizedBox(height: 8),
                              SelectableText(_error!, textAlign: TextAlign.center),
                            ],
                          ),
                        ),
                      )
                    : Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          AspectRatio(
                            aspectRatio: _controller.value.aspectRatio > 0 ? _controller.value.aspectRatio : 16 / 9,
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(22),
                              child: VideoPlayer(_controller),
                            ),
                          ),
                          const SizedBox(height: 14),
                          ValueListenableBuilder<VideoPlayerValue>(
                            valueListenable: _controller,
                            builder: (context, value, _) {
                              final durationMs = value.duration.inMilliseconds;
                              final positionMs = value.position.inMilliseconds.clamp(0, durationMs == 0 ? 1 : durationMs);
                              return Column(
                                children: [
                                  Slider(
                                    value: positionMs.toDouble(),
                                    max: (durationMs == 0 ? 1 : durationMs).toDouble(),
                                    onChanged: (v) => _controller.seekTo(Duration(milliseconds: v.round())),
                                  ),
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      IconButton(
                                        tooltip: '10 sn geri',
                                        onPressed: () {
                                          final target = value.position - const Duration(seconds: 10);
                                          _controller.seekTo(target.isNegative ? Duration.zero : target);
                                        },
                                        icon: const Icon(Icons.replay_10),
                                      ),
                                      FilledButton.tonalIcon(
                                        onPressed: () async {
                                          value.isPlaying ? await _controller.pause() : await _controller.play();
                                          if (mounted) setState(() {});
                                        },
                                        icon: Icon(value.isPlaying ? Icons.pause : Icons.play_arrow),
                                        label: Text(value.isPlaying ? 'Duraklat' : 'Oynat'),
                                      ),
                                      IconButton(
                                        tooltip: '10 sn ileri',
                                        onPressed: () {
                                          final target = value.position + const Duration(seconds: 10);
                                          _controller.seekTo(target > value.duration ? value.duration : target);
                                        },
                                        icon: const Icon(Icons.forward_10),
                                      ),
                                    ],
                                  ),
                                ],
                              );
                            },
                          ),
                        ],
                      ),
          ),
        ),
      ),
    );
  }
}
