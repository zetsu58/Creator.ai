import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

class VeyraGenerationApi {
  VeyraGenerationApi({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  static const String baseUrl = String.fromEnvironment(
    'VEYRA_VERCEL_API_BASE_URL',
    defaultValue: 'https://veyra-ai-sigma.vercel.app',
  );

  Map<String, String> _authHeaders({String? token}) => {
        if (token != null && token.isNotEmpty) 'authorization': 'Bearer $token',
      };

  Future<Map<String, dynamic>> uploadImage({
    required String userId,
    required Uint8List bytes,
    required String mimeType,
    String? token,
  }) async {
    final uri = Uri.parse('$baseUrl/api/uploads/image');
    final response = await _client
        .post(
          uri,
          headers: {
            ..._authHeaders(token: token),
            'x-veyra-user-id': userId,
            'content-type': mimeType,
            'content-length': '${bytes.length}',
          },
          body: bytes,
        )
        .timeout(const Duration(seconds: 60));
    return _decode(response, expected: 201);
  }

  Future<Map<String, dynamic>> createImageToVideo({
    required String userId,
    required String prompt,
    required String imageUrl,
    required int seconds,
    required String quality,
    required String aspectRatio,
    required bool audio,
    String? token,
  }) async {
    final uri = Uri.parse('$baseUrl/api/generations');
    final response = await _client
        .post(
          uri,
          headers: {
            ..._authHeaders(token: token),
            'content-type': 'application/json',
          },
          body: jsonEncode({
            'userId': userId,
            'type': 'video',
            'prompt': prompt,
            'seconds': seconds,
            'quality': quality,
            'audio': audio,
            'aspectRatio': aspectRatio,
            'references': [imageUrl],
          }),
        )
        .timeout(const Duration(seconds: 75));
    return _decode(response, expected: 202);
  }

  Future<Map<String, dynamic>> generationStatus({
    required String id,
    String? token,
  }) async {
    final uri = Uri.parse('$baseUrl/api/generation-status?id=${Uri.encodeQueryComponent(id)}');
    final response = await _client
        .get(uri, headers: _authHeaders(token: token))
        .timeout(const Duration(seconds: 30));
    return _decode(response, expected: 200);
  }

  Map<String, dynamic> _decode(http.Response response, {required int expected}) {
    Map<String, dynamic> body = const {};
    if (response.body.isNotEmpty) {
      final decoded = jsonDecode(response.body);
      if (decoded is Map) body = Map<String, dynamic>.from(decoded);
    }
    if (response.statusCode != expected) {
      final message = '${body['message'] ?? body['detail'] ?? body['error'] ?? 'İstek başarısız'}';
      throw Exception(message);
    }
    return body;
  }

  void close() => _client.close();
}
