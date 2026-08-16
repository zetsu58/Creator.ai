import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

enum VeyraApiErrorKind {
  configuration,
  dns,
  network,
  timeout,
  authentication,
  payment,
  provider,
  backend,
  http,
  invalidResponse,
}

class VeyraApiException implements Exception {
  const VeyraApiException(
    this.kind,
    this.message, {
    this.statusCode,
    this.code,
    this.endpoint,
  });

  final VeyraApiErrorKind kind;
  final String message;
  final int? statusCode;
  final String? code;
  final String? endpoint;

  String get label {
    switch (kind) {
      case VeyraApiErrorKind.configuration:
        return 'Yapılandırma';
      case VeyraApiErrorKind.dns:
        return 'DNS';
      case VeyraApiErrorKind.network:
        return 'Ağ';
      case VeyraApiErrorKind.timeout:
        return 'Zaman aşımı';
      case VeyraApiErrorKind.authentication:
        return 'Kimlik doğrulama';
      case VeyraApiErrorKind.payment:
        return 'Kredi/ödeme';
      case VeyraApiErrorKind.provider:
        return 'AI sağlayıcı';
      case VeyraApiErrorKind.backend:
        return 'Backend';
      case VeyraApiErrorKind.http:
        return 'HTTP';
      case VeyraApiErrorKind.invalidResponse:
        return 'Geçersiz yanıt';
    }
  }

  @override
  String toString() {
    final status = statusCode == null ? '' : ' (HTTP $statusCode)';
    final errorCode = code == null || code!.isEmpty ? '' : ' [$code]';
    return '$label$status$errorCode: $message';
  }
}

class VeyraApi {
  VeyraApi({http.Client? client, String? token})
      : _client = client ?? http.Client(),
        _token = token;

  final http.Client _client;
  String? _token;

  static const String baseUrl = String.fromEnvironment(
    'VEYRA_API_BASE_URL',
    defaultValue: 'https://veyra-ai-xsp3.onrender.com',
  );

  bool get configured => baseUrl.trim().isNotEmpty;
  String? get token => _token;

  void setToken(String? token) => _token = token;

  Map<String, String> _headers({bool json = false}) {
    final headers = <String, String>{};
    if (json) headers['content-type'] = 'application/json';
    final token = _token;
    if (token != null && token.isNotEmpty) {
      headers['authorization'] = 'Bearer $token';
    }
    return headers;
  }

  Uri _uri(String path) {
    if (!configured) {
      throw const VeyraApiException(
        VeyraApiErrorKind.configuration,
        'VEYRA_API_BASE_URL yapılandırılmadı',
      );
    }
    return Uri.parse('$baseUrl$path');
  }

  VeyraApiException _transportError(Object error, String path) {
    final text = error.toString();
    final lower = text.toLowerCase();
    if (lower.contains('failed host lookup') ||
        lower.contains('name or service not known') ||
        lower.contains('nodename nor servname') ||
        lower.contains('dns')) {
      return VeyraApiException(
        VeyraApiErrorKind.dns,
        'Sunucu adı çözümlenemedi. İnternet/DNS bağlantısını kontrol edin.',
        endpoint: path,
      );
    }
    return VeyraApiException(
      VeyraApiErrorKind.network,
      text.replaceFirst('ClientException: ', ''),
      endpoint: path,
    );
  }

  Future<http.Response> _request(
    String path,
    Future<http.Response> Function(Uri uri) send, {
    Duration timeout = const Duration(seconds: 30),
  }) async {
    final uri = _uri(path);
    try {
      return await send(uri).timeout(timeout);
    } on TimeoutException {
      throw VeyraApiException(
        VeyraApiErrorKind.timeout,
        'Sunucu $timeout içinde yanıt vermedi.',
        endpoint: path,
      );
    } on http.ClientException catch (e) {
      throw _transportError(e, path);
    } catch (e) {
      if (e is VeyraApiException) rethrow;
      throw _transportError(e, path);
    }
  }

  Future<Map<String, dynamic>> _json(
    http.Response response, {
    int? expected,
    String? endpoint,
  }) async {
    Map<String, dynamic> body;
    if (response.body.isEmpty) {
      body = <String, dynamic>{};
    } else {
      try {
        final decoded = jsonDecode(response.body);
        body = decoded is Map<String, dynamic>
            ? decoded
            : <String, dynamic>{'data': decoded};
      } catch (_) {
        throw VeyraApiException(
          VeyraApiErrorKind.invalidResponse,
          'Sunucu JSON olmayan/geçersiz bir yanıt döndürdü.',
          statusCode: response.statusCode,
          endpoint: endpoint,
        );
      }
    }

    final failed = expected != null
        ? response.statusCode != expected
        : response.statusCode >= 400;
    if (!failed) return body;

    final code = '${body['error'] ?? body['code'] ?? ''}'.trim();
    final detail = '${body['detail'] ?? body['message'] ?? body['reason'] ?? code}'.trim();
    final providerish = code.contains('provider') ||
        code.contains('huggingface') ||
        code.contains('replicate') ||
        detail.toLowerCase().contains('provider');

    VeyraApiErrorKind kind;
    if (response.statusCode == 401 || response.statusCode == 403) {
      kind = VeyraApiErrorKind.authentication;
    } else if (response.statusCode == 402) {
      kind = VeyraApiErrorKind.payment;
    } else if (providerish || response.statusCode == 424) {
      kind = VeyraApiErrorKind.provider;
    } else if (response.statusCode >= 500) {
      kind = VeyraApiErrorKind.backend;
    } else {
      kind = VeyraApiErrorKind.http;
    }

    throw VeyraApiException(
      kind,
      detail.isEmpty ? 'İstek başarısız oldu.' : detail,
      statusCode: response.statusCode,
      code: code.isEmpty ? null : code,
      endpoint: endpoint,
    );
  }

  /// Readiness probe only. It must never be a hard gate for real API calls.
  ///
  /// On a transient health failure we return true so callers that historically
  /// used this probe as a precondition still continue to the real endpoint.
  /// The following auth/wallet/generation request then reports the actual,
  /// actionable network/HTTP error.
  Future<bool> health() async {
    if (!configured) return false;
    const path = '/health';
    try {
      final response = await _request(
        path,
        (uri) => _client.get(uri, headers: _headers()),
        timeout: const Duration(seconds: 12),
      );
      if (response.statusCode != 200) return true;
      final body = await _json(response, expected: 200, endpoint: path);
      return body['ok'] == true;
    } catch (_) {
      return true;
    }
  }

  Future<Map<String, dynamic>> anonymousAuth(String deviceKey) async {
    const path = '/v1/auth/anonymous';
    final response = await _request(
      path,
      (uri) => _client.post(
        uri,
        headers: _headers(json: true),
        body: jsonEncode({'deviceKey': deviceKey}),
      ),
      timeout: const Duration(seconds: 45),
    );
    final body = await _json(response, expected: 201, endpoint: path);
    final nextToken = body['token'];
    if (nextToken is String && nextToken.isNotEmpty) _token = nextToken;
    return body;
  }

  Future<Map<String, dynamic>> wallet(String userId) async {
    final path = '/v1/users/$userId/wallet';
    return _json(
      await _request(path, (uri) => _client.get(uri, headers: _headers())),
      expected: 200,
      endpoint: path,
    );
  }

  Future<int> walletCredits(String userId) async =>
      ((await wallet(userId))['credits'] as num).toInt();

  Future<List<Map<String, dynamic>>> walletLedger(String userId) async {
    final path = '/v1/users/$userId/wallet/ledger';
    final body = await _json(
      await _request(path, (uri) => _client.get(uri, headers: _headers())),
      expected: 200,
      endpoint: path,
    );
    return (body['items'] as List<dynamic>? ?? const [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
  }

  Future<Map<String, dynamic>> storeProducts() async {
    const path = '/v1/store/products';
    return _json(
      await _request(path, (uri) => _client.get(uri, headers: _headers())),
      expected: 200,
      endpoint: path,
    );
  }

  Future<List<Map<String, dynamic>>> purchases(String userId) async {
    final path = '/v1/users/$userId/purchases';
    final body = await _json(
      await _request(path, (uri) => _client.get(uri, headers: _headers())),
      expected: 200,
      endpoint: path,
    );
    return (body['items'] as List<dynamic>? ?? const [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
  }

  Future<Map<String, dynamic>> verifyPurchase({
    required String userId,
    required String platform,
    required String productId,
    required String transactionId,
    required String purchaseToken,
  }) async {
    const path = '/v1/purchases/verify';
    final response = await _request(
      path,
      (uri) => _client.post(
        uri,
        headers: _headers(json: true),
        body: jsonEncode({
          'userId': userId,
          'platform': platform,
          'productId': productId,
          'transactionId': transactionId,
          'purchaseToken': purchaseToken,
        }),
      ),
    );
    return _json(response, endpoint: path);
  }

  Future<List<Map<String, dynamic>>> userGenerations(String userId) async {
    final path = '/v1/users/$userId/generations';
    final body = await _json(
      await _request(path, (uri) => _client.get(uri, headers: _headers())),
      expected: 200,
      endpoint: path,
    );
    return (body['items'] as List<dynamic>? ?? const [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
  }

  Future<int> quote({
    required String type,
    int seconds = 0,
    String quality = 'fast',
    bool audio = false,
    bool draft = false,
  }) async {
    const path = '/v1/quote';
    final response = await _request(
      path,
      (uri) => _client.post(
        uri,
        headers: _headers(json: true),
        body: jsonEncode({
          'type': type,
          'seconds': seconds,
          'quality': quality,
          'audio': audio,
          'draft': draft,
        }),
      ),
      timeout: const Duration(seconds: 45),
    );
    return ((await _json(response, expected: 200, endpoint: path))['credits'] as num)
        .toInt();
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
    const path = '/v1/generations';
    final response = await _request(
      path,
      (uri) => _client.post(
        uri,
        headers: _headers(json: true),
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
      ),
      timeout: const Duration(seconds: 60),
    );
    return _json(response, expected: 202, endpoint: path);
  }

  Future<Map<String, dynamic>> generation(String id) async {
    final path = '/v1/generations/$id';
    return _json(
      await _request(path, (uri) => _client.get(uri, headers: _headers())),
      expected: 200,
      endpoint: path,
    );
  }

  Future<Map<String, dynamic>> reportGeneration({
    required String id,
    required String userId,
    required String reason,
    String details = '',
  }) async {
    final path = '/v1/generations/$id/report';
    final response = await _request(
      path,
      (uri) => _client.post(
        uri,
        headers: _headers(json: true),
        body: jsonEncode({'userId': userId, 'reason': reason, 'details': details}),
      ),
    );
    return _json(response, expected: 201, endpoint: path);
  }

  Future<Map<String, dynamic>> copilotPlan({
    required String userId,
    required String message,
    String? projectId,
  }) async {
    const path = '/v1/copilot/plan';
    final response = await _request(
      path,
      (uri) => _client.post(
        uri,
        headers: _headers(json: true),
        body: jsonEncode({
          'userId': userId,
          'message': message,
          if (projectId != null) 'projectId': projectId,
        }),
      ),
    );
    return _json(response, expected: 200, endpoint: path);
  }

  Future<Map<String, dynamic>> brandKit(String userId) async {
    final path = '/v1/business/$userId/brand-kit';
    return _json(
      await _request(path, (uri) => _client.get(uri, headers: _headers())),
      expected: 200,
      endpoint: path,
    );
  }

  Future<Map<String, dynamic>> saveBrandKit({
    required String userId,
    required String name,
    required List<String> colors,
    String slogan = '',
  }) async {
    final path = '/v1/business/$userId/brand-kit';
    final response = await _request(
      path,
      (uri) => _client.put(
        uri,
        headers: _headers(json: true),
        body: jsonEncode({'name': name, 'colors': colors, 'slogan': slogan}),
      ),
    );
    return _json(response, expected: 200, endpoint: path);
  }

  Future<Map<String, dynamic>> createBatch({
    required String userId,
    required int count,
    required String operation,
  }) async {
    const path = '/v1/business/batch';
    final response = await _request(
      path,
      (uri) => _client.post(
        uri,
        headers: _headers(json: true),
        body: jsonEncode({'userId': userId, 'count': count, 'operation': operation}),
      ),
    );
    return _json(response, expected: 202, endpoint: path);
  }

  Future<Map<String, dynamic>> deleteAccount(String userId) async {
    final path = '/v1/users/$userId';
    return _json(
      await _request(path, (uri) => _client.delete(uri, headers: _headers())),
      expected: 202,
      endpoint: path,
    );
  }

  void close() => _client.close();
}
