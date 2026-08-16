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

  Future<bool> health() async {
    try {
      final response = await _client
          .get(_uri('/health'))
          .timeout(const Duration(seconds: 5));
      if (response.statusCode != 200) return false;
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      return body['ok'] == true;
    } catch (_) {
      return false;
    }
  }

  Future<int> walletCredits(String userId) async {
    final response = await _client.get(_uri('/v1/users/$userId/wallet'));
    if (response.statusCode != 200) {
      throw Exception('Wallet request failed: ${response.statusCode}');
    }
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return (body['credits'] as num).toInt();
  }

  Future<int> quoteVideo({
    required int seconds,
    required String quality,
    required bool audio,
  }) async {
    final response = await _client.post(
      _uri('/v1/quote'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({
        'type': 'video',
        'seconds': seconds,
        'quality': quality.toLowerCase() == 'pro' ? 'pro' : 'fast',
        'audio': audio,
      }),
    );
    if (response.statusCode != 200) {
      throw Exception('Quote request failed: ${response.statusCode}');
    }
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return (body['credits'] as num).toInt();
  }

  Future<Map<String, dynamic>> createVideo({
    required String userId,
    required String prompt,
    required int seconds,
    required String quality,
    required bool audio,
    required String aspectRatio,
  }) async {
    final response = await _client.post(
      _uri('/v1/generations'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({
        'userId': userId,
        'type': 'video',
        'prompt': prompt,
        'seconds': seconds,
        'quality': quality.toLowerCase() == 'pro' ? 'pro' : 'fast',
        'audio': audio,
        'aspectRatio': aspectRatio,
      }),
    );
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode != 202) {
      throw Exception(body['error'] ?? 'Generation request failed');
    }
    return body;
  }

  void close() => _client.close();
}
