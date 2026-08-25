import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../core/api/veyra_api.dart';
import '../core/api/veyra_generation_api.dart';
import 'video_player_screen.dart';

class ImageToVideoScreen extends StatefulWidget {
  const ImageToVideoScreen({
    super.key,
    required this.userId,
    required this.credits,
    required this.api,
    required this.onWallet,
  });

  final String userId;
  final int credits;
  final VeyraApi api;
  final Future<void> Function() onWallet;

  @override
  State<ImageToVideoScreen> createState() => _ImageToVideoScreenState();
}

class _ImageToVideoScreenState extends State<ImageToVideoScreen> {
  final _prompt = TextEditingController();
  final _picker = ImagePicker();
  final _generationApi = VeyraGenerationApi();

  XFile? _file;
  Uint8List? _previewBytes;
  String? _uploadedUrl;
  Map<String, dynamic>? _job;
  String _quality = 'fast';
  String _ratio = '9:16';
  int _seconds = 8;
  bool _audio = true;
  bool _uploading = false;
  bool _generating = false;
  String? _status;
  String? _uploadError;

  bool get _busy => _uploading || _generating;

  @override
  void dispose() {
    _prompt.dispose();
    _generationApi.close();
    super.dispose();
  }

  Future<void> _pickImage() async {
    if (_busy) return;
    final picked = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 95);
    if (picked == null) return;
    final bytes = await picked.readAsBytes();
    if (!mounted) return;
    setState(() {
      _file = picked;
      _previewBytes = bytes;
      _uploadedUrl = null;
      _uploadError = null;
      _job = null;
      _status = 'Görsel seçildi. Generate sırasında güvenli şekilde yüklenecek.';
    });
  }

  void _removeImage() {
    if (_busy) return;
    setState(() {
      _file = null;
      _previewBytes = null;
      _uploadedUrl = null;
      _uploadError = null;
      _job = null;
      _status = null;
    });
  }

  String _mimeFor(XFile file) {
    final mime = file.mimeType?.toLowerCase();
    if (mime == 'image/jpeg' || mime == 'image/png' || mime == 'image/webp') return mime!;
    final name = file.name.toLowerCase();
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }

  Future<String> _ensureUploaded() async {
    if (_uploadedUrl != null && _uploadedUrl!.isNotEmpty) return _uploadedUrl!;
    final file = _file;
    final bytes = _previewBytes;
    if (file == null || bytes == null) throw Exception('Önce bir görsel seç');
    if (!mounted) throw Exception('Ekran kapatıldı');
    setState(() {
      _uploading = true;
      _uploadError = null;
      _status = 'Görsel Veyra güvenli depolamasına yükleniyor...';
    });
    try {
      final result = await _generationApi.uploadImage(
        userId: widget.userId,
        bytes: bytes,
        mimeType: _mimeFor(file),
        token: widget.api.token,
      );
      final url = '${result['url'] ?? ''}'.trim();
      if (url.isEmpty) throw Exception('Upload URL alınamadı');
      if (mounted) setState(() {
        _uploadedUrl = url;
        _status = 'Görsel yüklendi. Video oluşturuluyor...';
      });
      return url;
    } catch (e) {
      if (mounted) setState(() {
        _uploadError = '$e';
        _status = 'Görsel yüklenemedi.';
      });
      rethrow;
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _generate() async {
    if (_busy) return;
    if (_file == null || _previewBytes == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Önce bir görsel seç')));
      return;
    }
    final text = _prompt.text.trim();
    if (text.length < 3) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Video için en az 3 karakterlik bir prompt yaz.')));
      return;
    }

    setState(() {
      _generating = true;
      _job = null;
    });
    try {
      final imageUrl = await _ensureUploaded();
      if (!mounted) return;
      setState(() => _status = 'Runway Gen-4.5 görevi oluşturuluyor...');
      final created = await _generationApi.createImageToVideo(
        userId: widget.userId,
        prompt: text,
        imageUrl: imageUrl,
        seconds: _seconds,
        quality: _quality,
        aspectRatio: _ratio,
        audio: _audio,
        token: widget.api.token,
      );
      if (!mounted) return;
      setState(() {
        _job = created;
        _status = 'Generation başladı • ${created['status'] ?? 'processing'}';
      });
      await _poll('${created['id']}');
    } catch (e) {
      if (mounted) setState(() => _status = 'İşlem başarısız: $e');
    } finally {
      if (mounted) setState(() => _generating = false);
    }
  }

  Future<void> _poll(String id) async {
    for (var attempt = 0; attempt < 40; attempt++) {
      if (!mounted) return;
      final current = await _generationApi.generationStatus(id: id, token: widget.api.token);
      final status = '${current['status'] ?? ''}';
      if (!mounted) return;
      setState(() {
        _job = current;
        _status = 'Generation • $status';
      });
      if (status == 'completed') {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Video hazır. Videolarım bölümünde de görüntülenebilir.')));
        return;
      }
      if (status == 'failed' || status == 'refunded') {
        final refunded = status == 'refunded' ? ' Kredi otomatik iade edildi.' : '';
        setState(() => _status = 'Generation başarısız.$refunded');
        return;
      }
      await Future<void>.delayed(const Duration(seconds: 5));
    }
    if (mounted) setState(() => _status = 'Generation devam ediyor. Videolarım bölümünden durumu yenileyebilirsin.');
  }

  @override
  Widget build(BuildContext context) {
    final status = '${_job?['status'] ?? ''}';
    final outputUrl = '${_job?['outputUrl'] ?? ''}'.trim();
    return Scaffold(
      appBar: AppBar(title: const Text('Image to Video')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 900),
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const Text('Fotoğrafını Runway Gen-4.5 ile videoya dönüştür', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
              const SizedBox(height: 8),
              const Text('Galeriden JPG, PNG veya WEBP seç. Görsel önce Veyra Blob’a yüklenir, ardından Image-to-Video generation başlar.', style: TextStyle(color: Colors.white60)),
              const SizedBox(height: 18),
              if (_previewBytes == null)
                OutlinedButton.icon(
                  key: const Key('image_to_video_pick'),
                  onPressed: _busy ? null : _pickImage,
                  icon: const Icon(Icons.add_photo_alternate_outlined),
                  label: const Padding(padding: EdgeInsets.symmetric(vertical: 18), child: Text('Galeriden görsel seç')),
                )
              else
                Card(
                  clipBehavior: Clip.antiAlias,
                  child: Column(
                    children: [
                      AspectRatio(aspectRatio: 16 / 10, child: Image.memory(_previewBytes!, fit: BoxFit.cover, width: double.infinity)),
                      Padding(
                        padding: const EdgeInsets.all(12),
                        child: Row(children: [
                          Expanded(child: Text(_file?.name ?? 'Görsel', maxLines: 1, overflow: TextOverflow.ellipsis)),
                          TextButton.icon(onPressed: _busy ? null : _pickImage, icon: const Icon(Icons.swap_horiz), label: const Text('Değiştir')),
                          TextButton.icon(onPressed: _busy ? null : _removeImage, icon: const Icon(Icons.delete_outline), label: const Text('Kaldır')),
                        ]),
                      ),
                    ],
                  ),
                ),
              if (_uploading) ...[
                const SizedBox(height: 10),
                const LinearProgressIndicator(),
                const SizedBox(height: 6),
                const Text('Görsel yükleniyor...', style: TextStyle(color: Colors.white60)),
              ],
              if (_uploadError != null) ...[
                const SizedBox(height: 10),
                Card(child: ListTile(
                  leading: const Icon(Icons.error_outline, color: Colors.orangeAccent),
                  title: const Text('Upload başarısız'),
                  subtitle: Text(_uploadError!),
                  trailing: TextButton(onPressed: _busy ? null : () async { try { await _ensureUploaded(); } catch (_) {} }, child: const Text('Tekrar dene')),
                )),
              ],
              const SizedBox(height: 16),
              TextField(
                controller: _prompt,
                minLines: 4,
                maxLines: 8,
                decoration: const InputDecoration(labelText: 'Video promptu', hintText: 'Örn. Kamera yavaşça yaklaşırken saçları rüzgarda hareket etsin...'),
              ),
              const SizedBox(height: 14),
              Wrap(spacing: 8, runSpacing: 8, children: ['fast', 'pro'].map((v) => ChoiceChip(label: Text(v == 'fast' ? 'Fast' : 'Pro'), selected: _quality == v, onSelected: _busy ? null : (_) => setState(() => _quality = v))).toList()),
              const SizedBox(height: 10),
              Wrap(spacing: 8, runSpacing: 8, children: ['9:16', '16:9', '1:1'].map((v) => ChoiceChip(label: Text(v), selected: _ratio == v, onSelected: _busy ? null : (_) => setState(() => _ratio = v))).toList()),
              const SizedBox(height: 16),
              Text('Süre: $_seconds saniye', style: const TextStyle(fontWeight: FontWeight.w800)),
              Slider(value: _seconds.toDouble(), min: 4, max: 20, divisions: 4, onChanged: _busy ? null : (v) => setState(() => _seconds = v.round())),
              SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, value: _audio, onChanged: _busy ? null : (v) => setState(() => _audio = v), title: const Text('Ses planını kullan')),
              const SizedBox(height: 10),
              FilledButton.icon(
                key: const Key('image_to_video_generate'),
                onPressed: _busy ? null : _generate,
                icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.auto_awesome),
                label: Padding(padding: const EdgeInsets.symmetric(vertical: 14), child: Text(_busy ? 'İşleniyor...' : 'Generate')),
              ),
              if (_status != null) ...[
                const SizedBox(height: 14),
                Card(child: ListTile(leading: const Icon(Icons.info_outline), title: Text(_status!))),
              ],
              if (_job != null) ...[
                const SizedBox(height: 10),
                Card(child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('Generation', style: TextStyle(fontWeight: FontWeight.w900)),
                    const SizedBox(height: 8),
                    Text('ID: ${_job!['id']}'),
                    Text('Durum: $status'),
                    Text('Provider: ${_job!['provider'] ?? 'runway'}'),
                    if (status == 'refunded') const Text('Kredi otomatik iade edildi.', style: TextStyle(color: Colors.orangeAccent)),
                    if (status == 'completed' && outputUrl.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      FilledButton.icon(
                        key: const Key('image_to_video_play'),
                        onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => VeyraVideoPlayerScreen(url: outputUrl, title: 'Veyra Image to Video'),
                        )),
                        icon: const Icon(Icons.play_arrow),
                        label: const Text('Videoyu oynat'),
                      ),
                    ],
                    const SizedBox(height: 12),
                    FilledButton.tonalIcon(
                      onPressed: () => Navigator.of(context).pop(_job),
                      icon: const Icon(Icons.folder_outlined),
                      label: const Text('Projects’e ekle'),
                    ),
                  ]),
                )),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
