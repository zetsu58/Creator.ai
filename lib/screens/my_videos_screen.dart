import 'package:flutter/material.dart';

import '../core/api/veyra_api.dart';
import '../core/api/veyra_generation_api.dart';
import 'video_player_screen.dart';

class MyVideosScreen extends StatefulWidget {
  const MyVideosScreen({super.key, required this.userId, required this.api});

  final String userId;
  final VeyraApi api;

  @override
  State<MyVideosScreen> createState() => _MyVideosScreenState();
}

class _MyVideosScreenState extends State<MyVideosScreen> {
  final _generationApi = VeyraGenerationApi();
  List<Map<String, dynamic>> _items = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _generationApi.close();
    super.dispose();
  }

  Future<void> _load() async {
    if (mounted) setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final all = await _generationApi.userGenerations(userId: widget.userId, token: widget.api.token);
      final videos = all.where((j) => '${j['type'] ?? ''}' == 'video').toList();
      if (mounted) setState(() => _items = videos);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _refreshJob(int index) async {
    final id = '${_items[index]['id'] ?? ''}';
    if (id.isEmpty) return;
    try {
      final updated = await _generationApi.generationStatus(id: id, token: widget.api.token);
      if (mounted) setState(() => _items[index] = updated);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Durum alınamadı: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Videolarım'), actions: [IconButton(onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh))]),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text('Videolar yüklenemedi: $_error', textAlign: TextAlign.center)))
              : _items.isEmpty
                  ? const Center(child: Padding(padding: EdgeInsets.all(24), child: Text('Henüz video üretimi yok.')))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _items.length,
                        itemBuilder: (context, index) {
                          final item = _items[index];
                          final status = '${item['status'] ?? 'unknown'}';
                          final outputUrl = '${item['outputUrl'] ?? ''}'.trim();
                          final prompt = '${item['prompt'] ?? ''}'.trim();
                          final inputImage = '${item['inputImageUrl'] ?? ''}'.trim();
                          final failed = status == 'failed' || status == 'refunded';
                          return Card(
                            margin: const EdgeInsets.only(bottom: 12),
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(children: [
                                    Icon(status == 'completed' ? Icons.check_circle_outline : failed ? Icons.error_outline : Icons.timelapse,
                                        color: status == 'completed' ? Colors.greenAccent : failed ? Colors.orangeAccent : Colors.cyanAccent),
                                    const SizedBox(width: 10),
                                    Expanded(child: Text(status.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w900))),
                                    IconButton(onPressed: () => _refreshJob(index), icon: const Icon(Icons.refresh)),
                                  ]),
                                  if (prompt.isNotEmpty) ...[
                                    const SizedBox(height: 8),
                                    Text(prompt, maxLines: 3, overflow: TextOverflow.ellipsis),
                                  ],
                                  if (inputImage.isNotEmpty) ...[
                                    const SizedBox(height: 10),
                                    ClipRRect(
                                      borderRadius: BorderRadius.circular(16),
                                      child: Image.network(inputImage, height: 150, width: double.infinity, fit: BoxFit.cover,
                                          errorBuilder: (_, __, ___) => const SizedBox.shrink()),
                                    ),
                                  ],
                                  if (status == 'completed' && outputUrl.isNotEmpty) ...[
                                    const SizedBox(height: 12),
                                    FilledButton.icon(
                                      onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                                        builder: (_) => VeyraVideoPlayerScreen(url: outputUrl, title: 'Veyra Video'),
                                      )),
                                      icon: const Icon(Icons.play_arrow),
                                      label: const Text('Videoyu oynat'),
                                    ),
                                  ],
                                  if (status == 'refunded') ...[
                                    const SizedBox(height: 10),
                                    const Text('Üretim başarısız oldu; kredi otomatik iade edildi.', style: TextStyle(color: Colors.orangeAccent)),
                                  ],
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}
