import 'dart:convert';
import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';

import '../api/veyra_api.dart';

class VeyraSession {
  VeyraSession._();
  static final instance = VeyraSession._();

  static const _deviceKeyPref = 'veyra_device_key_v1';
  static const _userIdPref = 'veyra_user_id_v1';
  static const _tokenPref = 'veyra_session_token_v1';

  String? userId;
  String? token;
  String? deviceKey;

  bool get signedIn => userId != null && userId!.isNotEmpty;

  Future<void> load(VeyraApi api) async {
    final prefs = await SharedPreferences.getInstance();
    deviceKey = prefs.getString(_deviceKeyPref);
    userId = prefs.getString(_userIdPref);
    token = prefs.getString(_tokenPref);
    api.setToken(token);

    if (deviceKey == null || deviceKey!.length < 8) {
      deviceKey = _newDeviceKey();
      await prefs.setString(_deviceKeyPref, deviceKey!);
    }
  }

  Future<bool> ensureCloudSession(VeyraApi api) async {
    await load(api);
    if (!api.configured) return false;

    try {
      final body = await api.anonymousAuth(deviceKey!);
      final nextUserId = body['userId'];
      if (nextUserId is! String || nextUserId.isEmpty) return false;
      final nextToken = body['token'];

      userId = nextUserId;
      if (nextToken is String && nextToken.isNotEmpty) token = nextToken;
      api.setToken(token);

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_userIdPref, userId!);
      if (token != null && token!.isNotEmpty) {
        await prefs.setString(_tokenPref, token!);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> clearAccountSession(VeyraApi api, {bool keepDeviceKey = true}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_userIdPref);
    await prefs.remove(_tokenPref);
    if (!keepDeviceKey) {
      await prefs.remove(_deviceKeyPref);
      deviceKey = null;
    }
    userId = null;
    token = null;
    api.setToken(null);
  }

  String _newDeviceKey() {
    final random = Random.secure();
    final bytes = List<int>.generate(32, (_) => random.nextInt(256));
    return base64UrlEncode(bytes).replaceAll('=', '');
  }
}
