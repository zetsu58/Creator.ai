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

  Future<Map<String, dynamic>> _decode(http.Response response) async {
    if (response.body.isEmpty) return <String, dynamic>{};
    final value = jsonDecode(response.body);
    if (value is Map<String, dynamic>) return value;
    return <String, dynamic>{'data': value};
  }

  Future<bool> health() async {
    try {
      final response = await _client
          .get(_uri('/health'))
          .timeout(const Duration(seconds: 6));
      if (response.statusCode != 200) return false;
      final body = await _decode(response);
      return body['ok'] == true;
    } catch (_) {
      return false;
    }
  }

  Future<int> walletCredits(String userId) async {
    final response = await _client
        .get(_uri('/v1/users/$userId/wallet'))
        .timeout(const Duration(seconds: 8));
    if (response.statusCode != 200) {
      throw Exception('Wallet request failed: ${response.statusCode}');
    }
    final body = await _decode(response);
    return (body['credits'] as num).toInt();
  }

  Future<int> quote({
    required String type,
    int seconds = 0,
    String quality = 'fast',
    bool audio = false,
  }) async {
    final response = await _client
        .post(
          _uri('/v1/quote'),
          headers: {'content-type': 'application/json'},
          body: jsonEncode({
            'type': type,
            if (seconds > 0) 'seconds': seconds,
            'quality': quality.toLowerCase(),
            'audio': audio,
          }),
        )
        .timeout(const Duration(seconds: 8));
    final body = await _decode(response);
    if (response.statusCode != 200) {
      throw Exception(body['error'] ?? 'Quote request failed');
    }
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
  }) async {
    final response = await _client
        .post(
          _uri('/v1/generations'),
          headers: {'content-type': 'application/json'},
          body: jsonEncode({
            'userId': userId,
            'type': type,
            'prompt': prompt,
            if (seconds > 0) 'seconds': seconds,
            'quality': quality.toLowerCase(),
            'audio': audio,
            'aspectRatio': aspectRatio,
          }),
        )
        .timeout(const Duration(seconds: 12));
    final body = await _decode(response);
    if (response.statusCode != 202) {
      if (response.statusCode == 402) {
        throw Exception('Yetersiz kredi. Gerekli: ${body['required']}, mevcut: ${body['available']}');
      }
      throw Exception(body['error'] ?? 'Generation request failed');
    }
    return body;
  }

  Future<Map<String, dynamic>> generation(String id) async {
    final response = await _client
        .get(_uri('/v1/generations/$id'))
        .timeout(const Duration(seconds: 8));
    final body = await _decode(response);
    if (response.statusCode != 200) {
      throw Exception(body['error'] ?? 'Generation status failed');
    }
    return body;
  }

  void close() => _client.close();
}
