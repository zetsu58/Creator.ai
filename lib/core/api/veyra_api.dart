import 'dart:convert';

import 'package:http/http.dart' as http;

class VeyraApi {
  VeyraApi({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  static const String baseUrl = String.fromEnvironment(
    'VEYRA_API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8080',
  );

  Uri _uri(String path) => Uri.parse('$baseUrl$path');

  Future<Map<String, dynamic>> _json(http.Response response, {int? expected}) async {
    final body = response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body) as Map<String, dynamic>;
    if (expected != null && response.statusCode != expected) {
      throw Exception(body['error'] ?? 'HTTP ${response.statusCode}');
    }
    if (expected == null && response.statusCode >= 400) {
      throw Exception(body['error'] ?? 'HTTP ${response.statusCode}');
    }
    return body;
  }

  Future<bool> health() async {
    try {
      final response = await _client.get(_uri('/health')).timeout(const Duration(seconds: 5));
      if (response.statusCode != 200) return false;
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      return body['ok'] == true;
    } catch (_) {
      return false;
    }
  }

  Future<int> walletCredits(String userId) async {
    final body = await _json(await _client.get(_uri('/v1/users/$userId/wallet')), expected: 200);
    return (body['credits'] as num).toInt();
  }

  Future<List<Map<String, dynamic>>> userGenerations(String userId) async {
    final body = await _json(await _client.get(_uri('/v1/users/$userId/generations')), expected: 200);
    final items = (body['items'] as List<dynamic>? ?? const []);
    return items.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<int> quote({
    required String type,
    int seconds = 0,
    String quality = 'fast',
    bool audio = false,
    bool draft = false,
  }) async {
    final response = await _client.post(
      _uri('/v1/quote'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({'type': type, 'seconds': seconds, 'quality': quality, 'audio': audio, 'draft': draft}),
    );
    final body = await _json(response, expected: 200);
    return (body['credits'] as num).toInt();
  }

  Future<Map<String, dynamic>> createGeneration({
    required String userId,
    required String type,
    required String prompt,
    int seconds = 0,
    String quality = 'fast',
    bool audio = false,
    String aspectRatio = '9:16',
    bool draft = false,
    List<String> references = const [],
    bool brandKit = false,
    bool captions = false,
  }) async {
    final response = await _client.post(
      _uri('/v1/generations'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({
        'userId': userId,
        'type': type,
        'prompt': prompt,
        'seconds': seconds,
        'quality': quality,
        'audio': audio,
        'aspectRatio': aspectRatio,
        'draft': draft,
        'references': references,
        'brandKit': brandKit,
        'captions': captions,
      }),
    );
    return _json(response, expected: 202);
  }

  Future<Map<String, dynamic>> generation(String id) async {
    return _json(await _client.get(_uri('/v1/generations/$id')), expected: 200);
  }

  Future<Map<String, dynamic>> copilotPlan({required String userId, required String message, String? projectId}) async {
    final response = await _client.post(
      _uri('/v1/copilot/plan'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({'userId': userId, 'message': message, if (projectId != null) 'projectId': projectId}),
    );
    return _json(response, expected: 200);
  }

  Future<Map<String, dynamic>> brandKit(String userId) async {
    return _json(await _client.get(_uri('/v1/business/$userId/brand-kit')), expected: 200);
  }

  Future<Map<String, dynamic>> saveBrandKit({required String userId, required String name, required List<String> colors, String slogan = ''}) async {
    final response = await _client.put(
      _uri('/v1/business/$userId/brand-kit'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({'name': name, 'colors': colors, 'slogan': slogan}),
    );
    return _json(response, expected: 200);
  }

  Future<Map<String, dynamic>> createBatch({required String userId, required int count, required String operation}) async {
    final response = await _client.post(
      _uri('/v1/business/batch'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({'userId': userId, 'count': count, 'operation': operation}),
    );
    return _json(response, expected: 202);
  }

  void close() => _client.close();
}
