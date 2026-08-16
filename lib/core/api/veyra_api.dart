import 'dart:convert';

import 'package:http/http.dart' as http;

class VeyraApi {
  VeyraApi({http.Client? client, String? token})
      : _client = client ?? http.Client(),
        _token = token;

  final http.Client _client;
  String? _token;

  static const String baseUrl = String.fromEnvironment('VEYRA_API_BASE_URL', defaultValue: '');
  bool get configured => baseUrl.trim().isNotEmpty;
  String? get token => _token;

  void setToken(String? token) => _token = token;

  Map<String, String> _headers({bool json = false}) {
    final headers = <String, String>{};
    if (json) headers['content-type'] = 'application/json';
    final token = _token;
    if (token != null && token.isNotEmpty) headers['authorization'] = 'Bearer $token';
    return headers;
  }

  Uri _uri(String path) {
    if (!configured) throw Exception('VEYRA_API_BASE_URL yapılandırılmadı');
    return Uri.parse('$baseUrl$path');
  }

  Future<Map<String, dynamic>> _json(http.Response response, {int? expected}) async {
    final decoded = response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body);
    final body = decoded is Map<String, dynamic> ? decoded : <String, dynamic>{'data': decoded};
    if (expected != null && response.statusCode != expected) throw Exception(body['error'] ?? 'HTTP ${response.statusCode}');
    if (expected == null && response.statusCode >= 400) throw Exception(body['error'] ?? 'HTTP ${response.statusCode}');
    return body;
  }

  Future<bool> health() async {
    if (!configured) return false;
    try {
      final response = await _client.get(_uri('/health'), headers: _headers()).timeout(const Duration(seconds: 6));
      if (response.statusCode != 200) return false;
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      return body['ok'] == true;
    } catch (_) {
      return false;
    }
  }

  Future<Map<String, dynamic>> anonymousAuth(String deviceKey) async {
    final response = await _client.post(
      _uri('/v1/auth/anonymous'),
      headers: _headers(json: true),
      body: jsonEncode({'deviceKey': deviceKey}),
    );
    final body = await _json(response, expected: 201);
    final nextToken = body['token'];
    if (nextToken is String && nextToken.isNotEmpty) _token = nextToken;
    return body;
  }

  Future<Map<String, dynamic>> wallet(String userId) async =>
      _json(await _client.get(_uri('/v1/users/$userId/wallet'), headers: _headers()), expected: 200);

  Future<int> walletCredits(String userId) async => ((await wallet(userId))['credits'] as num).toInt();

  Future<List<Map<String, dynamic>>> walletLedger(String userId) async {
    final body = await _json(await _client.get(_uri('/v1/users/$userId/wallet/ledger'), headers: _headers()), expected: 200);
    return (body['items'] as List<dynamic>? ?? const []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<Map<String, dynamic>> storeProducts() async =>
      _json(await _client.get(_uri('/v1/store/products'), headers: _headers()), expected: 200);

  Future<List<Map<String, dynamic>>> purchases(String userId) async {
    final body = await _json(await _client.get(_uri('/v1/users/$userId/purchases'), headers: _headers()), expected: 200);
    return (body['items'] as List<dynamic>? ?? const []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<Map<String, dynamic>> verifyPurchase({
    required String userId,
    required String platform,
    required String productId,
    required String transactionId,
    required String purchaseToken,
  }) async {
    final response = await _client.post(
      _uri('/v1/purchases/verify'),
      headers: _headers(json: true),
      body: jsonEncode({
        'userId': userId,
        'platform': platform,
        'productId': productId,
        'transactionId': transactionId,
        'purchaseToken': purchaseToken,
      }),
    );
    return _json(response);
  }

  Future<List<Map<String, dynamic>>> userGenerations(String userId) async {
    final body = await _json(await _client.get(_uri('/v1/users/$userId/generations'), headers: _headers()), expected: 200);
    return (body['items'] as List<dynamic>? ?? const []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
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
      headers: _headers(json: true),
      body: jsonEncode({'type': type, 'seconds': seconds, 'quality': quality, 'audio': audio, 'draft': draft}),
    );
    return ((await _json(response, expected: 200))['credits'] as num).toInt();
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
    );
    return _json(response, expected: 202);
  }

  Future<Map<String, dynamic>> generation(String id) async =>
      _json(await _client.get(_uri('/v1/generations/$id'), headers: _headers()), expected: 200);

  Future<Map<String, dynamic>> reportGeneration({
    required String id,
    required String userId,
    required String reason,
    String details = '',
  }) async {
    final response = await _client.post(
      _uri('/v1/generations/$id/report'),
      headers: _headers(json: true),
      body: jsonEncode({'userId': userId, 'reason': reason, 'details': details}),
    );
    return _json(response, expected: 201);
  }

  Future<Map<String, dynamic>> copilotPlan({required String userId, required String message, String? projectId}) async {
    final response = await _client.post(
      _uri('/v1/copilot/plan'),
      headers: _headers(json: true),
      body: jsonEncode({'userId': userId, 'message': message, if (projectId != null) 'projectId': projectId}),
    );
    return _json(response, expected: 200);
  }

  Future<Map<String, dynamic>> brandKit(String userId) async =>
      _json(await _client.get(_uri('/v1/business/$userId/brand-kit'), headers: _headers()), expected: 200);

  Future<Map<String, dynamic>> saveBrandKit({
    required String userId,
    required String name,
    required List<String> colors,
    String slogan = '',
  }) async {
    final response = await _client.put(
      _uri('/v1/business/$userId/brand-kit'),
      headers: _headers(json: true),
      body: jsonEncode({'name': name, 'colors': colors, 'slogan': slogan}),
    );
    return _json(response, expected: 200);
  }

  Future<Map<String, dynamic>> createBatch({required String userId, required int count, required String operation}) async {
    final response = await _client.post(
      _uri('/v1/business/batch'),
      headers: _headers(json: true),
      body: jsonEncode({'userId': userId, 'count': count, 'operation': operation}),
    );
    return _json(response, expected: 202);
  }

  Future<Map<String, dynamic>> deleteAccount(String userId) async =>
      _json(await _client.delete(_uri('/v1/users/$userId'), headers: _headers()), expected: 202);

  void close() => _client.close();
}
